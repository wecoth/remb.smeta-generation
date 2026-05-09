// js/smeta.js — реэкспорт всего публичного API из smeta-init
export {
  initSmeta,
  smetaModule,         // на случай, если где-то ещё используется smetaModule
} from './smeta/smeta-init.js';

// Дополнительно экспортируем всё, что лежит внутри smetaModule как отдельные именованные экспорты,
// чтобы импорт в index.html вида `sm.handleSmr` работал напрямую.
import { smetaModule } from './smeta/smeta-init.js';

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
export { toggleCollapseAllSmr } from './smeta/smeta-tables-smr.js';
export { toggleCollapseAllMat } from './smeta/smeta-tables-mat.js';
