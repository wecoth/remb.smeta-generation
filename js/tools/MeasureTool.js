// ─── MeasureTool.js ───────────────────────────────────────────────
import { BaseTool } from './BaseTool.js';
import { executeCommand } from '../commands/CommandHistory.js';
import { CreateMeasureCommand } from '../commands/CreateMeasureCommand.js';
import {
  snap, setModifiers, findObjectSnapCandidate, toScreen, toWorld,
  findGuideCandidate, getNearestGuideLineAxis, projectPointToGuideLineWorld,
  shouldKeepGuideLine, getTrackingLines, snapToTrackingLines,
} from '../snapping.js';

export class MeasureTool extends BaseTool {
  constructor(ui) {
    super(ui);
    this.name = 'measure';
    this.isDrawing = false;
    this.drawStart = null;
    this.drawEnd = null;
    this.currentObjectSnap = null;
    this.currentGuideLine = null;
    
    // Поля для ввода точной длины
    this.lengthInput = '';
    this.lengthMode = false;

    // Поля для tracking-линий
    this.activeTrackingPoint = null;
    this._snapHoverTimer = null;
    this._snapHoverKey = null;

    // Для серых направляющих (с задержкой)
    this._guideHoverCandidate = null;
    this._guideHoverTimer = null;
    this._guideHoverDelay = 1000;

    // Накопленное направление движения мыши (для ортогональной привязки)
    this._mouseDirX = 0;
    this._mouseDirY = 0;
    this._lastMouseWorld = null;
  }

  activate() {
    this.reset();
    this.ui.canvas.style.cursor = 'crosshair';
  }

  deactivate() {
    clearTimeout(this._guideHoverTimer);
    this._guideHoverTimer = null;
    this._guideHoverCandidate = null;
    this.currentGuideLine = null;
    this.reset();
  }

  reset() {
    this.isDrawing = false;
    this.drawStart = null;
    this.drawEnd = null;
    this.currentObjectSnap = null;
    this.currentGuideLine = null;
    this.lengthInput = '';
    this.lengthMode = false;
    this.activeTrackingPoint = null;
    clearTimeout(this._snapHoverTimer);
    this._snapHoverTimer = null;
    this._snapHoverKey = null;
    clearTimeout(this._guideHoverTimer);
    this._guideHoverTimer = null;
    this._guideHoverCandidate = null;
    this._mouseDirX = 0;
    this._mouseDirY = 0;
    this._lastMouseWorld = null;
  }

  getCursor() {
    return 'crosshair';
  }

  updateTrackingState(snap) {
    const trackable = snap && (
      snap.type === 'endpoint' || snap.type === 'corner' ||
      snap.type === 'intersection' || snap.type === 'midpoint'
    );
    if (!trackable) {
      clearTimeout(this._snapHoverTimer);
      this._snapHoverTimer = null;
      this._snapHoverKey = null;
      this.activeTrackingPoint = null;
      return;
    }
    const key = `${snap.type}:${Math.round(snap.x)},${Math.round(snap.y)}`;
    if (key === this._snapHoverKey) return;
    clearTimeout(this._snapHoverTimer);
    this._snapHoverKey = key;
    this._snapHoverTimer = setTimeout(() => {
      this.activeTrackingPoint = { x: snap.x, y: snap.y, type: snap.type };
      this.ui.doRedraw();
    }, 1000);
  }

  getRenderState() {
    return {
      isDrawing: this.isDrawing,
      drawStart: this.drawStart,
      drawEnd: this.drawEnd,
      currentObjectSnap: this.currentObjectSnap,
      currentGuideLine: this.currentGuideLine,
      lengthMode: this.lengthMode,
      lengthInput: this.lengthInput,
      tool: this.name,
      activeTrackingPoint: this.activeTrackingPoint,
      trackingLines: this.activeTrackingPoint ? getTrackingLines(this.activeTrackingPoint) : [],
    };
  }

  onMouseDown(pos, world, e) {
  if (!this.isDrawing) {
    let startPoint;
    if (this.currentObjectSnap) {
      startPoint = { x: this.currentObjectSnap.x, y: this.currentObjectSnap.y };
    } else {
      const snapped = snap(world.x, world.y, { screenPoint: pos, tolerance: 24 });
      startPoint = { x: snapped.x, y: snapped.y };
    }
    this.isDrawing = true;
    this.drawStart = startPoint;
    this.drawEnd = { ...startPoint };
    this.lengthInput = '';
    this.lengthMode = false;
    this.ui.doRedraw();
  } else {
    let endPoint = this.getMeasureEnd(world);
    const len = Math.hypot(endPoint.x - this.drawStart.x, endPoint.y - this.drawStart.y);
    if (len > 1) {
      executeCommand(new CreateMeasureCommand(
        this.drawStart.x, this.drawStart.y,
        endPoint.x, endPoint.y
      ));
      // Цепной режим: начинаем следующее измерение от конечной точки
      this.drawStart = { x: endPoint.x, y: endPoint.y };
      this.drawEnd = { x: endPoint.x, y: endPoint.y };
      this.lengthInput = '';
      this.lengthMode = false;
      // isDrawing остаётся true
    } else {
      // Если длина нулевая, просто сбрасываем
      this.reset();
    }
    this.ui.doRedraw();
  }
  return true;
}

  onMouseMove(pos, world, e) {
    setModifiers(this.ui.shiftDown, this.ui.ctrlDown);

    // Накапливаем направление движения мыши (экспоненциальное сглаживание)
    if (this._lastMouseWorld) {
      const dx = world.x - this._lastMouseWorld.x;
      const dy = world.y - this._lastMouseWorld.y;
      const moved = Math.hypot(dx, dy);
      if (moved > 0.5) {
        const alpha = 0.25; // степень сглаживания
        this._mouseDirX = this._mouseDirX * (1 - alpha) + (dx / moved) * alpha;
        this._mouseDirY = this._mouseDirY * (1 - alpha) + (dy / moved) * alpha;
      }
    }
    this._lastMouseWorld = { x: world.x, y: world.y };
    
    this.currentObjectSnap = findObjectSnapCandidate(world, pos, {
      includeEndpoint: true,
      includeCorner: true,
      includeMidpoint: true,
      includeIntersection: true,
      includeWallPoint: true,
      includePerpendicular: false,
      tolerance: 24,
    });

    this.updateGuideLine(world, pos);
    this.updateTrackingState(this.currentObjectSnap);

    // Сбрасываем activeTrackingPoint если курсор далеко от него
    if (this.activeTrackingPoint) {
      const s = toScreen(this.activeTrackingPoint.x, this.activeTrackingPoint.y);
      const d = Math.hypot(pos.x - s.x, pos.y - s.y);
      if (d > 120) {
        this.activeTrackingPoint = null;
        clearTimeout(this._snapHoverTimer);
        this._snapHoverTimer = null;
        this._snapHoverKey = null;
      }
    }

    if (this.isDrawing && this.drawStart) {
      this.drawEnd = this.getMeasureEnd(world);
    }

    this.ui.updateCoordinatesLabel(world, this.currentObjectSnap, null);
    this.ui.doRedraw();
    return true;
  }

  onKeyDown(e) {
    if (!this.isDrawing) return false;

    // Ввод длины с клавиатуры
    if (/^[0-9]$/.test(e.key)) {
      this.lengthMode = true;
      this.lengthInput += e.key;
      e.preventDefault();
      this.ui.doRedraw();
      return true;
    }
    if (e.key === 'Backspace' && this.lengthMode) {
      this.lengthInput = this.lengthInput.slice(0, -1);
      if (!this.lengthInput) this.lengthMode = false;
      e.preventDefault();
      this.ui.doRedraw();
      return true;
    }
    if (e.key === 'Enter' && this.lengthMode && this.lengthInput) {
      const targetLen = parseFloat(this.lengthInput);
      if (!isNaN(targetLen) && targetLen > 0 && this.drawStart) {
        this.applyLength(targetLen);
      }
      this.lengthInput = '';
      this.lengthMode = false;
      e.preventDefault();
      this.ui.doRedraw();
      return true;
    }
    if (e.key === 'Escape') {
      this.reset();
      this.ui.doRedraw();
      return true;
    }
    return false;
  }

  onMouseUp(pos, world, e) { return false; }
  onKeyUp(e) { return false; }

  // ─── Направляющие (оси) ─────────────────────────────────────────
  updateGuideLine(world, screenPoint) {
  if (!this.isDrawing || !this.drawStart) {
    this.currentGuideLine = null;
    return;
  }

  // Если уже есть активная направляющая (не start-axis) — держим или сбрасываем
  if (this.currentGuideLine && this.currentGuideLine.id !== 'measure:start-axis') {
    if (shouldKeepGuideLine(screenPoint, this.currentGuideLine, 36, 48)) {
      return;
    } else {
      this.currentGuideLine = null;
    }
  }

  // Ищем кандидата под курсором
  const candidate = findGuideCandidate(screenPoint);

  // Если кандидат не изменился — ничего не делаем, ждём таймер
  if (this._guideHoverCandidate && candidate &&
      this._guideHoverCandidate.id === candidate.id) {
    return;
  }

  // Кандидат изменился → сбрасываем старый таймер
  clearTimeout(this._guideHoverTimer);
  this._guideHoverCandidate = candidate;
  this._guideHoverTimer = null;

  if (!candidate) {
    this.currentGuideLine = null;
    return;
  }

  // Запускаем таймер на активацию
  this._guideHoverTimer = setTimeout(() => {
    if (this._guideHoverCandidate && this._guideHoverCandidate === candidate) {
      this.currentGuideLine = candidate;
    }
    this._guideHoverTimer = null;
  }, this._guideHoverDelay);
}

  getMeasureEnd(world) {
  // ── Ввод точной длины с клавиатуры ──────────────────────────
  if (this.lengthMode && this.lengthInput) {
    return this.computeEndFromLength(parseFloat(this.lengthInput));
  }

  const screenPt = this.ui.mouseScreen || toScreen(world.x, world.y);

  // ── Жёсткий снап (угол, конец, пересечение) — абсолютный приоритет ──
  const objSnap = snap(world.x, world.y, { screenPoint: screenPt, tolerance: 24 });
  const hardSnap = objSnap.snapType === 'endpoint' ||
                   objSnap.snapType === 'corner' ||
                   objSnap.snapType === 'intersection';
  if (hardSnap) {
    return { x: objSnap.x, y: objSnap.y };
  }

  // ── Сырая точка без объектных снапов (как в WallTool) ───────
  const rawGrid = snap(world.x, world.y, {
    screenPoint: screenPt,
    skipObject: true,
    forceNoEndpoint: true,
    tolerance: 24,
  });

  let end;

  // ── Ортогональная привязка (без Shift, как у стен) ──────────
  if (this.drawStart) {
    const dx = rawGrid.x - this.drawStart.x;
    const dy = rawGrid.y - this.drawStart.y;
    const dist = Math.hypot(dx, dy);
    const distPx = dist * (this.ui._scale ?? 0.12);

    if (distPx > 8) {
      const angle = Math.atan2(dy, dx);
      const ANGLE_THRESHOLD = 0.09;  // ~5°
      const AXIS_SNAP_PX = 14;       // пикселей

      let lockedAngle = null;
      for (const sa of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
        let diff = angle - sa;
        diff = diff - Math.round(diff / (2 * Math.PI)) * (2 * Math.PI);
        if (Math.abs(diff) < ANGLE_THRESHOLD) {
          const cosA = Math.cos(sa), sinA = Math.sin(sa);
          const crossPx = Math.abs(-sinA * dx + cosA * dy) * (this.ui._scale ?? 0.12);
          if (crossPx <= AXIS_SNAP_PX) {
            lockedAngle = sa;
          }
          break;
        }
      }

      if (lockedAngle !== null) {
        end = {
          x: this.drawStart.x + Math.cos(lockedAngle) * dist,
          y: this.drawStart.y + Math.sin(lockedAngle) * dist,
        };
      } else {
        // Ось не нашлась — обычный snap с объектами
        end = snap(world.x, world.y, {
          screenPoint: screenPt,
          includePerpendicular: false,
          includeWallPoint: true,
          tolerance: 24,
        });
      }
    } else {
      // Слишком близко к началу — rawGrid без снапа
      end = rawGrid;
    }
  } else {
    end = rawGrid;
  }

  // ── Tracking-линии (фиолетовые лучи) ────────────────────────
  if (this.activeTrackingPoint) {
    const tLines = getTrackingLines(this.activeTrackingPoint);
    const tSnap = snapToTrackingLines(end, screenPt, tLines, 24);
    if (tSnap) {
      end = { x: tSnap.x, y: tSnap.y };
    }
  }

  // ── Объектные направляющие (guide lines) ────────────────────
  if (this.currentGuideLine) {
    if (this.currentGuideLine.id !== 'measure:start-axis') {
      const axisGuide = getNearestGuideLineAxis(screenPt, this.currentGuideLine);
      const proj = projectPointToGuideLineWorld(end, axisGuide);
      end = { x: proj.x, y: proj.y };
    }
  }

  return end;
}

  // Вычисляет конечную точку на основе заданной длины
  computeEndFromLength(targetLen) {
    if (!this.drawStart) return this.drawEnd || { x: 0, y: 0 };
    if (targetLen <= 0) return { ...this.drawStart };
    
    let dir;
    if (this.currentGuideLine) {
      dir = this.currentGuideLine.dir;
    } else {
      // Используем текущее направление от старта к мыши
      const world = this.ui.mouseScreen ? toWorld(this.ui.mouseScreen.x, this.ui.mouseScreen.y) : this.drawEnd;
      const dx = world.x - this.drawStart.x;
      const dy = world.y - this.drawStart.y;
      const len = Math.hypot(dx, dy);
      if (len > 1) {
        // Применяем ортогональную привязку к направлению
        const angle = Math.atan2(dy, dx);
        let bestAngle = angle;
        let bestDiff = Infinity;
        for (const sa of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
          const diff = Math.abs(Math.atan2(Math.sin(angle - sa), Math.cos(angle - sa)));
          if (diff < 0.15 && diff < bestDiff) {
            bestDiff = diff;
            bestAngle = sa;
          }
        }
        // Корректируем по направлению движения мыши
        const mdLen = Math.hypot(this._mouseDirX, this._mouseDirY);
        if (mdLen > 0.01) {
          const moveAngle = Math.atan2(this._mouseDirY, this._mouseDirX);
          const diffWithMove = Math.abs(Math.atan2(Math.sin(bestAngle - moveAngle), Math.cos(bestAngle - moveAngle)));
          if (diffWithMove > Math.PI / 2) {
            bestAngle = bestAngle > 0 ? bestAngle - Math.PI : bestAngle + Math.PI;
          }
        }
        dir = { x: Math.cos(bestAngle), y: Math.sin(bestAngle) };
      } else {
        dir = { x: 1, y: 0 };
      }
    }
    
    return {
      x: this.drawStart.x + dir.x * targetLen,
      y: this.drawStart.y + dir.y * targetLen,
    };
  }

  applyLength(targetLen) {
  if (!this.drawStart) return;
  const end = this.computeEndFromLength(targetLen);
  executeCommand(new CreateMeasureCommand(
    this.drawStart.x, this.drawStart.y,
    end.x, end.y
  ));
  // Цепной режим: продолжаем от конечной точки
  this.drawStart = { x: end.x, y: end.y };
  this.drawEnd = { x: end.x, y: end.y };
  this.lengthInput = '';
  this.lengthMode = false;
  this.isDrawing = true;
  this.ui.doRedraw();
  }
}
