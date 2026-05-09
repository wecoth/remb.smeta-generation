// ─── smeta-tables-smr.js ─────────────────────────────────────────
// Блок 2: Таблица работ (СМР).
// Режимы: клиент/мастера. Двойной массив: smrRows + smrRowsMasters.
// v5: сворачиваемые разделы + сумма раздела в заголовке

import { appState } from '../state.js';
import { _uid, esc, fmtInt,
         initRowDnd, initInsertZones,
         buildInsertZoneTr } from './smeta-utils.js';
import { parseExcelFile } from './smeta-excel.js';
import { updateTotals } from './smeta-header.js';

// Зависимость от Ганта — передаётся через init, чтобы избежать кругового импорта
let _syncSectionsToGantt = () => {};

// Хранилище свёрнутых секций: Set из _uid
if (!appState.smrCollapsed) appState.smrCollapsed = new Set();

export function initSmrTable(syncSectionsToGanttFn) {
  _syncSectionsToGantt = syncSectionsToGanttFn;
}

// ── Публичный API ───────────────────────────────────────────────

export function handleSmr(e) {
  const f = e.target.files[0]; if (!f) return;
  parseExcelFile(f, (rows, err) => {
    if (err) { alert('Ошибка чтения файла'); return; }
    if (appState.smrMode === 'masters') {
      rows.forEach(r => { if (!r._uid) r._uid = _uid(); });
      appState.smrRowsMasters = rows;
    } else {
      rows.forEach(r => { if (!r._uid) r._uid = _uid(); });
      appState.smrRows = rows;
      appState.smrRowsMasters = rows.map(r => structuredClone(r));
    }
    renderSmrTable();
    updateTotals();
    _syncSectionsToGantt();
  });
}

export function initSmrManual() {
  const clientRows = [
    { name: '', isSection: true, _uid: _uid() },
    { name: '', unit: 'м²', qty: '', price: '', total: 0, note: '', isSection: false, _uid: _uid() },
  ];
  appState.smrRows = clientRows;
  appState.smrRowsMasters = clientRows.map(r => structuredClone(r));
  renderSmrTable();
  updateTotals();
}

export function addSmrRow(isSection = false) {
  const newRow = _makeSmrRow(isSection);
  if (appState.smrMode === 'masters') {
    appState.smrRowsMasters.push(newRow);
  } else {
    appState.smrRows.push(newRow);
    appState.smrRowsMasters.push(structuredClone(newRow));
  }
  renderSmrTable();
  updateTotals();
  if (appState.smrMode === 'client') _syncSectionsToGantt();
  setTimeout(() => {
    const inputs = document.querySelectorAll('#smrTbody input.inp-name, #smrTbody input.inp-section');
    inputs[inputs.length - 1]?.focus();
  }, 30);
}

export function insertSmrRow(afterIdx, isSection = false) {
  const newRow = _makeSmrRow(isSection);
  if (appState.smrMode === 'masters') {
    appState.smrRowsMasters.splice(afterIdx + 1, 0, newRow);
  } else {
    appState.smrRows.splice(afterIdx + 1, 0, newRow);
    appState.smrRowsMasters.splice(afterIdx + 1, 0, structuredClone(newRow));
  }
  renderSmrTable();
  updateTotals();
  if (appState.smrMode === 'client') _syncSectionsToGantt();
  setTimeout(() => {
    const tbody = document.getElementById('smrTbody');
    if (!tbody) return;
    for (const tr of tbody.querySelectorAll('tr')) {
      if (tr.classList.contains('tr-insert-zone')) continue;
      if (+tr.dataset.rowIdx === afterIdx + 1) {
        tr.querySelector('input.inp-name, input.inp-section')?.focus();
        break;
      }
    }
  }, 30);
}

export function clearSmr() {
  if (appState.smrMode === 'masters') {
    appState.smrRowsMasters = [];
  } else {
    appState.smrRows = [];
    appState.smrRowsMasters = [];
  }
  appState.smrCollapsed = new Set();
  renderSmrTable();
  updateTotals();
}

export function setSmrMode(mode) {
  if (mode === appState.smrMode) return;
  appState.smrMode = mode;
  if (mode === 'masters' && appState.smrRowsMasters.length === 0 && appState.smrRows.length > 0) {
    appState.smrRows.forEach(r => { if (!r._uid) r._uid = _uid(); });
    appState.smrRowsMasters = appState.smrRows.map(r => structuredClone(r));
  }
  const btnClient = document.getElementById('smrBtnClient');
  const btnMasters = document.getElementById('smrBtnMasters');
  if (btnClient) btnClient.classList.toggle('active', mode === 'client');
  if (btnMasters) btnMasters.classList.toggle('active', mode === 'masters');
  renderSmrTable();
  updateTotals();
}

export function collectSmrRows() { return appState.smrRows; }
export function getSmrTotal() { return _sumRows(appState.smrRows); }
export function getMastersSmrTotal(){ return _sumRows(appState.smrRowsMasters); }

// ── Считаем сумму раздела ────────────────────────────────────────

function _sectionTotal(rows, sectionIdx) {
  let sum = 0;
  for (let j = sectionIdx + 1; j < rows.length; j++) {
    if (rows[j].isSection) break;
    sum += rows[j].total || 0;
  }
  return sum;
}

// ── Рендер ─────────────────────────────────────────────

export function renderSmrTable() {
  const rows = appState.smrMode === 'masters' ? appState.smrRowsMasters : appState.smrRows;
  const tbody = document.getElementById('smrTbody');
  if (!tbody) return;
  if (!appState.smrCollapsed) appState.smrCollapsed = new Set();
  tbody.innerHTML = '';
  let idx = 0;

  // Определяем, в каком разделе сейчас находимся (для скрытия строк)
  let currentSectionUid = null;
  let currentSectionCollapsed = false;

  rows.forEach((r, i) => {
    if (r.isSection) {
      currentSectionUid = r._uid;
      currentSectionCollapsed = appState.smrCollapsed.has(r._uid);
    }

    // Зону вставки показываем только если секция не свёрнута
    if (!currentSectionCollapsed || r.isSection) {
      tbody.appendChild(buildInsertZoneTr(i, 'smr'));
    }

    const tr = document.createElement('tr');
    tr.draggable = false;
    tr.dataset.rowIdx = i;

    if (r.isSection) {
      const collapsed = appState.smrCollapsed.has(r._uid);
      const secTotal = _sectionTotal(rows, i);
      const secTotalStr = secTotal > 0 ? fmtInt(secTotal) : '';
      const uid = r._uid;

      tr.className = 'row-section' + (collapsed ? ' row-section--collapsed' : '');
      tr.dataset.uid = uid;
      tr.style.cursor = 'pointer';
      // onclick прямо на tr — до initRowDnd, поэтому не перехватывается
      tr.onclick = function(e) {
        if (e.target.closest('input') || e.target.closest('.btn-row-del')) return;
        if (!appState.smrCollapsed) appState.smrCollapsed = new Set();
        appState.smrCollapsed.has(uid)
          ? appState.smrCollapsed.delete(uid)
          : appState.smrCollapsed.add(uid);
        renderSmrTable();
      };
      tr.innerHTML = `
        <td colspan="2"></td>
        <td colspan="4">
          <input class="inp-section" value="${esc(r.name)}" placeholder="Название раздела" data-i="${i}" data-f="name" style="max-width:420px;width:50%">
        </td>
        <td class="td-total section-total-cell">${secTotalStr}</td>
        <td></td>
        <td><button class="btn-row-del" data-i="${i}" data-table="smr" title="Удалить">×</button></td>`;
    } else {
      // Скрываем строки свёрнутого раздела
      if (currentSectionCollapsed) {
        tr.style.display = 'none';
        tr.dataset.hiddenBySection = currentSectionUid;
      }
      idx++;
      tr.innerHTML = `
        <td class="td-drag" title="Перетащить">⠿</td>
        <td class="td-num">${idx}</td>
        <td><input class="inp-name" value="${esc(r.name)}" placeholder="Наименование работы" data-i="${i}" data-f="name"></td>
        <td><input class="inp-unit" value="${esc(r.unit)}" placeholder="м²" data-i="${i}" data-f="unit"></td>
        <td><input class="inp-num" value="${r.qty}" placeholder="0" data-i="${i}" data-f="qty" type="number" min="0"></td>
        <td><input class="inp-num" value="${r.price || ''}" placeholder="0" data-i="${i}" data-f="price" type="number" min="0"></td>
        <td class="td-total">${r.total ? fmtInt(r.total) : ''}</td>
        <td><input class="inp-note" value="${esc(r.note || '')}" placeholder="Примечание" data-i="${i}" data-f="note"></td>
        <td><button class="btn-row-del" data-i="${i}" data-table="smr" title="Удалить">×</button></td>`;
    }
    tbody.appendChild(tr);
  });

  // Зона вставки после последней строки
  if (!currentSectionCollapsed) {
    tbody.appendChild(buildInsertZoneTr(rows.length, 'smr'));
  }

  _bindSmrEvents(tbody);
  initInsertZones(tbody, (beforeIdx, isSection) => {
    const newRow = _makeSmrRow(isSection);
    if (appState.smrMode === 'masters') {
      appState.smrRowsMasters.splice(beforeIdx, 0, newRow);
    } else {
      appState.smrRows.splice(beforeIdx, 0, newRow);
      appState.smrRowsMasters.splice(beforeIdx, 0, structuredClone(newRow));
    }
    renderSmrTable();
    updateTotals();
    if (appState.smrMode === 'client') _syncSectionsToGantt();
    setTimeout(() => {
      const tbody2 = document.getElementById('smrTbody');
      for (const tr of tbody2.querySelectorAll('tr')) {
        if (tr.classList.contains('tr-insert-zone')) continue;
        if (+tr.dataset.rowIdx === beforeIdx) { tr.querySelector('input')?.focus(); break; }
      }
    }, 30);
  });
  initRowDnd(tbody, rows, () => { renderSmrTable(); updateTotals(); _syncSectionsToGantt(); });
}

// ── Привязка событий ─────────────────────────────────────────────

function _bindSmrEvents(tbody) {
  const activeRows = appState.smrMode === 'masters' ? appState.smrRowsMasters : appState.smrRows;


  tbody.querySelectorAll('input, select').forEach(inp => {
    const onEdit = e => {
      const i = +e.target.dataset.i;
      const f = e.target.dataset.f;
      if (!activeRows[i] || !f) return;

      activeRows[i][f] = e.target.value;

      if (f === 'qty' || f === 'price') {
        const r = activeRows[i];
        r.total = (parseFloat(r.qty) || 0) * (parseFloat(r.price) || 0);
        const tr = e.target.closest('tr');
        const td = tr ? tr.querySelector('.td-total') : null;
        if (td) td.textContent = r.total ? fmtInt(r.total) : '';
        updateTotals();
        // Обновляем badge суммы раздела без полного перерендера
        _updateSectionBadge(tbody, activeRows, i);
      }

      if (f === 'name' && activeRows[i].isSection && appState.smrMode === 'client') {
        _syncSectionsToGantt();
      }

      if (appState.smrMode === 'client' && activeRows[i]?._uid !== undefined) {
        const masterRow = appState.smrRowsMasters.find(r => r._uid === activeRows[i]._uid);
        if (masterRow) {
          masterRow[f] = activeRows[i][f];
          if (f === 'qty' || f === 'price') masterRow.total = activeRows[i].total;
        }
      }
    };

    inp.addEventListener('input', onEdit);
    inp.addEventListener('change', onEdit);
  });

  tbody.querySelectorAll('.btn-row-del').forEach(btn => {
    btn.addEventListener('click', e => {
      const i = +e.target.dataset.i;
      const isClientMode = appState.smrMode === 'client';
      const active = isClientMode ? appState.smrRows : appState.smrRowsMasters;
      const row = active[i];

      if (isClientMode) {
        appState.smrRows.splice(i, 1);
        if (row?._uid !== undefined) {
          const mi = appState.smrRowsMasters.findIndex(r => r._uid === row._uid);
          if (mi !== -1) appState.smrRowsMasters.splice(mi, 1);
        }
      } else {
        appState.smrRowsMasters.splice(i, 1);
      }
      renderSmrTable();
      updateTotals();
      if (appState.smrMode === 'client') _syncSectionsToGantt();
    });
  });
}

// Обновить сумму раздела у строки-секции без полного перерендера
function _updateSectionBadge(tbody, rows, changedIdx) {
  let sectionIdx = -1;
  for (let j = changedIdx; j >= 0; j--) {
    if (rows[j]?.isSection) { sectionIdx = j; break; }
  }
  if (sectionIdx === -1) return;

  const secTotal = _sectionTotal(rows, sectionIdx);
  const secTotalStr = secTotal > 0 ? fmtInt(secTotal) : '';

  for (const tr of tbody.querySelectorAll('tr.row-section')) {
    if (+tr.dataset.rowIdx === sectionIdx) {
      const cell = tr.querySelector('.section-total-cell');
      if (cell) cell.textContent = secTotalStr;
      break;
    }
  }
}

// ── Приватные хелперы ─────────────────────────────────────────────

function _makeSmrRow(isSection) {
  return isSection
    ? { name: '', isSection: true, _uid: _uid() }
    : { name: '', unit: '', qty: '', price: '', total: 0, note: '', isSection: false, _uid: _uid() };
}

function _sumRows(rows) {
  return rows.filter(r => !r.isSection).reduce((s, r) => s + (r.total || 0), 0);
}
