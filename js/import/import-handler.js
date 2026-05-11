// js/import/import-handler.js

import { appState }                from '../state.js';
import { EventBus }                from '../eventBus.js';
import { clearHistory }            from '../commands/CommandHistory.js';
import { convertRemPlanToProject } from './remplan-converter.js';
import { computeRooms }            from '../room.js';   // ← прямой вызов
import { recalculateContourFromBase } from '../wall.js'; // ← прямой импорт

export async function handlePlanImport(file, onDone) {
  let text;
  try {
    text = await file.text();
  } catch (e) {
    alert('Не удалось прочитать файл.');
    return;
  }

  let project;
  try {
    project = convertRemPlanToProject(text);
  } catch (e) {
    alert('Ошибка разбора .plan:\n' + e.message);
    return;
  }

  if (!project.walls.length) {
    alert('В файле не найдено стен для импорта.');
    return;
  }

  const hasContent = appState.walls.length > 0 || appState.openings.length > 0;
  if (hasContent) {
    if (!confirm('Текущий чертёж будет заменён импортированным планом.\nСтен: ' + project.walls.length + ', проёмов: ' + project.openings.length + '.\n\nПродолжить?')) {
      return;
    }
  }

  // ── 1. Очистка и загрузка данных ────────────────────────────
  appState.walls             = [];
  appState.openings          = [];
  appState.dividers          = [];
  appState.measures          = [];
  appState.rooms             = [];
  appState.roomNameOverrides = {};
  appState.dimensionOffsets  = {};

  appState.walls     = project.walls;
  appState.openings  = project.openings;
  appState.idWall    = project.idWall;
  appState.idOpen    = project.idOpen;
  appState.idDivider = project.idDivider ?? 1;
  appState.idMeasure = project.idMeasure ?? 1;

  clearHistory();

  // ── 2. Первый прогон комнат (даст примерные контуры) ────────
  computeRooms();   // синхронно заполняет appState.rooms

  // ── 3. Коррекция offset'ов по найденным комнатам ────────────
  if (appState.rooms.length > 0) {
    const wallsInRooms = new Map(); // wallId -> { side: 'left'|'right' }

    // Собираем информацию: с какой стороны стены находится центр комнаты
    for (const room of appState.rooms) {
      const center = room.center;
      if (!room.boundarySegments) continue;
      for (const seg of room.boundarySegments) {
        const wall = seg.wall;
        if (!wall || wall.offset !== 'center') continue;   // правим только center-стены

        const angle = Math.atan2(wall.y2 - wall.y1, wall.x2 - wall.x1);
        const normal = { x: -Math.sin(angle), y: Math.cos(angle) };
        const mid = { x: (wall.x1 + wall.x2) / 2, y: (wall.y1 + wall.y2) / 2 };
        const toCenter = { x: center.x - mid.x, y: center.y - mid.y };
        const dot = toCenter.x * normal.x + toCenter.y * normal.y;
        const side = dot >= 0 ? 'left' : 'right';

        wallsInRooms.set(wall.id, { wall, side });
      }
    }

    // Применяем смещение и пересчитываем контур
    for (const [wallId, info] of wallsInRooms.entries()) {
      const wall = info.wall;
      const angle = Math.atan2(wall.y2 - wall.y1, wall.x2 - wall.x1);
      const normal = { x: -Math.sin(angle), y: Math.cos(angle) };
      const halfT = wall.thickness / 2;
      const dir = info.side === 'left' ? normal : { x: -normal.x, y: -normal.y };

      // Смещаем базовую линию ВНУТРЬ на половину толщины
      wall.cx1 = (wall.cx1 ?? wall.x1) + dir.x * halfT;
      wall.cy1 = (wall.cy1 ?? wall.y1) + dir.y * halfT;
      wall.cx2 = (wall.cx2 ?? wall.x2) + dir.x * halfT;
      wall.cy2 = (wall.cy2 ?? wall.y2) + dir.y * halfT;
      wall.offset = info.side;

      // Пересчитываем x/y по новому offset
      recalculateContourFromBase(wall);
    }

    // Стены, не попавшие ни в одну комнату, просто переводим в 'right'
    appState.walls.forEach(w => {
      if (w.offset === 'center') w.offset = 'right';
    });

    // Пересчитываем кэш стыков
    import('../wall.js').then(({ invalidateJointCache }) => invalidateJointCache?.());
  }

  // ── 4. Финальный пересчёт комнат с правильными контурами ────
  computeRooms();
  EventBus.emit('walls:changed');
  EventBus.emit('rooms:computed');

  if (typeof onDone === 'function') onDone();
}
