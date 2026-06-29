// js/smeta.js — реэкспорт всего публичного API из smeta-init
export {
  initSmeta,
  smetaModule,         // на случай, если где-то ещё используется smetaModule
} from './smeta/smeta-init.js?v=2';

// Дополнительно экспортируем всё, что лежит внутри smetaModule как отдельные именованные экспорты,
// чтобы импорт в index.html вида `sm.handleSmr` работал напрямую.
import { smetaModule } from './smeta/smeta-init.js?v=2';

export const {
  captureCanvas,
  generatePDF,
  importRoomsFromPlanner,
  handleSmr,
  initSmrManual,
  addSmrRow,
  insertSmrRow,
  clearSmr,
  setSmrMode,
  collectSmrRows,
  getSmrTotal,
  getMastersSmrTotal,
  handleMat,
  initMatManual,
  addMatRow,
  insertMatRow,
  clearMat,
  collectMatRows,
  getMatTotal,
  setGanttMode,
  ensureStage,
  updateTotals,
} = smetaModule;

// Свернуть/развернуть все разделы — реэкспорт напрямую из таблиц
export { toggleCollapseAllSmr } from './smeta/smeta-tables-smr.js?v=2';
export { toggleCollapseAllMat } from './smeta/smeta-tables-mat.js?v=2';

// Дополнительные экспорты для обновления интерфейса после загрузки проекта
export { renderSmrTable } from './smeta/smeta-tables-smr.js?v=2';
export { renderMatTable } from './smeta/smeta-tables-mat.js?v=2';
export { renderGantt, syncSectionsToGantt, recalcAllStageDaysAuto } from './smeta/smeta-gantt.js?v=2';
export { renderPayments } from './smeta/smeta-payments.js?v=2';
