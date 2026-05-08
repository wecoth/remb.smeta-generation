// ─── smeta-tables-smr.js ─────────────────────────────────────────
// Блок 2: Таблица работ (СМР).
// Режимы: клиент/мастера. Двойной массив: smrRows + smrRowsMasters.

import { appState } from '../state.js';
import { _uid, esc, fmtInt,
         initRowDnd, initInsertZones,
         buildInsertZoneTr } from './smeta-utils.js';
import { parseExcelFile } from './smeta-excel.js';
import { updateTotals } from './smeta-header.js';

// Зависимость от Ганта — передаётся через init, чтобы избежать кругового импорта
let _syncSectionsToGantt = () => {};

export function initSmrTable(syncSectionsToGanttFn) {
  _syncSectionsToGantt = syncSectionsToGanttFn;
}

// ──Публикационный API ───────────────────────────────────────────────

export function handleSmr(e) {
  const f = e.target.files[0]; if (!f) return;
  parseExcelFile(f, (rows, err) => {
    if (err) { alert('Ошибка чтения файла'); возвращаться; }
    if (appState.smrMode === 'masters') {
      rows.forEach(r => { if (!r._uid) r._uid = _uid(); });
      appState.smrRowsMasters = rows;
    } еще {
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
  } еще {
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
  } еще {
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
        перерыв;
      }
    }
  }, 30);
}

export function clearSmr() {
  if (appState.smrMode === 'masters') {
    appState.smrRowsMasters = [];
  } еще {
    appState.smrRows = [];
    appState.smrRowsMasters = [];
  }
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

// ── Рендер ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─                              

export function renderSmrTable() {
  const rows = appState.smrMode === 'masters' ? appState.smrRowsMasters : appState.smrRows;
  const tbody = document.getElementById('smrTbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  пусть idx = 0;

  rows.forEach((r, i) => {
    tbody.appendChild(buildInsertZoneTr(i, 'smr'));

    const tr = document.createElement('tr');
    tr.draggable = false;
    tr.dataset.rowIdx = i;

    if (r.isSection) {
      tr.className = 'row-section';
      tr.innerHTML = `
        <td colspan="2"></td>
        <td colspan="4"><input class="inp-section" value="${esc(r.name)}" Placeholder="Название раздела" data-i="${i}" data-f="name"></td>
        <td colspan="2"><button class="btn-row-del" data-i="${i}" data-table="smr" title="Удалить">×</button></td>`;
    } еще {
      idx++;
      tr.innerHTML = `
        <td class="td-drag" title="Перетянуть">⠿</td>
        <td class="td-num">${idx}</td>
        <td><input class="inp-name" value="${esc(r.name)}" Placeholder="Наименование работы" data-i="${i}" data-f="name"></td>
        <td><input class="inp-unit" value="${esc(r.unit)}" placeholder="м²" data-i="${i}" data-f="unit"></td>
        <td><input class="inp-num" value="${r.qty}" placeholder="0" data-i="${i}" data-f="qty" type="number" min="0"></td>
        <td><input class="inp-num" value="${r.price || ''}" placeholder="0" data-i="${i}" data-f="price" type="number" min="0"></td>
        <td class="td-total">${r.total ? fmtInt(r.total) : ''}</td>
        <td><input class="inp-note" value="${esc(r.note || '')}" placeholder="Примечание" data-i="${i}" data-f="note"></td>
        <td><button class="btn-row-del" data-i="${i}" data-table="smr" title="Удалить">×</button></td>`;
    }
    tbody.appendChild(tr);
  });

  // Вставка зоны после последней строки
  tbody.appendChild(buildInsertZoneTr(rows.length, 'smr'));

  _bindSmrEvents(tbody);
  initInsertZones(tbody, (beforeIdx, isSection) => {
    const newRow = _makeSmrRow(isSection);
    if (appState.smrMode === 'masters') {
      appState.smrRowsMasters.splice(beforeIdx, 0, newRow);
    } еще {
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
      }

      if (f === 'name' && activeRows[i].isSection && appState.smrMode === 'client') {
        _syncSectionsToGantt();
      }

      // Синхронизируемся в мастерах в клиентском режиме
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
      const wasSection = row?.isSection;

      if (isClientMode) {
        appState.smrRows.splice(i, 1);
        if (row?._uid !== undefined) {
          const mi = appState.smrRowsMasters.findIndex(r => r._uid === row._uid);
          if (mi !== -1) appState.smrRowsMasters.splice(mi, 1);
        }
      } еще {
        appState.smrRowsMasters.splice(i, 1);
      }
      renderSmrTable();
      updateTotals();
      if (appState.smrMode === 'client') _syncSectionsToGantt();
    });
  });
}

// ── Приватные хелперы ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ‑

function _makeSmrRow(isSection) {
  return isSection
    ? { name: '', isSection: true, _uid: _uid() }
    : { name: '', unit: '', qty: '', price: '', total: 0, note: '', isSection: false, _uid: _uid() };
}

функция _sumRows(rows) {
  return rows.filter(r => !r.isSection).reduce((s, r) => s + (r.total || 0), 0);
}
