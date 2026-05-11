// js/import/import-handler.js

import { appState }                from '../state.js';
import { EventBus }                from '../eventBus.js';
import { clearHistory }            from '../commands/CommandHistory.js';
import { convertRemPlanToProject } from './remplan-converter.js';

export async function handlePlanImport(file, onDone) {
  console.log('[handler] Файл получен:', file.name, 'размер:', file.size, 'байт');

  let text;
  try {
    text = await file.text();
    console.log('[handler] Файл прочитан, длина строки:', text.length);
  } catch (e) {
    console.error('[handler] Ошибка чтения файла:', e);
    alert('Не удалось прочитать файл.');
    return;
  }

  let project;
  try {
    project = convertRemPlanToProject(text);
    console.log('[handler] Конвертация успешна. Стен:', project.walls.length, 'Проёмов:', project.openings.length);
    console.log('[handler] Первая стена:', JSON.stringify(project.walls[0]));
  } catch (e) {
    console.error('[handler] Ошибка конвертации:', e);
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
      console.log('[handler] Пользователь отменил импорт');
      return;
    }
  }

  console.log('[handler] Очищаем appState...');
  appState.walls             = [];
  appState.openings          = [];
  appState.dividers          = [];
  appState.measures          = [];
  appState.rooms             = [];
  appState.roomNameOverrides = {};
  appState.dimensionOffsets  = {};

  console.log('[handler] Загружаем новые данные...');
  appState.walls     = project.walls;
  appState.openings  = project.openings;
  appState.idWall    = project.idWall;
  appState.idOpen    = project.idOpen;
  appState.idDivider = project.idDivider ?? 1;
  appState.idMeasure = project.idMeasure ?? 1;

  console.log('[handler] appState после загрузки — walls:', appState.walls.length, 'openings:', appState.openings.length);

  clearHistory();

  console.log('[handler] Эмитим walls:changed...');
  EventBus.emit('walls:changed');

  // Автоматическая коррекция offset'ов и смещение базовых линий внутрь комнат
  const fixOffsets = () => {
    if (!appState.rooms || appState.rooms.length === 0) return;

    const wallsInRooms = new Map(); // wallId -> { side: 'left'|'right' }

    // Определяем для каждой стены, с какой стороны находится центр комнаты
    for (const room of appState.rooms) {
      const center = room.center;
      if (!room.boundarySegments) continue;
      for (const seg of room.boundarySegments) {
        const wall = seg.wall;
        if (!wall || wall.offset !== 'center') continue; // только стены с center

        const angle = Math.atan2(wall.y2 - wall.y1, wall.x2 - wall.x1);
        const normal = { x: -Math.sin(angle), y: Math.cos(angle) }; // левая нормаль
        const mid = { x: (wall.x1 + wall.x2) / 2, y: (wall.y1 + wall.y2) / 2 };
        const toCenter = { x: center.x - mid.x, y: center.y - mid.y };
        const dot = toCenter.x * normal.x + toCenter.y * normal.y;
        const side = dot >= 0 ? 'left' : 'right'; // если центр слева от оси – left

        if (!wallsInRooms.has(wall.id)) {
          wallsInRooms.set(wall.id, { side });
        } else {
          // если стена граничит с несколькими комнатами, используем последнюю
          wallsInRooms.get(wall.id).side = side;
        }
      }
    }

    // Применяем изменения к стенам
    for (const [wallId, info] of wallsInRooms.entries()) {
      const wall = appState.walls.find(w => w.id === wallId);
      if (!wall) continue;

      const angle = Math.atan2(wall.y2 - wall.y1, wall.x2 - wall.x1);
      const normal = { x: -Math.sin(angle), y: Math.cos(angle) };
      const halfT = wall.thickness / 2;

      // Направление от оси к внутренней грани (туда, где комната)
      const dir = info.side === 'left' ? normal : { x: -normal.x, y: -normal.y };

      // Смещаем базовую линию внутрь на половину толщины стены
      wall.cx1 = (wall.cx1 ?? wall.x1) + dir.x * halfT;
      wall.cy1 = (wall.cy1 ?? wall.y1) + dir.y * halfT;
      wall.cx2 = (wall.cx2 ?? wall.x2) + dir.x * halfT;
      wall.cy2 = (wall.cy2 ?? wall.y2) + dir.y * halfT;

      // Устанавливаем правильный offset – теперь cx/cy будет внутренней гранью
      wall.offset = info.side;

      // Пересчитываем контур стены (x1/y1/x2/y2) под новый offset и толщину
      import('./wall.js').then(({ recalculateContourFromBase }) => {
        recalculateContourFromBase(wall);
      });
    }

    // Стены, которые не попали ни в одну комнату, просто переводим в 'right'
    appState.walls.forEach(w => {
      if (w.offset === 'center') w.offset = 'right';
    });

    // Отписываемся от события и перестраиваем комнаты заново
    EventBus.off('rooms:computed', fixOffsets);
    EventBus.emit('walls:changed');
  };

  // Одноразовый обработчик первого построения комнат
  EventBus.on('rooms:computed', fixOffsets);

  console.log('[handler] Вызываем onDone (zoom-to-fit + redraw)...');
  if (typeof onDone === 'function') onDone();

  console.log('[handler] ГОТОВО');
}
