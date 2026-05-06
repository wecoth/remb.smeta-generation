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

    // Зафиксированная ортогональная ось (null пока не выбрана)
    this._lockedOrthoAngle = null;
  }

  activate() {
    this.reset();
    this.ui.canvas.style.cursor = 'crosshair';
  }

  deactivate() {
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
    this._lockedOrthoAngle = null;
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
    }, 400);
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
      this._lockedOrthoAngle = null;
      this.ui.doRedraw();
    } else {
      let endPoint = this.getMeasureEnd(world);
      const len = Math.hypot(endPoint.x - this.drawStart.x, endPoint.y - this.drawStart.y);
      if (len > 1) {
        executeCommand(new CreateMeasureCommand(
          this.drawStart.x, this.drawStart.y,
          endPoint.x, endPoint.y
        ));
        this.drawStart = { x: endPoint.x, y: endPoint.y };
        this.drawEnd = { x: endPoint.x, y: endPoint.y };
        this.lengthInput = '';
        this.lengthMode = false;
        this._lockedOrthoAngle = null;
      } else {
        this.reset();
      }
      this.ui.doRedraw();
    }
    return true;
  }

  onMouseMove(pos, world, e) {
    setModifiers(this.ui.shiftDown, this.ui.ctrlDown);

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
      // Фиксируем ортогональную ось только когда курсор отошёл >= 30px от старта.
      // Это исключает нестабильность угла вблизи стартовой точки.
      const startScreen = toScreen(this.drawStart.x, this.drawStart.y);
      const screenDist = Math.hypot(pos.x - startScreen.x, pos.y - startScreen.y);

      if (screenDist >= 30) {
        const dx = world.x - this.drawStart.x;
        const dy = world.y - this.drawStart.y;
        const angle = Math.atan2(dy, dx);

        // Находим ближайшую ортогональную ось
        let bestAngle = null;
        let bestDiff = Infinity;
        for (const sa of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
          const diff = Math.abs(Math.atan2(Math.sin(angle - sa), Math.cos(angle - sa)));
          if (diff < bestDiff) {
            bestDiff = diff;
            bestAngle = sa;
          }
        }

        if (this._lockedOrthoAngle === null) {
          // Первая фиксация — берём лучшую ось если угол < 0.3 рад (~17°)
          if (bestDiff < 0.3) {
            this._lockedOrthoAngle = bestAngle;
          }
        } else {
          // Уже зафиксирована — переключаем только если курсор явно ушёл
          // в другую ось (порог 0.25 рад защищает от дрожания на границе)
          const lockedDiff = Math.abs(Math.atan2(
            Math.sin(angle - this._lockedOrthoAngle),
            Math.cos(angle - this._lockedOrthoAngle)
          ));
          if (bestAngle !== this._lockedOrthoAngle && lockedDiff > 0.25 && bestDiff < 0.25) {
            this._lockedOrthoAngle = bestAngle;
          }
        }
      } else {
        // Близко к старту — ось не фиксируем
        this._lockedOrthoAngle = null;
      }

      this.drawEnd = this.getMeasureEnd(world);
    }

    this.ui.updateCoordinatesLabel(world, this.currentObjectSnap, null);
    this.ui.doRedraw();
    return true;
  }

  onKeyDown(e) {
    if (!this.isDrawing) return false;

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

    if (this.currentGuideLine && this.currentGuideLine.id !== 'measure:start-axis') {
      if (shouldKeepGuideLine(screenPoint, this.currentGuideLine, 36, 48)) {
        return;
      } else {
        this.currentGuideLine = null;
      }
    }

    const candidate = findGuideCandidate(screenPoint);
    if (candidate) {
      this.currentGuideLine = candidate;
    } else {
      this.currentGuideLine = null;
    }
  }

  getMeasureEnd(world) {
    if (this.lengthMode && this.lengthInput) {
      return this.computeEndFromLength(parseFloat(this.lengthInput));
    }

    const screenPt = this.ui.mouseScreen || toScreen(world.x, world.y);

    // Базовая привязка
    let end;
    if (this.currentObjectSnap) {
      end = { x: this.currentObjectSnap.x, y: this.currentObjectSnap.y };
    } else {
      end = snap(world.x, world.y, {
        screenPoint: screenPt,
        includePerpendicular: false,
        includeWallPoint: true,
        tolerance: 24,
      });
    }

    const hardSnap = this.currentObjectSnap &&
      (this.currentObjectSnap.type === 'endpoint' ||
       this.currentObjectSnap.type === 'corner' ||
       this.currentObjectSnap.type === 'intersection');

    // ⭐ ОРТОГОНАЛЬНАЯ ПРИВЯЗКА — применяем зафиксированную ось
    // Ось фиксируется в onMouseMove после того как курсор отошёл >= 30px.
    // Это исключает перекидывание на противоположную сторону вблизи старта.
    if (!hardSnap && !this.ui.shiftDown && this.drawStart && this._lockedOrthoAngle !== null) {
      const dx = end.x - this.drawStart.x;
      const dy = end.y - this.drawStart.y;
      const len = Math.hypot(dx, dy);
      if (len > 1) {
        end = {
          x: this.drawStart.x + Math.cos(this._lockedOrthoAngle) * len,
          y: this.drawStart.y + Math.sin(this._lockedOrthoAngle) * len,
        };
      }
    }

    // Привязка к tracking-линиям
    if (this.activeTrackingPoint) {
      const tLines = getTrackingLines(this.activeTrackingPoint);
      const tSnap = snapToTrackingLines(end, screenPt, tLines, 24);
      if (tSnap) {
        end = { x: tSnap.x, y: tSnap.y };
      }
    }

    // Применение объектной направляющей
    if (this.currentGuideLine && this.currentGuideLine.id !== 'measure:start-axis') {
      const axisGuide = getNearestGuideLineAxis(screenPt, this.currentGuideLine);
      const proj = projectPointToGuideLineWorld(end, axisGuide);
      end = { x: proj.x, y: proj.y };
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
    } else if (this._lockedOrthoAngle !== null) {
      // Используем зафиксированную ось — она уже указывает в правильную сторону
      dir = { x: Math.cos(this._lockedOrthoAngle), y: Math.sin(this._lockedOrthoAngle) };
    } else {
      // Ось ещё не зафиксирована — берём сырое направление к мыши
      const world = this.ui.mouseScreen ? toWorld(this.ui.mouseScreen.x, this.ui.mouseScreen.y) : this.drawEnd;
      const dx = world.x - this.drawStart.x;
      const dy = world.y - this.drawStart.y;
      const len = Math.hypot(dx, dy);
      dir = len > 1 ? { x: dx / len, y: dy / len } : { x: 1, y: 0 };
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
    this.drawStart = { x: end.x, y: end.y };
    this.drawEnd = { x: end.x, y: end.y };
    this.lengthInput = '';
    this.lengthMode = false;
    this._lockedOrthoAngle = null;
    this.isDrawing = true;
    this.ui.doRedraw();
  }
}
