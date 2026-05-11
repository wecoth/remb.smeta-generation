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

  console.log('[handler] Вызываем onDone (zoom-to-fit + redraw)...');
  if (typeof onDone === 'function') onDone();

  console.log('[handler] ГОТОВО');
}
