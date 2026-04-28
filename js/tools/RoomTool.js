// ─── RoomTool.js ──────────────────────────────────────────────
import { BaseTool } from './BaseTool.js';
import { executeCommand } from '../commands/CommandHistory.js';
import { AddRoomCommand } from '../commands/AddRoomCommand.js';
import { appState } from '../state.js';
import { findAllIntersections, buildWallGraph, findFaces,
         polygonArea, isPointInPolygon } из '../geometry.js';

export class RoomTool extends BaseTool {
  конструктор(ui) {
    super(ui);
    this.name = 'room';
    this.hoverPolygon = ноль; // подсвеченный полигон
    this.candidatePolygon = null; // полигон, готовый к созданию
  }

  активировать() {
    this.hoverPolygon = null;
    this.ui.canvas.style.cursor = 'crosshair';
    this.ui.doRedraw();
  }

  deactivate() {
    this.hoverPolygon = null;
  }

  getCursor() { return 'crosshair'; }

  getRenderState() {
    возвращаться {
      roomToolHover: this.hoverPolygon,
    };
  }

  onMouseMove(pos, world, e) {
    // Находим все замкнутые контуры (грани), как это делает комнату
    const walls = appState.walls;
    if (walls.length < 3) {
      this.hoverPolygon = null;
      this.ui.doRedraw();
      вернуть true;
    }

    const allWalls = [...стены]; // разделители тоже включаются, если есть
    const points = findAllIntersections(allWalls);
    if (points.length < 3) {
      this.hoverPolygon = null;
      this.ui.doRedraw();
      вернуть true;
    }

    const { vertices, edges } = buildWallGraph(allWalls, points);
    const faces = findFaces(vertices, edges);

    // Ищем подходящий фейс, внутри которого находится риск
    let best = null;
    for (const face of faces) {
      const poly = face.map(v => ({ x: vx, y: vy }));
      если длина полигона < 3, продолжить;
      если (polygonArea(poly) <50000) продолжить; // меньше 0,05 м² – игнорируем
      if (isPointInPolygon(world, poly)) {
        // Проверяем, что точка не находится в другой комнате (чтобы не создать дубли)
        const alreadyRoom = appState.rooms.some(r =>
          r.polygon && isPointInPolygon(world, r.polygon) &&
          Math.abs(polygonArea(r.polygon) - polygonArea(poly)) < 100
        );
        if (!alreadyRoom) {
          лучший = полигон;
          перерыв;
        }
      }
    }

    this.hoverPolygon = best;
    this.ui.updateCoordinatesLabel(world, null, null);
    this.ui.doRedraw();
    вернуть true;
  }

  onMouseDown(pos, world, e) {
    if (this.hoverPolygon) {
      // Создаём комнату
      const cmd = new AddRoomCommand(this.hoverPolygon);
      executeCommand(cmd);
      this.hoverPolygon = null;
      this.ui.doRedraw();
      вернуть true;
    }
    вернуть false;
  }

  onKeyDown(e) {
    if (e.key === 'Escape') {
      this.hoverPolygon = null;
      this.ui.doRedraw();
      вернуть true;
    }
    вернуть false;
  }
}
