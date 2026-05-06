// ─── DividerTool.js ───────────────────────────────────────────────
import { BaseTool } from './BaseTool.js';
import { appState } from '../state.js';
import { executeCommand } from '../commands/CommandHistory.js';
import { CreateDividerCommand } from '../commands/CreateDividerCommand.js';
import {
  snap, setModifiers, findObjectSnapCandidate, findGuideCandidate,
  shouldKeepGuideLine, getNearestGuideLineAxis, projectPointToGuideLineWorld,
} from '../snapping.js';

export class DividerTool extends BaseTool {
  constructor(ui) {
    super(ui);
    this.name = 'divider';
    this.isDrawing = false;
    this.drawStart = null;
    this.drawEnd = null;
    this.currentObjectSnap = null;
    this.currentGuideLine = null;
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
  }

  getCursor() {
    return 'crosshair';
  }

  getRenderState() {
    return {
      isDrawing: this.isDrawing,
      drawStart: this.drawStart,
      drawEnd: this.drawEnd,
      currentObjectSnap: this.currentObjectSnap,
      currentGuideLine: this.currentGuideLine,
      wallOffset: 'center', // не важно
      tool: this.name,
    };
  }

  onMouseDown(pos, world, e) {
    if (!this.isDrawing) {
      const snapped = this.currentObjectSnap
        ? { x: this.currentObjectSnap.x, y: this.currentObjectSnap.y }
        : snap(world.x, world.y, { screenPoint: pos, tolerance: 24 });
      this.isDrawing = true;
      this.drawStart = { x: snapped.x, y: snapped.y };
      this.drawEnd = { ...snapped };
      this.ui.doRedraw();
    } else {
      const end = this.getDividerEnd(world);
      const extended = this.extendDividerToWalls(this.drawStart, end);
      const finalStart = extended ? extended.start : this.drawStart;
      const finalEnd = extended ? extended.end : end;
      const len = Math.hypot(finalEnd.x - finalStart.x, finalEnd.y - finalStart.y);
      if (len > 1) {
        executeCommand(new CreateDividerCommand(finalStart.x, finalStart.y, finalEnd.x, finalEnd.y));
        this.reset();
        this.ui.doRedraw();
      }
    }
    return true;
  }

  onMouseMove(pos, world, e) {
    setModifiers(this.ui.shiftDown, this.ui.ctrlDown);
    this.updateObjectSnap(world, pos);
    this.updateGuideLine(world, pos);
    if (this.isDrawing && this.drawStart) {
      this.drawEnd = this.getDividerEnd(world);
    }
    this.ui.updateCoordinatesLabel(world, this.currentObjectSnap, null);
    this.ui.doRedraw();
    return true;
  }

  onKeyDown(e) {
    if (e.key === 'Escape') {
      this.reset();
      this.ui.doRedraw();
      return true;
    }
    return false;
  }

  updateObjectSnap(world, screenPoint) {
    this.currentObjectSnap = findObjectSnapCandidate(world, screenPoint, {
      includeEndpoint: true,
      includeCorner: true,
      includeMidpoint: true,
      includeIntersection: true,
      includeWallPoint: true,
      includePerpendicular: false,
      tolerance: 24,
    });
  }

  updateGuideLine(world, screenPoint) {
  if (!this.isDrawing || !this.drawStart) {
    this.currentGuideLine = null;
    return;
  }

  // Если уже есть объектная направляющая — проверяем, не пора ли её сбросить
  if (this.currentGuideLine && this.currentGuideLine.id !== 'divider:start-axis') {
    if (shouldKeepGuideLine(screenPoint, this.currentGuideLine, 36, 48)) {
      return;
    } else {
      this.currentGuideLine = null;
    }
  }

  // Ищем только реальные объектные направляющие (стены, проёмы, другие рулетки)
  const candidate = findGuideCandidate(screenPoint);
  if (candidate) {
    this.currentGuideLine = candidate;
  } else {
    this.currentGuideLine = null;   // НЕ создаём автоматическую ось
  }
}

  getDividerEnd(world) {
  const screenPt = this.ui.mouseScreen || toScreen(world.x, world.y);
  
  let end;
  if (this.currentObjectSnap) {
    end = { x: this.currentObjectSnap.x, y: this.currentObjectSnap.y };
  } else {
    const snapped = snap(world.x, world.y, {
      screenPoint: screenPt,
      includePerpendicular: false,
      includeWallPoint: true,
      tolerance: 24,
    });
    end = { x: snapped.x, y: snapped.y };
  }

  const hardSnap = this.currentObjectSnap && 
    (this.currentObjectSnap.type === 'endpoint' || 
     this.currentObjectSnap.type === 'corner' || 
     this.currentObjectSnap.type === 'intersection');

  // ⭐ ОРТОГОНАЛЬНАЯ ПРИВЯЗКА (как в WallTool)
  if (!hardSnap && !this.ui.shiftDown && this.drawStart) {
    const dx = end.x - this.drawStart.x;
    const dy = end.y - this.drawStart.y;
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      let angle = Math.atan2(dy, dx);
      for (const sa of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
        const diff = Math.abs(angle - sa);
        if (diff < 0.15 || Math.abs(diff - 2 * Math.PI) < 0.15) {
          angle = sa;
          end = {
            x: this.drawStart.x + Math.cos(angle) * len,
            y: this.drawStart.y + Math.sin(angle) * len,
          };
          break;
        }
      }
    }
  }

  // Применение объектной направляющей
  if (this.currentGuideLine && !hardSnap && screenPt) {
    if (this.currentGuideLine.id !== 'divider:start-axis') {
      const axisGuide = getNearestGuideLineAxis(screenPt, this.currentGuideLine);
      end = projectPointToGuideLineWorld(end, axisGuide);
    }
  }

  return end;
}

  intersectInfiniteLineWithSegment(origin, dir, a, b) {
    const sx = b.x - a.x;
    const sy = b.y - a.y;
    const denom = dir.x * sy - dir.y * sx;
    if (Math.abs(denom) < 1e-6) return null;

    const qx = a.x - origin.x;
    const qy = a.y - origin.y;
    const t = (qx * sy - qy * sx) / denom;
    const u = (qx * dir.y - qy * dir.x) / denom;
    if (u < -0.02 || u > 1.02) return null;

    return { t, x: origin.x + dir.x * t, y: origin.y + dir.y * t };
  }

  extendDividerToWalls(start, end) {
  const len = Math.hypot(end.x - start.x, end.y - start.y);
  if (len < 10 || !Array.isArray(appState.walls) || appState.walls.length < 1) return null;

  const dir = { x: (end.x - start.x) / len, y: (end.y - start.y) / len };

  // Собираем все пересечения луча с осями стен (базовыми линиями cx/cy)
  const rawTs = [];
  for (const wall of appState.walls) {
    const a = { x: wall.cx1 ?? wall.x1, y: wall.cy1 ?? wall.y1 };
    const b = { x: wall.cx2 ?? wall.x2, y: wall.cy2 ?? wall.y2 };
    const hit = this.intersectInfiniteLineWithSegment(start, dir, a, b);
    if (hit) rawTs.push(hit.t);
  }

  if (rawTs.length < 2) return null;

  // Убираем дубликаты (близкие t)
  rawTs.sort((a, b) => a - b);
  const ts = [];
  for (const t of rawTs) {
    if (ts.length === 0 || t - ts[ts.length - 1] > 2) ts.push(t);
  }

  // Определяем, привязан ли start к какой-либо стене (t ≈ 0)
  const startOnWall = ts.some(t => Math.abs(t) < 2);

  let forward  = ts.filter(t => t > 2).sort((a, b) => a - b);   // t > 2 мм вперёд
  let backward = ts.filter(t => t < -2).sort((a, b) => b - a);  // t < -2 мм назад

  // Если старт не на стене, ослабляем допуск: ищем ближайшее положительное и отрицательное
  if (!startOnWall) {
    forward  = ts.filter(t => t > 0).sort((a, b) => a - b);
    backward = ts.filter(t => t < 0).sort((a, b) => b - a);
  }

  // Нужно хотя бы одно пересечение вперёд и одно назад
  if (!forward.length || !backward.length) return null;

  const t1 = backward[0]; // ближайшее сзади (отрицательное)
  const t2 = forward[0];  // ближайшее спереди (положительное)

  const segLen = (t2 - t1) * len;
  if (segLen < 50) return null; // слишком короткий

  return {
    start: { x: start.x + dir.x * t1, y: start.y + dir.y * t1 },
    end:   { x: start.x + dir.x * t2, y: start.y + dir.y * t2 },
  };
}
}  
