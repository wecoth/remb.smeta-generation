import { BaseCommand } from './BaseCommand.js';
import { appState } from '../state.js';
import { polygonArea, polygonCentroid } from '../geometry.js';
import { roomDefaultName, computeRoomMetrics, exteriorWallIds, findAllWallsForEdge, updateExpl } from '../room.js';
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
    const allWalls = appState.walls;
    const boundaryWalls = [];
    for (let i = 0; i < this.polygon.length; i++) {
      const a = this.polygon[i], b = this.polygon[(i+1)%this.polygon.length];
      const edgeWalls = findAllWallsForEdge(a.x, a.y, b.x, b.y, allWalls);
      for (const w of edgeWalls) {
        if (!boundaryWalls.find(bw => bw.id === w.id)) boundaryWalls.push(w);
      }
    }

    // Определяем высоту помещения по граничным стенам (взвешенная по длине)
    let totalLengthMm = 0;
    let weightedHeightSum = 0;
    for (const w of boundaryWalls) {
      const x1 = w.cx1 ?? w.x1;
      const y1 = w.cy1 ?? w.y1;
      const x2 = w.cx2 ?? w.x2;
      const y2 = w.cy2 ?? w.y2;
      const len = Math.hypot(x2 - x1, y2 - y1);
      const h = w.height || 2700; // fallback на высоту по умолчанию
      if (len > 0) {
        totalLengthMm += len;
        weightedHeightSum += len * h;
      }
    }
    const heightMm = totalLengthMm > 0
      ? weightedHeightSum / totalLengthMm
      : 2700;

    // Ищем проёмы на граничных стенах для корректного учёта площади пола и стен
    const allBoundaryWallIds = new Set(boundaryWalls.map(w => w.id));
    const roomOpenings = appState.openings.filter(op => allBoundaryWallIds.has(op.wallId));

    // Чистая площадь пола (пока без учёта долей проёмов, но для начального приближения сойдёт)
    // В computeRoomMetrics она не используется для wallArea, только для объёма, поэтому можно оставить так.
    const dividerWalls = (appState.dividers || []).map(d => ({
      id: `div_${d.id}`,
      x1: d.x1, y1: d.y1, x2: d.x2, y2: d.y2,
      cx1: d.x1, cy1: d.y1, cx2: d.x2, cy2: d.y2,
      thickness: 0, height: heightMm, offset: 'left', isDivider: true,
    }));

    const metrics = computeRoomMetrics({
      boundaryWalls,
      interiorWalls: [],
      openings: roomOpenings,
      heightMm,
      polygon: this.polygon,
      entranceDoorId: null,
      hasDividers: dividerWalls.length > 0,
      netAreaMm2: polygonArea(this.polygon),
      exteriorWallIds: new Set(),
      dividerWalls,
    });

    const room = {
      key,
      polygon: this.polygon,
      cells: [],
      boundarySegments: boundaryWalls.map(w => ({
        orientation: 'h', // не важно
        x1: 0, y1: 0, x2: 0, y2: 0,
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

    // Принудительное обновление таблицы экспликации
    const explBody = document.getElementById('explBody');
    const roomCount = document.getElementById('roomCount');
    if (explBody) {
      updateExpl(explBody, roomCount);
    }
  }

  undo() {
    if (this.room) {
      appState.rooms = appState.rooms.filter(r => r.key !== this.room.key);
      EventBus.emit('rooms:computed');
    }
  }
}
