// ─── smeta-utils.js ────────────────────────────────────────────────
// Утилиты и константы: форматирование, UID, цвета этапов, DnD, insert-zones.
// Не зависит от DOM и appState — можно тестировать отдельно.

// ── Row UID generator ──────────────────────────────────────────────
let _rowUid = 1;
export function _uid() { return _rowUid++; }

// ── Форматирование ─────────────────────────────────────────────────
export function fmt(v) {
  return (+v || 0).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₽';
}
export function fmtInt(v) {
  return (+v || 0).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
export function fmtDate(v) {
  if (!v) return '—';
  const d = new Date(v); return isNaN(d) ? v : d.toLocaleDateString('ru-RU');
}
export function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Stage colors ───────────────────────────────────────────────────
export const STAGE_COLORS = ['#e07b39','#9b6dda','#5b8dd9','#4aaa6f','#da6d8a','#6da8b8','#a8b85b','#b85b6d'];

// ── DnD строк таблицы ──────────────────────────────────────────────
// Generic: работает для SMR и MAT.
// rows    — реактивный массив (appState.smrRows / matRows)
// onReorder — колбэк после перестановки (перерендер + updateTotals)
export function initRowDnd(tbody, rows, onReorder) {
  let dragSrc   = null;
  let dropTarget = null;

  function clearHighlights() {
    tbody.querySelectorAll('tr').forEach(r => {
      r.classList.remove('row-dragging', 'row-drop-before', 'row-drop-after');
    });
  }

  tbody.addEventListener('mousedown', e => {
    const handle = e.target.closest('.td-drag');
    const tr = handle ? handle.closest('tr') : null;
    if (!tr) return;
    tr.draggable = true;
    const reset = () => { tr.draggable = false; document.removeEventListener('mouseup', reset); };
    document.addEventListener('mouseup', reset);
  });

  tbody.addEventListener('dragstart', e => {
    const tr = e.target.closest('tr');
    if (!tr || !tr.draggable) { e.preventDefault(); return; }
    dragSrc = tr;
    setTimeout(() => tr.classList.add('row-dragging'), 0);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', tr.dataset.rowIdx);
  });

  tbody.addEventListener('dragover', e => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const tr = e.target.closest('tr');
    if (!tr || tr === dragSrc) return;
    const rect = tr.getBoundingClientRect();
    const pos  = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
    if (dropTarget && dropTarget.tr === tr && dropTarget.position === pos) return;
    clearHighlights();
    dragSrc.classList.add('row-dragging');
    dropTarget = { tr, position: pos };
    tr.classList.add(pos === 'before' ? 'row-drop-before' : 'row-drop-after');
  });

  tbody.addEventListener('dragleave', e => {
    if (!tbody.contains(e.relatedTarget)) { clearHighlights(); dropTarget = null; }
  });

  tbody.addEventListener('drop', e => {
    e.preventDefault();
    if (!dragSrc || !dropTarget) { clearHighlights(); return; }
    const fromIdx = +dragSrc.dataset.rowIdx;
    let   toIdx   = +dropTarget.tr.dataset.rowIdx;
    const pos     = dropTarget.position;
    clearHighlights();
    dropTarget = null;
    if (isNaN(fromIdx) || isNaN(toIdx) || fromIdx === toIdx) return;
    const [moved]    = rows.splice(fromIdx, 1);
    const adjustedTo = fromIdx < toIdx ? toIdx - 1 : toIdx;
    const finalTo    = pos === 'after' ? adjustedTo + 1 : adjustedTo;
    rows.splice(Math.min(finalTo, rows.length), 0, moved);
    onReorder();
  });

  tbody.addEventListener('dragend', () => { clearHighlights(); dragSrc = null; dropTarget = null; });
}

// ── Insert-zones (+ / Строка / Раздел) ────────────────────────────
// onInsert(beforeIdx, isSection, table) — вызывается при выборе пункта
export function initInsertZones(tbody, onInsert) {
  function closeAll() {
    tbody.querySelectorAll('.tr-insert-plus-wrap.open').forEach(w => {
      w.classList.remove('open');
      w.querySelector('.tr-insert-plus')?.classList.remove('active');
      w.closest('.tr-insert-btn')?.classList.remove('open');
    });
  }

  tbody.querySelectorAll('.tr-insert-plus').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const wrap   = btn.closest('.tr-insert-plus-wrap');
      const isOpen = wrap.classList.contains('open');
      closeAll();
      if (!isOpen) {
        wrap.classList.add('open');
        btn.classList.add('active');
        wrap.closest('.tr-insert-btn').classList.add('open');
      }
    });
  });

  tbody.querySelectorAll('.tr-insert-dd-item').forEach(item => {
    item.addEventListener('click', e => {
      e.stopPropagation();
      const beforeIdx = +item.dataset.i;
      const isSection = item.dataset.section === '1';
      closeAll();
      onInsert(beforeIdx, isSection);
    });
  });

  document.addEventListener('click', closeAll, { capture: true });
}

// ── Строим HTML insert-zone (одна строка <tr>) ─────────────────────
export function buildInsertZoneTr(i, table, colspan = 9) {
  const tr = document.createElement('tr');
  tr.className = 'tr-insert-zone';
  tr.innerHTML = `<td colspan="${colspan}">
    <div class="tr-insert-btn">
      <div class="tr-insert-plus-wrap" data-i="${i}" data-table="${table}">
        <button class="tr-insert-plus" title="Вставить">+</button>
        <div class="tr-insert-dropdown">
          <div class="tr-insert-dd-item dd-row" data-i="${i}" data-table="${table}" data-section="0">
            <span class="dd-dot"></span>Строка
          </div>
          <div class="tr-insert-dd-item dd-sec" data-i="${i}" data-table="${table}" data-section="1">
            <span class="dd-dot"></span>Раздел
          </div>
        </div>
      </div>
      <div class="tr-insert-line"></div>
    </div>
  </td>`;
  return tr;
}
