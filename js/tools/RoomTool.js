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

    const points = findAllIntersections(allWalls, 2, 'smart');
    if (points.length < 3) {
      this.hoverPolygon = null;
      this.ui.doRedraw();
      return true;
    }

    const { vertices, edges } = buildWallGraph(allWalls, points, 2, 'smart');
    const faces = findFaces(vertices, edges);

        let best = null;
    let bestDist = Infinity;
    for (const face of faces) {
      const poly = face.map(v => ({ x: v.x, y: v.y }));
      if (poly.length < 3) continue;
      if (polygonArea(poly) < 50000) continue;
      if (isPointInPolygon(world, poly)) {
        const alreadyRoom = appState.rooms.some(r =>
          r.polygon && isPointInPolygon(world, r.polygon) &&
          Math.abs(polygonArea(r.polygon) - polygonArea(poly)) < 100
        );
        if (!alreadyRoom) {
          // расстояние от world до контура полигона
          let minDist = Infinity;
          for (let i = 0; i < poly.length; i++) {
            const a = poly[i];
            const b = poly[(i + 1) % poly.length];
            const proj = projectPointOntoSegment(world, { x1: a.x, y1: a.y, x2: b.x, y2: b.y });
            if (proj.distance < minDist) minDist = proj.distance;
          }
          if (minDist < bestDist) {
            bestDist = minDist;
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
