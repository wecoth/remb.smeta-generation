import { BaseCommand } from './BaseCommand.js';
import { appState } from '../state.js';
import { polygonArea, polygonCentroid } from '../geometry.js';
import { roomDefaultName, computeRoomMetrics, exteriorWallIds, findAllWallsForEdge } from '../room.js';
import { EventBus } from '../eventBus.js';

export class AddRoomCommand extends BaseCommand {
  constructor(polygon) {
    super();
    this.polygon = polygon.map(p => ({...p}));
    this.room = null; // будет создан при execute
  }

  execute() {
    // Генерируем ключ, имя, метрики (упрощённо, без полного пересчёта всех комнат)
    const key = `${Math.round(polygonCentroid(this.polygon).x)},${Math.round(polygonCentroid(this.polygon).y)}`;
    const defaultName = roomDefaultName(appState.rooms.length);
    const name = appState.roomNameOverrides[key] || defaultName;
    
    // Для метрик нужны граничные стены – найдём их через findAllWallsForEdge
    // (это быстрый способ, не требующий глобального графа)
    const boundaryWalls = [];
    const allWalls = appState.walls;
    for (let i = 0; i < this.polygon.length; i++) {
      const a = this.polygon[i], b = this.polygon[(i+1)%this.polygon.length];
      const edgeWalls = findAllWallsForEdge(a.x, a.y, b.x, b.y, allWalls);
      for (const w of edgeWalls) {
        if (!boundaryWalls.find(bw => bw.id === w.id)) boundaryWalls.push(w);
      }
    }

    const heightMm = boundaryWalls.length > 0 ? boundaryWalls[0].height || 2700 : 2700;
    const metrics = computeRoomMetrics({
      boundaryWalls,
      interiorWalls: [],
      openings: [],
      heightMm,
      polygon: this.polygon,
      entranceDoorId: null,
      hasDividers: false,
      netAreaMm2: polygonArea(this.polygon),
      exteriorWallIds: new Set(),
    });

    const room = {
      key,
      polygon: this.polygon,
      cells: [],
      boundarySegments: boundaryWalls.map(w => ({
        orientation: 'h', // не важно
        x1: 0, y1: 0, x2: 0, y2: 0, // будет заполнено при рендере?
        wall: w,
      })),
      center: polygonCentroid(this.polygon),
      defaultName,
      name,
      area: polygonArea(this.polygon) / 1e6,
      volume: 0,
      height: heightMm / 1000,
      perimeter: metrics.perimeterFloorM,
      wallArea: metrics.wallAreaNetM2,
      openingsArea: metrics.openingsAreaM2,
      metrics,
      wallIds: boundaryWalls.map(w => w.id),
    };

    this.room = room;
    appState.rooms.push(room);
    EventBus.emit('rooms:computed');
  }

  undo() {
    if (this.room) {
      appState.rooms = appState.rooms.filter(r => r.key !== this.room.key);
      EventBus.emit('rooms:computed');
    }
  }
}
