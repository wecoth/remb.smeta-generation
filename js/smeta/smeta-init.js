// ─── smeta-init.js ─────────────────────────────────────────────────
// Точка входа сметы. Заменяет initSmeta() из монолитного smeta.js.
// Инициализирует все модули, подписывает их на события, запускает первый рендер.
// index.html импортирует только этот файл + экспортирует window._smetaModule.

import { appState }          from '../state.js';
import { renderToImage,
         getWallsBboxWorld } from '../render.js';

import { _uid, fmtInt }      from './smeta-utils.js';
import { updateTotals,
         updateHeaderDates } from './smeta-header.js';
import { initRooms,
         importRoomsFromPlanner } from './smeta-rooms.js';
import { initSmrTable,
         handleSmr,
         initSmrManual,
         addSmrRow, insertSmrRow, clearSmr,
         setSmrMode,
         collectSmrRows, getSmrTotal, getMastersSmrTotal,
         renderSmrTable }    from './smeta-tables-smr.js';
import { handleMat,
         initMatManual,
         addMatRow, insertMatRow, clearMat,
         collectMatRows, getMatTotal,
         renderMatTable }    from './smeta-tables-mat.js';
import { initGantt,
         renderGantt,
         setGanttMode,
         ensureStage,
         syncSectionsToGantt,
         recalcTotalDaysAuto,
         clearWorksGantt } from './smeta-gantt.js';
import { renderPayments }    from './smeta-payments.js';
import { generatePDF }       from './smeta-pdf.js';

// ── Plan capture ──────────────────────────────────────────────────

function captureCanvas() {
  const walls = window._appState?.walls ?? appState?.walls ?? [];
  if (!walls.length) { alert('Нарисуйте план перед захватом'); return; }
  const cleanImg  = renderToImage(800, 600, false);
  const bbox      = getWallsBboxWorld();
  const drawingW  = bbox ? (bbox.maxX - bbox.minX) : 1;
  const drawingH  = bbox ? (bbox.maxY - bbox.minY) : 1;
  const isPortrait = drawingH > drawingW;
  appState.bpPortrait = isPortrait;
  if (window._appState) window._appState.bpPortrait = isPortrait;
  const fullImg = isPortrait ? renderToImage(1754, 2480, true) : renderToImage(2480, 1754, true);
  if (!cleanImg) { alert('Не удалось захватить чертёж'); return; }
  appState.planData     = cleanImg;
  appState.planDataFull = fullImg;
  if (window._appState) {
    window._appState.planData     = cleanImg;
    window._appState.planDataFull = fullImg;
  }
  alert('Чертёж захвачен ✓');
}

// ── Excel export ───────────────────────────────────────────────────

function _toNum(v) {
  return parseFloat(String(v ?? '').replace(',', '.')) || 0;
}

function _buildEstimateFileName() {
  const street = document.getElementById('hdrStreet')?.value?.trim() || '';
  const house  = document.getElementById('hdrHouse')?.value?.trim() || '';
  const flat   = document.getElementById('hdrFlat')?.value?.trim() || '';
  const parts  = [street, house, flat ? `кв.${flat}` : ''].filter(Boolean);
  const address = parts.join(', ') || 'смета';
  const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
  return `Смета_${address}_${stamp}.xlsx`;
}

function exportToExcel() {
  if (typeof XLSX === 'undefined') {
    alert('Библиотека Excel не загружена (XLSX)');
    return;
  }

  const rowsSmr = Array.isArray(appState.smrRows) ? appState.smrRows : [];
  const rowsMat = Array.isArray(appState.matRows) ? appState.matRows : [];

  const smrData = [['№', 'Наименование работ', 'Ед. изм.', 'Кол-во', 'Цена, ₽', 'Сумма, ₽', 'Примечание']];
  let smrCounter = 0;
  let totalSmr = 0;

  for (const row of rowsSmr) {
    if (row?.isSection) {
      smrData.push([null, row?.name || '', null, null, null, null, null]);
      continue;
    }

    smrCounter += 1;
    const qty = _toNum(row?.qty);
    const price = _toNum(row?.price);
    const total = _toNum(row?.total) || (qty * price);
    totalSmr += total;

    smrData.push([
      smrCounter,
      row?.name || '',
      row?.unit || '',
      qty,
      price,
      total,
      row?.note || '',
    ]);
  }
  smrData.push([null, 'ИТОГО по СМР', null, null, null, fmtInt(totalSmr), null]);

  const matData = [['№', 'Наименование материалов', 'Ед. изм.', 'Кол-во', 'Цена, ₽', 'Сумма, ₽', 'Примечание']];
  let matCounter = 0;
  let totalMat = 0;

  for (const row of rowsMat) {
    if (row?.isSection) {
      matData.push([null, row?.name || '', null, null, null, null, null]);
      continue;
    }

    matCounter += 1;
    const qty = _toNum(row?.qty);
    const price = _toNum(row?.price);
    const total = _toNum(row?.total) || (qty * price);
    totalMat += total;

    matData.push([
      matCounter,
      row?.name || '',
      row?.unit || '',
      qty,
      price,
      total,
      row?.note || '',
    ]);
  }
  matData.push([null, 'ИТОГО по материалам', null, null, null, fmtInt(totalMat), null]);

  const wb = XLSX.utils.book_new();
  const wsSmr = XLSX.utils.aoa_to_sheet(smrData);
  const wsMat = XLSX.utils.aoa_to_sheet(matData);
  wsSmr['!cols'] = [{ wch: 5 }, { wch: 40 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 20 }];
  wsMat['!cols'] = [{ wch: 5 }, { wch: 40 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 20 }];

  XLSX.utils.book_append_sheet(wb, wsSmr, 'СМР');
  XLSX.utils.book_append_sheet(wb, wsMat, 'Материалы');
  XLSX.writeFile(wb, _buildEstimateFileName());
}

function _bindExportExcelButton() {
  const bind = btn => { if (btn) btn.onclick = exportToExcel; };
  const existing = document.getElementById('btnExportExcel');
  if (existing) {
    bind(existing);
    return;
  }

  const topbar = document.querySelector('.smeta-topbar');
  if (!topbar) return;

  const newBtn = document.createElement('button');
  newBtn.className = 'smeta-btn';
  newBtn.id = 'btnExportExcel';
  newBtn.textContent = '📎 Экспорт Excel';
  bind(newBtn);

  const pdfBtn = document.getElementById('btnGeneratePdf');
  if (pdfBtn && pdfBtn.parentElement === topbar) topbar.insertBefore(newBtn, pdfBtn);
  else topbar.appendChild(newBtn);
}

// ── Days slider ────────────────────────────────────────────────────

function _initDaysSlider() {
  const slider = document.getElementById('totalDaysSlider');
  const output = document.getElementById('totalDaysVal');
  if (!slider || !output) return;

  if (appState.totalDaysSet && appState.totalDays > 0) {
    slider.value       = appState.totalDays;
    output.textContent = appState.totalDays;
  } else {
    slider.value       = '';
    output.textContent = '';
  }

  slider.addEventListener('input', () => {
    const v = +slider.value || 0;
    appState.totalDays    = v;
    appState.totalDaysSet = v > 0;
    output.textContent    = v || '';

    if (v > 0) {
      let autoTotal = 0, cursor2 = 0;
      (appState.stages || []).forEach((s, i) => {
        const dur   = (s.daysOverride != null ? s.daysOverride : s.daysAuto) || 0;
        const start = (s.parallelWithPrev && i > 0) ? (appState.stages[i - 1]._startDay || 0) : cursor2;
        s._startDay = start;
        if (!s.parallelWithPrev) cursor2 = start + dur;
        if (start + dur > autoTotal) autoTotal = start + dur;
      });
      if (autoTotal > 0 && v !== autoTotal) {
        const k = v / autoTotal;
        (appState.stages || []).forEach(s => {
          const base = s.daysOverride != null ? s.daysOverride : (s.daysAuto || 0);
          if (base > 0) s.daysOverride = Math.max(1, Math.round(base * k));
        });
        appState.totalDaysOverride = v;
      } else {
        appState.totalDaysOverride = null;
      }
    } else {
      appState.totalDaysOverride = null;
    }

    renderGantt();
    renderPayments();
    updateHeaderDates();
    updateTotals();
  });

  if (typeof window._calcFinish === 'function') window._calcFinish();
}

// ── Section collapse ───────────────────────────────────────────────

function _initCollapse() {
  document.querySelectorAll('.scard-head[data-collapse]').forEach(head => {
    head.addEventListener('click', e => {
      if (e.target.closest('button, input, .smr-mode-toggle')) return;
      const body  = head.nextElementSibling;
      const arrow = head.querySelector('.scard-arrow');
      const collapsed = body.style.display === 'none';
      body.style.display = collapsed ? '' : 'none';
      if (arrow) arrow.textContent = collapsed ? '▾' : '▸';
    });
  });
}

// ── Drawer (экспликация legacy) ────────────────────────────────────

function _initDrawer() {
  const drawer = document.getElementById('explDrawer');
  const tab    = document.getElementById('explTab');
  const main   = document.getElementById('smetaMain');
  if (!drawer || !tab || !main) return;
  let open = false;
  tab.addEventListener('click', () => {
    open = !open;
    drawer.classList.toggle('open', open);
    main.classList.toggle('drawer-open', open);
    tab.querySelector('.tab-arrow').textContent = open ? '◀' : '▶';
  });
}

// ── initSmeta ──────────────────────────────────────────────────────

export function initSmeta() {
  // 1. Инициализируем Gantt с колбэками (нет кругового импорта)
  initGantt({
    onDurationChanged: () => { updateTotals(); renderPayments(); },
    onStageRenamed:    () => { renderPayments(); },
  });

  // 2. Инициализируем SMR-таблицу с колбэком для Gantt-синхронизации
  initSmrTable(() => { syncSectionsToGantt(); });

  // 3. Rooms
  initRooms(() => { updateTotals(); });

  // 4. UI
  _initDrawer();
  _initCollapse();
  _initDaysSlider();
  _bindExportExcelButton();

  // 5. Данные из appState (или дефолтные строки)
  if (appState.smrRows.length === 0 && appState.smrRowsMasters.length === 0) {
    initSmrManual();
  } else {
    appState.smrRows.forEach(r => { if (!r._uid) r._uid = _uid(); });
    appState.smrRowsMasters.forEach((r, i) => { if (!r._uid) r._uid = appState.smrRows[i]?._uid || _uid(); });
    renderSmrTable();
  }

  if (appState.matRows.length === 0) {
    initMatManual();
  } else {
    renderMatTable();
  }

  renderGantt();
  renderPayments();
  updateTotals();
}

// ── Публичный API модуля (window._smetaModule) ─────────────────────

export const smetaModule = {
  // Инициализация
  initSmeta,

  // Утилиты
  captureCanvas,
  generatePDF,
  exportToExcel,

  // Комнаты
  importRoomsFromPlanner,

  // SMR
  handleSmr,
  initSmrManual,
  addSmrRow,
  insertSmrRow,
  clearSmr,
  setSmrMode,
  collectSmrRows,
  getSmrTotal,
  getMastersSmrTotal,

  // MAT
  handleMat,
  initMatManual,
  addMatRow,
  insertMatRow,
  clearMat,
  collectMatRows,
  getMatTotal,

  // Gantt
  setGanttMode,
  ensureStage,
  clearWorksGantt,

  // Header
  updateTotals,

  // fmt экспортируем для KP/PDF шаблонов
  // fmt, fmtInt — если нужны снаружи: import из smeta-utils.js
};

if (typeof window !== 'undefined') {
  window._smetaModule = window._smetaModule || {};
  window._smetaModule.exportToExcel = exportToExcel;
}
