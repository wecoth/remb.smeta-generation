// js/import/import-handler.js
// Связывает конвертер .plan с appState приложения.
// Не импортирует ui-planner.js — получает forceRedraw через параметр onDone.

import { appState }                from '../state.js';
import { EventBus }                from '../eventBus.js';
import { clearHistory }            from '../commands/CommandHistory.js';
import { convertRemPlanToProject } from './remplan-converter.js';

/**
 * Читает .plan файл, конвертирует и загружает в appState.
 * @param {File}     file   — файл с расширением .plan
 * @param {Function} onDone — коллбэк после успешного импорта (обычно forceRedraw)
 */
export async function handlePlanImport(file, onDone) {
  let text;
  try {
    text = await file.text();
  } catch {
    alert('Не удалось прочитать файл.');
    return;
  }

  let project;
  try {
    project = convertRemPlanToProject(text);
  } catch (err) {
    alert('Ошибка разбора .plan:\n' + err.message);
    console.error('[import]', err);
    return;
  }

  if (!project.walls.length) {
    alert('В файле не найдено стен для импорта.');
    return;
  }

  // Подтверждение, если проект не пустой
  const hasContent = appState.walls.length > 0 || appState.openings.length > 0;
  if (hasContent) {
    if (!confirm(`Текущий чертёж будет заменён импортированным планом.\nСтен: ${project.walls.length}, проёмов: ${project.openings.length}.\n\nПродолжить?`)) {
      return;
    }
  }

  // ── Очищаем текущее состояние ────────────────────────────────────
  appState.walls            = [];
  appState.openings         = [];
  appState.dividers         = [];
  appState.measures         = [];
  appState.rooms            = [];
  appState.roomNameOverrides = {};
  appState.dimensionOffsets = {};

  // ── Загружаем импортированные данные ─────────────────────────────
  appState.walls    = project.walls;
  appState.openings = project.openings;
  appState.idWall   = project.idWall;
  appState.idOpen   = project.idOpen;
  appState.idDivider = project.idDivider ?? 1;
  appState.idMeasure = project.idMeasure ?? 1;

  // Сбрасываем историю — это новый проект
  clearHistory();

  // Запускаем пересчёт комнат и перерисовку
  EventBus.emit('walls:changed');

  if (typeof onDone === 'function') onDone();

  console.info(`[import] Загружено: ${project.walls.length} стен, ${project.openings.length} проёмов.`);
}
