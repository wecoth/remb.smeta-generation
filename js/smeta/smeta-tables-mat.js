// ─── smeta-tables-mat.js ───────────────────────────────────────────
// Блок 3: Таблица материалов.
// Аналог SMR без двойного режима и без Gantt-синхронизации.

import { appState }                         from '../state.js';
import { esc, fmtInt,
         initRowDnd, initInsertZones,
         buildInsertZoneTr }                from './smeta-utils.js';
import { parseExcelFile }                   from './smeta-excel.js';
import { updateTotals }                     from './smeta-header.js';

// ── Публичный API ──────────────────────────────────────────────────

export function handleMat(e) {
  const f = e.target.files[0]; if (!f) return;
  parseExcelFile(f, (rows, err) => {
    if (err) { alert('Ошибка чтения файла'); return; }
    appState.matRows = rows;
    renderMatTable();
    updateTotals();
  });
}

export function initMatManual() {
  appState.matRows = [
    { name: '', isSection: true },
    { name: '', unit: 'шт', qty: '', price: '', total: 0, note: '', isSection: false },
  ];
  renderMatTable();
  updateTotals();
}

export function addMatRow(isSection = false) {
  appState.matRows.push(isSection
    ? { name: '', isSection: true }
    : { name: '', unit: '', qty: '', price: '', total: 0, note: '', isSection: false }
  );
  renderMatTable();
  updateTotals();
  setTimeout(() => {
    const inputs = document.querySelectorAll('#matTbody input.inp-name, #matTbody input.inp-section');
    inputs[inputs.length - 1]?.focus();
  }, 30);
}

export function insertMatRow(afterIdx, isSection = false) {
  const newRow = isSection
    ? { name: '', isSection: true }
    : { name: '', unit: '', qty: '', price: '', total: 0, note: '', isSection: false };
  appState.matRows.splice(afterIdx + 1, 0, newRow);
  renderMatTable();
  updateTotals();
  setTimeout(() => {
    const tbody = document.getElementById('matTbody');
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

export function clearMat() {
  appState.matRows = [];
  updateTotals();
}

export function collectMatRows() { return appState.matRows; }
export function getMatTotal() {
  return appState.matRows.filter(r => !r.isSection).reduce((s, r) => s + (r.total || 0), 0);
}

// ── Рендер ─────────────────────────────────────────────────────────

export function renderMatTable() {
  const tbody = document.getElementById('matTbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  let idx = 0;

  appState.matRows.forEach((r, i) => {
    tbody.appendChild(buildInsertZoneTr(i, 'mat'));

    const tr = document.createElement('tr');
    tr.draggable = false;
    tr.dataset.rowIdx = i;

    if (r.isSection) {
      tr.className = 'row-section';
      tr.innerHTML = `
        <td colspan="2"></td>
        <td colspan="4"><input class="inp-section" value="${esc(r.name)}" placeholder="Название раздела" data-i="${i}" data-f="name"></td>
        <td colspan="2"><button class="btn-row-del" data-i="${i}" data-table="mat" title="Удалить">×</button></td>`;
    } else {
      idx++;
      tr.innerHTML = `
        <td class="td-drag" title="Перетащить">⠿</td>
        <td class="td-num">${idx}</td>
        <td><input class="inp-name" value="${esc(r.name)}" placeholder="Наименование материала" data-i="${i}" data-f="name"></td>
        <td><input class="inp-unit" value="${esc(r.unit)}" placeholder="шт" data-i="${i}" data-f="unit"></td>
        <td><input class="inp-num" value="${r.qty}" placeholder="0" data-i="${i}" data-f="qty" type="number" min="0"></td>
        <td><input class="inp-num" value="${r.price || ''}" placeholder="0" data-i="${i}" data-f="price" type="number" min="0"></td>
        <td class="td-total">${r.total ? fmtInt(r.total) : ''}</td>
        <td><input class="inp-note" value="${esc(r.note || '')}" placeholder="Примечание" data-i="${i}" data-f="note"></td>
        <td><button class="btn-row-del" data-i="${i}" data-table="mat" title="Удалить">×</button></td>`;
    }
    tbody.appendChild(tr);
  });

  tbody.appendChild(buildInsertZoneTr(appState.matRows.length, 'mat'));

  _bindMatEvents(tbody);
  initInsertZones(tbody, (beforeIdx, isSection) => {
    const newRow = isSection
      ? { name: '', isSection: true }
      : { name: '', unit: '', qty: '', price: '', total: 0, note: '', isSection: false };
    appState.matRows.splice(beforeIdx, 0, newRow);
    renderMatTable();
    updateTotals();
    setTimeout(() => {
      const tbody2 = document.getElementById('matTbody');
      for (const tr of tbody2.querySelectorAll('tr')) {
        if (tr.classList.contains('tr-insert-zone')) continue;
        if (+tr.dataset.rowIdx === beforeIdx) { tr.querySelector('input')?.focus(); break; }
      }
    }, 30);
  });
  initRowDnd(tbody, appState.matRows, () => { renderMatTable(); updateTotals(); });
}

// ── Привязка событий ───────────────────────────────────────────────

function _bindMatEvents(tbody) {
  tbody.querySelectorAll('input, select').forEach(inp => {
    inp.addEventListener('input', e => {
      const i = +e.target.dataset.i;
      const f = e.target.dataset.f;
      appState.matRows[i][f] = e.target.value;
      if (f === 'qty' || f === 'price') {
        const r = appState.matRows[i];
        r.total = (parseFloat(r.qty) || 0) * (parseFloat(r.price) || 0);
        const td = e.target.closest('tr').querySelector('.td-total');
        if (td) td.textContent = r.total ? fmtInt(r.total) : '';
        updateTotals();
      }
    });
  });

  tbody.querySelectorAll('.btn-row-del').forEach(btn => {
    btn.addEventListener('click', e => {
      appState.matRows.splice(+e.target.dataset.i, 1);
      renderMatTable();
      updateTotals();
    });
  });
}
