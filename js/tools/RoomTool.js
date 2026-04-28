// ─── RoomTool.js ──────────────────────────────────────────────────
import { BaseTool } from './BaseTool.js';
import { executeCommand } from '../commands/CommandHistory.js';
import { AddRoomCommand } from '../commands/AddRoomCommand.js';
import { appState } from '../state.js';
import { findAllIntersections, buildWallGraph, findFaces,
         polygonArea, isPointInPolygon, projectPointOntoSegment } from '../geometry.js';

export class RoomTool extends BaseTool {
  constructor(ui) {
    super(ui);
    this.name = 'room';
    this.hoverPolygon = null;
  }

  activate() {
    this.hoverPolygon = null;
    this.ui.canvas.style.cursor = 'crosshair';
    this.ui.doRedraw();
  }

  deactivate() {
    this.hoverPolygon = null;
  }

  getCursor() { return 'crosshair'; }

  getRenderState() {
    return {
      roomToolHover: this.hoverPolygon,
    };
  }

  onMouseMove(pos, world, e) {
  const walls = appState.walls;
  if (walls.length < 3) {
    this.hoverPolygon = null;
    this.ui.doRedraw();
    return true;
  }

  // Добавляем разделители как виртуальные стены с нулевой толщиной
  const allWalls = [...walls, ...(appState.dividers || []).map(d => ({
    ...d, cx1: d.x1, cy1: d.y1, cx2: d.x2, cy2: d.y2,
    thickness: 0, height: 2700, offset: 'left', isDivider: true
  }))];

  const points = findAllIntersections(allWalls, 2, 'smart');  // включаем только свободные торцы
  if (points.length < 3) {
    this.hoverPolygon = null;
    this.ui.doRedraw();
    return true;
  }

  const { vertices, edges } = buildWallGraph(allWalls, points, 2, 'smart');

  // Вспомогательная функция: найти ребро по двум соседним вершинам полигона
  const getEdgeBetween = (v1, v2) => {
    return edges.find(e => {
      const a = vertices[e.v1], b = vertices[e.v2];
      return (Math.hypot(a.x - v1.x, a.y - v1.y) < 2 && Math.hypot(b.x - v2.x, b.y - v2.y) < 2) ||
             (Math.hypot(a.x - v2.x, a.y - v2.y) < 2 && Math.hypot(b.x - v1.x, b.y - v1.y) < 2);
    });
  };

  const faces = findFaces(vertices, edges);

  let best = null;
  let bestArea = Infinity;

  for (const face of faces) {
    const poly = face.map(v => ({ x: v.x, y: v.y }));
    if (poly.length < 3) continue;
    if (polygonArea(poly) < 50000) continue;   // меньше 0.05 м²

    // Проверяем, что **все** рёбра полигона являются внутренними гранями стен
    let allInner = true;
    for (let i = 0; i < poly.length; i++) {
      const p1 = poly[i];
      const p2 = poly[(i + 1) % poly.length];
      const edge = getEdgeBetween(p1, p2);
      // Разделители (толщина 0) тоже допустимы, они не имеют внутренней грани, но их пропускаем
      if (!edge || !edge.faceKinds || (!edge.faceKinds.includes('inner') && !edge.wallIds.some(id => String(id).startsWith('div_')))) {
        allInner = false;
        break;
      }
    }
    if (!allInner) continue;   // игнорируем контуры, содержащие внешние грани или торцы

    if (isPointInPolygon(world, poly)) {
      const alreadyRoom = appState.rooms.some(r =>
        r.polygon && isPointInPolygon(world, r.polygon) &&
        Math.abs(polygonArea(r.polygon) - polygonArea(poly)) < 100
      );
      if (!alreadyRoom) {
        const area = polygonArea(poly);
        if (area < bestArea) {
          bestArea = area;
          best = poly;
        }
      }
    }
  }

  this.hoverPolygon = best;
  this.ui.updateCoordinatesLabel(world, null, null);
  this.ui.doRedraw();
  return true;
}

  onMouseDown(pos, world, e) {
    if (this.hoverPolygon) {
      const cmd = new AddRoomCommand(this.hoverPolygon);
      executeCommand(cmd);
      this.hoverPolygon = null;
      this.ui.doRedraw();
      return true;
    }
    return false;
  }

  onKeyDown(e) {
    if (e.key === 'Escape') {
      this.hoverPolygon = null;
      this.ui.doRedraw();
      return true;
    }
    return false;
  }
}
