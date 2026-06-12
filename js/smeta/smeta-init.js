// ─── smeta-init.js ─────────────────────────────────────────────────
import { appState } from '../state.js';
import { renderToImage, getWallsBboxWorld } from '../render.js';
import { _uid, fmtInt } from './smeta-utils.js';
import { updateTotals, updateHeaderDates } from './smeta-header.js';
import { initRooms, importRoomsFromPlanner } from './smeta-rooms.js';
import {
  initSmrTable, handleSmr, initSmrManual, addSmrRow, insertSmrRow,
  clearSmr, setSmrMode, collectSmrRows, getSmrTotal, getMastersSmrTotal,
  renderSmrTable
} from './smeta-tables-smr.js';
import {
  handleMat, initMatManual, addMatRow, insertMatRow, clearMat,
  collectMatRows, getMatTotal, renderMatTable
} from './smeta-tables-mat.js';
import {
  initGantt, renderGantt, setGanttMode, ensureStage,
  syncSectionsToGantt, recalcTotalDaysAuto, clearWorksGantt
} from './smeta-gantt.js';
import { renderPayments } from './smeta-payments.js';
import { generatePDF } from './smeta-pdf.js';

// ── Plan capture ──────────────────────────────────────────────────
function captureCanvas() {
  const walls = window._appState?.walls ?? appState?.walls ?? [];
  if (!walls.length) { alert('Нарисуйте план перед захватом'); return; }
  const cleanImg = renderToImage(800, 600, false);
  const bbox = getWallsBboxWorld();
  const drawingW = bbox ? (bbox.maxX - bbox.minX) : 1;
  const drawingH = bbox ? (bbox.maxY - bbox.minY) : 1;
  const isPortrait = drawingH > drawingW;
  appState.bpPortrait = isPortrait;
  if (window._appState) window._appState.bpPortrait = isPortrait;
  const fullImg = isPortrait ? renderToImage(1754, 2480, true) : renderToImage(2480, 1754, true);
  if (!cleanImg) { alert('Не удалось захватить чертёж'); return; }
  appState.planData = cleanImg;
  appState.planDataFull = fullImg;
  if (window._appState) {
    window._appState.planData = cleanImg;
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
  const house = document.getElementById('hdrHouse')?.value?.trim() || '';
  const flat = document.getElementById('hdrFlat')?.value?.trim() || '';
  const parts = [street, house, flat ? `кв.${flat}` : ''].filter(Boolean);
  const address = parts.join(', ') || 'смета';
  const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
  return `Смета_${address}_${stamp}.xlsx`;
}

// Сумма работ по разделу (section) с именем stageName
function _stageSmrTotal(stageName) {
  let total = 0, inside = false;
  for (const r of appState.smrRows) {
    if (r.isSection) {
      inside = (r.name?.trim() === stageName);
      continue;
    }
    if (inside) total += _toNum(r.total) || (_toNum(r.qty) * _toNum(r.price));
  }
  return total;
}

// Эффективный процент аванса для платежа (локальный или глобальный)
function _effectiveAdvancePct(payment) {
  const local = payment.advancePct;
  if (local != null && local >= 0 && local <= 100) return local;
  return appState.defaultAdvancePct ?? 50;
}

// Порядковый номер платежа (1-based) по его id
function _paymentIndex(paymentId) {
  const idx = (appState.payments || []).findIndex(p => p.id === paymentId);
  return idx >= 0 ? idx + 1 : '';
}

function exportToExcel() {
  if (typeof XLSX === 'undefined') {
    alert('Библиотека Excel не загружена (XLSX)');
    return;
  }

  const rowsSmr  = Array.isArray(appState.smrRows)   ? appState.smrRows   : [];
  const rowsMat  = Array.isArray(appState.matRows)    ? appState.matRows   : [];
  const stages   = Array.isArray(appState.stages)     ? appState.stages    : [];
  const payments = Array.isArray(appState.payments)   ? appState.payments  : [];
  const rooms    = Array.isArray(appState.rooms)      ? appState.rooms     : [];

  // ── Вкладка 1: СМР ───────────────────────────────────────────────
  const smrData = [['№', 'Наименование работ', 'Ед. изм.', 'Кол-во', 'Цена, ₽', 'Сумма, ₽', 'Примечание']];
  let smrCounter = 0, totalSmr = 0;
  for (const row of rowsSmr) {
    if (row?.isSection) {
      smrData.push([null, row?.name || '', null, null, null, null, null]);
      continue;
    }
    smrCounter++;
    const qty   = _toNum(row?.qty);
    const price = _toNum(row?.price);
    const total = _toNum(row?.total) || (qty * price);
    totalSmr += total;
    smrData.push([smrCounter, row?.name || '', row?.unit || '', qty, price, total, row?.note || '']);
  }
  smrData.push([null, 'ИТОГО по СМР', null, null, null, totalSmr, null]);

  // ── Вкладка 2: Материалы ─────────────────────────────────────────
  const matData = [['№', 'Наименование материалов', 'Ед. изм.', 'Кол-во', 'Цена, ₽', 'Сумма, ₽', 'Примечание']];
  let matCounter = 0, totalMat = 0;
  for (const row of rowsMat) {
    if (row?.isSection) {
      matData.push([null, row?.name || '', null, null, null, null, null]);
      continue;
    }
    matCounter++;
    const qty   = _toNum(row?.qty);
    const price = _toNum(row?.price);
    const total = _toNum(row?.total) || (qty * price);
    totalMat += total;
    matData.push([matCounter, row?.name || '', row?.unit || '', qty, price, total, row?.note || '']);
  }
  matData.push([null, 'ИТОГО по материалам', null, null, null, totalMat, null]);

  // ── Вкладка 3: Экспликация (все поля из smeta-rooms.js) ──────────
  const explData = [[
    'No', 'Pomeshchenie',
    'Pol m2', 'Perimetr m',
    'Steny nomin m2', 'Steny chistye m2',
    'Okna m2', 'Otkosy mp', 'Ugly mp', 'Prostenki mp'
  ]];
  explData[0] = [
    '№', 'Помещение',
    'Пол, м²', 'Периметр, м',
    'Стены номин., м²', 'Стены чист., м²',
    'Окна, м²', 'Откосы, м.п.', 'Углы, м.п.', 'Простенки, м.п.'
  ];
  let totalFloor = 0, totalPerim = 0, totalWalls = 0;
  let totWallsN = 0, totWin = 0, totRev = 0, totAng = 0, totNarrow = 0;

  rooms.forEach((room, idx) => {
    const floor       = _toNum(room.area ?? 0);
    const perim       = _toNum(room.metrics?.perimeterFloorM ?? room.perimeter ?? 0);
    const wallsNom    = _toNum(room.metrics?.wallAreaNominalM2 ?? room.metrics?.wallAreaNetM2 ?? room.wallArea ?? 0);
    const wallsClean  = _toNum(room.metrics?.wallAreaNetM2 ?? room.wallArea ?? 0) + _toNum(room.metrics?.narrowWallsLm ?? 0);
    const windows     = _toNum(room.metrics?.windowAreaM2 ?? 0);
    const reveals     = _toNum(room.metrics?.windowRevealsLm ?? 0);
    const outerAngles = _toNum(room.metrics?.outerAnglesLm ?? 0);
    const narrowWalls = _toNum(room.metrics?.narrowWallsLm ?? 0);

    totalFloor += floor; totalPerim += perim;
    totWallsN  += wallsNom; totalWalls += wallsClean;
    totWin     += windows;  totRev     += reveals;
    totAng     += outerAngles; totNarrow += narrowWalls;

    explData.push([
      idx + 1, room.name || `Помещение ${idx + 1}`,
      +floor.toFixed(2), +perim.toFixed(2),
      +wallsNom.toFixed(2), +wallsClean.toFixed(2),
      +windows.toFixed(2), +reveals.toFixed(2),
      +outerAngles.toFixed(2), +narrowWalls.toFixed(2),
    ]);
  });
  if (rooms.length) {
    explData.push([
      '', 'ИТОГО',
      +totalFloor.toFixed(2), +totalPerim.toFixed(2),
      +totWallsN.toFixed(2),  +totalWalls.toFixed(2),
      +totWin.toFixed(2),     +totRev.toFixed(2),
      +totAng.toFixed(2),     +totNarrow.toFixed(2),
    ]);
  }

  // ── Вкладка 4: Этапы работ ────────────────────────────────────────
  const stageData = [['Название этапа', 'Длительность (дни)', 'Номер платежа', 'Сумма этапа, ₽']];
  const totalDays = appState.totalDaysOverride || appState.totalDays || 0;

  // map stageId → payment
  const stageIdToPayment = {};
  payments.forEach(p => {
    (p.stageIds || []).forEach(sid => { stageIdToPayment[sid] = p; });
  });

  stages.forEach(stage => {
    let days = 0;
    if (stage.daysOverride != null && stage.daysOverride > 0) {
      days = stage.daysOverride;
    } else if (stage.daysAuto != null && stage.daysAuto > 0) {
      days = stage.daysAuto;
    } else if (totalDays > 0 && stage.w > 0) {
      days = Math.max(1, Math.round(totalDays * stage.w / 100));
    }
    const amount  = _stageSmrTotal(stage.name);
    const payment = stageIdToPayment[stage.id];
    const payNum  = payment ? _paymentIndex(payment.id) : '';
    stageData.push([stage.name, days, payNum, amount]);
  });

  // ── Вкладка 5: Платежи ────────────────────────────────────────────
  const payData = [['№ платежа', 'Название платежа', 'Этап работ', 'Сумма этапа, ₽', 'Аванс %', 'Аванс, ₽', 'Остаток, ₽']];
  payments.forEach(p => {
    const pNum    = _paymentIndex(p.id);
    const pName   = p.name || `Платёж ${pNum}`;
    const advPct  = _effectiveAdvancePct(p);
    let payTotal  = 0;
    (p.stageIds || []).forEach(sid => {
      const stage = stages.find(s => s.id === sid);
      if (!stage) return;
      const amount = _stageSmrTotal(stage.name);
      const adv    = Math.round(amount * advPct / 100);
      payTotal += amount;
      payData.push([pNum, pName, stage.name, amount, advPct, adv, amount - adv]);
    });
    const advTotal = Math.round(payTotal * advPct / 100);
    payData.push(['', `Итого по "${pName}"`, '', payTotal, advPct, advTotal, payTotal - advTotal]);
    payData.push([]); // разделитель
  });

  // ── Вкладка 6: Мета ──────────────────────────────────────────────
  const street  = document.getElementById('hdrStreet')?.value?.trim() || '';
  const house   = document.getElementById('hdrHouse')?.value?.trim()  || '';
  const flat    = document.getElementById('hdrFlat')?.value?.trim()   || '';
  const address = [street, house, flat ? `кв.${flat}` : ''].filter(Boolean).join(', ') || '—';
  const date    = document.getElementById('smetaDate')?.value || new Date().toLocaleDateString('ru-RU');
  const duration = appState.totalDaysOverride || appState.totalDays || 0;
  const metaData = [
    ['Параметр', 'Значение'],
    ['Адрес объекта',                 address],
    ['Дата составления',              date],
    ['Срок выполнения, рабочих дней', duration],
    ['Стоимость работ, ₽',            totalSmr],
    ['Стоимость материалов, ₽',       totalMat],
    ['Итого, ₽',                      totalSmr + totalMat],
    ['Кол-во помещений',              rooms.length],
    ['Общая площадь пола, м²',        +totalFloor.toFixed(2)],
    ['Общая площадь стен, м²',        +totalWalls.toFixed(2)],
    ['Кол-во этапов работ',           stages.length],
    ['Кол-во платежей',               payments.length],
  ];

  // ── Сборка книги ─────────────────────────────────────────────────
  const wb      = XLSX.utils.book_new();
  const wsSmr   = XLSX.utils.aoa_to_sheet(smrData);
  const wsMat   = XLSX.utils.aoa_to_sheet(matData);
  const wsExpl  = XLSX.utils.aoa_to_sheet(explData);
  const wsStage = XLSX.utils.aoa_to_sheet(stageData);
  const wsPay   = XLSX.utils.aoa_to_sheet(payData);
  const wsMeta  = XLSX.utils.aoa_to_sheet(metaData);

  wsSmr['!cols']   = [{ wch: 5 }, { wch: 45 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 20 }];
  wsMat['!cols']   = [{ wch: 5 }, { wch: 45 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 20 }];
  wsExpl['!cols']  = [{ wch: 5 }, { wch: 22 }, { wch: 10 }, { wch: 13 }, { wch: 16 }, { wch: 16 }, { wch: 10 }, { wch: 13 }, { wch: 12 }, { wch: 15 }];
  wsStage['!cols'] = [{ wch: 32 }, { wch: 20 }, { wch: 16 }, { wch: 16 }];
  wsPay['!cols']   = [{ wch: 12 }, { wch: 22 }, { wch: 32 }, { wch: 16 }, { wch: 10 }, { wch: 14 }, { wch: 14 }];
  wsMeta['!cols']  = [{ wch: 35 }, { wch: 25 }];

  XLSX.utils.book_append_sheet(wb, wsSmr,   'СМР');
  XLSX.utils.book_append_sheet(wb, wsMat,   'Материалы');
  XLSX.utils.book_append_sheet(wb, wsExpl,  'Экспликация');
  XLSX.utils.book_append_sheet(wb, wsStage, 'Этапы работ');
  XLSX.utils.book_append_sheet(wb, wsPay,   'Платежи');
  XLSX.utils.book_append_sheet(wb, wsMeta,  'Мета');

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
    slider.value = appState.totalDays;
    output.textContent = appState.totalDays;
  } else {
    slider.value = '';
    output.textContent = '';
  }
  slider.addEventListener('input', () => {
    const v = +slider.value || 0;
    appState.totalDays = v;
    appState.totalDaysSet = v > 0;
    output.textContent = v || '';
    if (v > 0) {
      let autoTotal = 0, cursor2 = 0;
      (appState.stages || []).forEach((s, i) => {
        const dur = (s.daysOverride != null ? s.daysOverride : s.daysAuto) || 0;
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
      const body = head.nextElementSibling;
      const arrow = head.querySelector('.scard-arrow');
      const collapsed = body.style.display === 'none';
      body.style.display = collapsed ? '' : 'none';
      if (arrow) arrow.textContent = collapsed ? '▾' : '▸';
    });
  });
}

// ── Drawer (экспликация) ───────────────────────────────────────────
function _initDrawer() {
  const drawer = document.getElementById('explDrawer');
  const tab = document.getElementById('explTab');
  const main = document.getElementById('smetaMain');
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
  initGantt({
    onDurationChanged: () => { updateTotals(); renderPayments(); },
    onStageRenamed: () => { renderPayments(); },
  });
  initSmrTable(() => { syncSectionsToGantt(); });
  initRooms(() => { updateTotals(); });

  _initDrawer();
  _initCollapse();
  _initDaysSlider();
  _bindExportExcelButton();

  if (appState.smrRows.length === 0 && appState.smrRowsMasters.length === 0) {
    initSmrManual();
  } else {
    appState.smrRows.forEach(r => { if (!r._uid) r._uid = _uid(); });
    appState.smrRowsMasters.forEach(r => { if (!r._uid) r._uid = _uid(); });
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

// ── Public API ─────────────────────────────────────────────────────
export const smetaModule = {
  initSmeta,
  captureCanvas,
  generatePDF,
  exportToExcel,
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
  clearWorksGantt,
  updateTotals,
};

if (typeof window !== 'undefined') {
  window._smetaModule = window._smetaModule || {};
  Object.assign(window._smetaModule, smetaModule);
}
