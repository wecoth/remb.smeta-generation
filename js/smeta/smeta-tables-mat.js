// ─── smeta-tables-mat.js ───────────────────────────────────────────
// Блок 3: Таблица материалов.
// v2: сворачиваемые разделы + сумма раздела в заголовке

import { appState }                         from '../state.js';
import { esc, fmtInt,
         initRowDnd, initInsertZones,
         buildInsertZoneTr }                from './smeta-utils.js';
import { parseExcelFile }                   from './smeta-excel.js';
import { updateTotals }                     from './smeta-header.js';

// Хранилище свёрнутых секций материалов
if (!appState.matCollapsed) appState.matCollapsed = new Set();

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
  appState.matCollapsed = new Set();
  updateTotals();
}

export function collectMatRows() { return appState.matRows; }
export function getMatTotal() {
  return appState.matRows.filter(r => !r.isSection).reduce((s, r) => s + (r.total || 0), 0);
}

// ── Считаем сумму раздела ──────────────────────────────────────────

function _sectionTotal(rows, sectionIdx) {
  let sum = 0;
  for (let j = sectionIdx + 1; j < rows.length; j++) {
    if (rows[j].isSection) break;
    sum += rows[j].total || 0;
  }
  return sum;
}

// ── Рендер ─────────────────────────────────────────────────────────

export function renderMatTable() {
  const tbody = document.getElementById('matTbody');
  if (!tbody) return;
  if (!appState.matCollapsed) appState.matCollapsed = new Set();
  tbody.innerHTML = '';
  let idx = 0;

  let currentSectionUid = null;
  let currentSectionCollapsed = false;

  appState.matRows.forEach((r, i) => {
    if (r.isSection) {
      // У строк материалов может не быть _uid — добавляем на лету
      if (!r._uid) r._uid = 'mat_' + i + '_' + Math.random().toString(36).slice(2, 7);
      currentSectionUid = r._uid;
      currentSectionCollapsed = appState.matCollapsed.has(r._uid);
    }

    if (!currentSectionCollapsed || r.isSection) {
      tbody.appendChild(buildInsertZoneTr(i, 'mat'));
    }

    const tr = document.createElement('tr');
    tr.draggable = false;
    tr.dataset.rowIdx = i;

    if (r.isSection) {
      const collapsed = appState.matCollapsed.has(r._uid);
      const secTotal = _sectionTotal(appState.matRows, i);
      const secTotalStr = secTotal > 0 ? fmtInt(secTotal) : '';
      const arrow = collapsed ? '▶' : '▼';

      tr.className = 'row-section' + (collapsed ? ' row-section--collapsed' : '');
      tr.dataset.uid = r._uid;
      tr.style.cursor = 'pointer';
      tr.innerHTML = `
        <td colspan="2"></td>
        <td colspan="3">
          <span class="section-arrow">${arrow}</span>
          <input class="inp-section" value="${esc(r.name)}" placeholder="Название раздела" data-i="${i}" data-f="name">
        </td>
        <td></td>
        <td class="td-total section-total-cell">${secTotalStr}</td>
        <td></td>
        <td><button class="btn-row-del" data-i="${i}" data-table="mat" title="Удалить">×</button></td>`;
    } else {
      if (currentSectionCollapsed) {
        tr.style.display = 'none';
        tr.dataset.hiddenBySection = currentSectionUid;
      }
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

  if (!currentSectionCollapsed) {
    tbody.appendChild(buildInsertZoneTr(appState.matRows.length, 'mat'));
  }

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
  // Клик по строке раздела (не по инпуту и не по крестику) — сворачивает
  tbody.querySelectorAll('tr.row-section').forEach(tr => {
    tr.addEventListener('click', e => {
      if (e.target.closest('input') || e.target.closest('.btn-row-del')) return;
      const uid = tr.dataset.uid;
      if (!uid) return;
      if (!appState.matCollapsed) appState.matCollapsed = new Set();
      if (appState.matCollapsed.has(uid)) {
        appState.matCollapsed.delete(uid);
      } else {
        appState.matCollapsed.add(uid);
      }
      renderMatTable();
    });
  });

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
        _updateSectionBadge(tbody, appState.matRows, i);
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

// Обновить сумму раздела без полного перерендера
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
