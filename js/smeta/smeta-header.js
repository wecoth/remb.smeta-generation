// ─── smeta-header.js ───────────────────────────────────────────────
// Блок 1: шапка объекта.
// Обновляет итоги (СМР, материалы, маржа, срок, финиш).
// Экспортирует updateTotals() — вызывается из других модулей.

import { appState } from '../state.js';
import { fmt, fmtInt } from './smeta-utils.js';

const el = id => document.getElementById(id);

// ── Публичный API ──────────────────────────────────────────────────

export function updateTotals() {
  const smrT        = appState.smrRows.filter(r => !r.isSection).reduce((s, r) => s + (r.total || 0), 0);
  const matT        = appState.matRows.filter(r => !r.isSection).reduce((s, r) => s + (r.total || 0), 0);
  const mastersSmrT = appState.smrRowsMasters.filter(r => !r.isSection).reduce((s, r) => s + (r.total || 0), 0);

  // Шапка: общие суммы
  if (el('hdrSmr'))   el('hdrSmr').textContent   = fmtInt(smrT) + ' ₽';
  if (el('hdrMat'))   el('hdrMat').textContent   = fmtInt(matT) + ' ₽';
  if (el('hdrTotal')) el('hdrTotal').textContent = fmtInt(smrT + matT) + ' ₽';

  // Футеры таблиц
  const activeSmrT = appState.smrMode === 'masters' ? mastersSmrT : smrT;
  if (el('smrFootTotal')) el('smrFootTotal').textContent = fmt(activeSmrT);
  if (el('matFootTotal')) el('matFootTotal').textContent = fmt(matT);

  // Счётчики в заголовках блоков
  const activeSmrRows = appState.smrMode === 'masters' ? appState.smrRowsMasters : appState.smrRows;
  if (el('smrCount')) el('smrCount').textContent =
    activeSmrRows.filter(r => !r.isSection).length + ' поз. · ' + fmtInt(activeSmrT) + ' ₽';
  if (el('matCount')) el('matCount').textContent =
    appState.matRows.filter(r => !r.isSection).length + ' поз. · ' + fmtInt(matT) + ' ₽';

  // Маржа
  const marginT    = smrT + matT - mastersSmrT;
  const totalDays  = parseInt(el('totalDaysSlider')?.value) || 0;

  if (el('hdrMasters')) el('hdrMasters').textContent = mastersSmrT ? fmtInt(mastersSmrT) + ' ₽' : '— ₽';

  if (el('hdrMargin') && (smrT + matT) > 0) {
    const pct = Math.round(marginT / (smrT + matT) * 100);
    el('hdrMargin').textContent = fmtInt(marginT) + ' ₽  (' + pct + '%)';
    el('hdrMargin').className = 'obj-meta-val accent' +
      (pct >= 30 ? ' margin-good' : pct >= 15 ? ' margin-mid' : ' margin-low');
  } else if (el('hdrMargin')) {
    el('hdrMargin').textContent = '—';
    el('hdrMargin').className = 'obj-meta-val accent';
  }

  if (el('hdrMarginDay') && totalDays > 0 && (smrT + matT) > 0) {
    el('hdrMarginDay').textContent = fmtInt(marginT / totalDays) + ' ₽/день';
  } else if (el('hdrMarginDay')) {
    el('hdrMarginDay').textContent = '—';
  }

  updateHeaderDates();
}

export function updateHeaderDates() {
  const sliderEl  = el('totalDaysSlider');
  const totalDays = sliderEl ? (parseInt(sliderEl.value) || 0) : 0;

  if (el('hdrDays')) el('hdrDays').textContent = totalDays ? totalDays + ' дн.' : '—';

  const valEl = el('totalDaysVal');
  if (valEl) valEl.textContent = totalDays || '';

  if (typeof window._calcFinish === 'function') window._calcFinish();
}
