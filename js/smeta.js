// ─── SMETA.JS ─────────────────────────────────────────────────────
import { appState } from './state.js';
import { EventBus } from './eventBus.js';
import { renderToImage, getWallsBboxWorld } from './render.js';

// ── Row UID generator ─────────────────────────────────────────────
let _rowUid = 1;
function _uid() { return _rowUid++; }

// ── Utils ─────────────────────────────────────────────────────────

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

// ── Plan capture ──────────────────────────────────────────────────

export function captureCanvas() {
  const walls = window._appState?.walls ?? appState?.walls ?? [];
  if (!walls.length) { alert('Нарисуйте план перед захватом'); return; }
  const cleanImg = renderToImage(800, 600, false);
  const bbox = getWallsBboxWorld();
  const drawingW = bbox ? (bbox.maxX - bbox.minX) : 1;
  const drawingH = bbox ? (bbox.maxY - bbox.minY) : 1;
  const isPortrait = drawingH > drawingW;
  appState.bpPortrait = isPortrait;
  if (window._appState) window._appState.bpPortrait = isPortrait;
  const fullImg = isPortrait
    ? renderToImage(1754, 2480, true)
    : renderToImage(2480, 1754, true);
  if (!cleanImg) { alert('Не удалось захватить чертёж'); return; }
  appState.planData     = cleanImg;
  appState.planDataFull = fullImg;
  if (window._appState) {
    window._appState.planData     = cleanImg;
    window._appState.planDataFull = fullImg;
  }
  alert('Чертёж захвачен ✓');
}

// ── Excel parse (preserved as-is) ────────────────────────────────

function parseFile(file, cb) {
  const r = new FileReader();
  r.onload = e => {
    try {
      const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
      const sh = wb.Sheets[wb.SheetNames[0]];
      cb(XLSX.utils.sheet_to_json(sh, { header: 1, defval: '' }), null);
    } catch (err) { cb(null, err); }
  };
  r.readAsArrayBuffer(file);
}

function smartParse(json) {
  if (!json || json.length < 2) return [];
  let hi = 0;
  for (let i = 0; i < Math.min(json.length, 15); i++) {
    if (json[i].filter(c => String(c || '').trim()).length >= 3) { hi = i; break; }
  }
  const mergeRows = Math.min(hi + 2, json.length);
  const h = json[hi].map((c, ci) => {
    let val = String(c || '').toLowerCase().trim();
    for (let r = hi + 1; r < mergeRows; r++) {
      const sub = String(json[r][ci] || '').toLowerCase().trim();
      if (sub) val = val ? val + ' ' + sub : sub;
    }
    return val;
  });
  const fi = (...kw) => { for (const k of kw) { const i = h.findIndex(x => x.includes(k)); if (i >= 0) return i; } return -1; };
  const cols = {
    name:  fi('наименование', 'вид работ', 'позиция', 'работ', 'материал', 'смр', 'name', 'description'),
    unit:  fi('ед. изм', 'ед.изм', 'единиц', 'ед ', 'unit', 'измер'),
    qty:   fi('кол-во', 'количество', 'объём', 'объем', 'кол ', 'qty', 'count'),
    price: fi('за ед', 'за единиц', 'цена за', 'расценка', 'тариф', 'rate', 'price'),
    total: fi('всего', 'итого', 'сумма', 'стоимость работ', 'amount', 'total'),
    note:  fi('примечание', 'коммент', 'note', 'comment', 'remarks'),
  };
  if (cols.name < 0) {
    const nonEmpty = h.map((_, i) => i).filter(i => h[i]);
    if (nonEmpty.length >= 2) {
      cols.name  = nonEmpty[1] ?? nonEmpty[0];
      cols.unit  = cols.unit  >= 0 ? cols.unit  : (nonEmpty[2] ?? -1);
      cols.qty   = cols.qty   >= 0 ? cols.qty   : (nonEmpty[3] ?? -1);
      cols.price = cols.price >= 0 ? cols.price : (nonEmpty[4] ?? -1);
      cols.total = cols.total >= 0 ? cols.total : (nonEmpty[5] ?? -1);
    }
  }
  const dataStart = mergeRows;
  const rows = [];
  const n = v => parseFloat(String(v || '').replace(/[^0-9.,\-]/g, '').replace(',', '.')) || 0;
  for (let i = dataStart; i < json.length; i++) {
    const row = json[i];
    const name = String(row[cols.name] || '').trim();
    if (!name) continue;
    if (/^итого|^всего|^total/i.test(name)) continue;
    const qty   = cols.qty   >= 0 ? n(row[cols.qty])   : 0;
    const price = cols.price >= 0 ? n(row[cols.price]) : 0;
    let   total = cols.total >= 0 ? n(row[cols.total]) : 0;
    if (!total && qty && price) total = qty * price;
    const note  = cols.note  >= 0 ? String(row[cols.note] || '').trim() : '';
    const unit  = cols.unit  >= 0 ? String(row[cols.unit]  || '').trim() : '';
    const isSection = !unit && !qty && !price && !total;
    rows.push({ name, unit, qty: qty || '', price: price || '', total: total || 0, note, isSection });
  }
  return rows;
}

// ── STATE ─────────────────────────────────────────────────────────

// Все данные сметы живут в appState (state.js):
// appState.smrRows, appState.smrRowsMasters, appState.smrMode,
// appState.matRows, appState.stages, appState.payments,
// appState.payCounter, appState.stageCounter, appState.totalDays
const STAGE_COLORS = ['#e07b39','#9b6dda','#5b8dd9','#4aaa6f','#da6d8a','#6da8b8','#a8b85b','#b85b6d'];
function _newStageId() { return 's' + (++appState.stageCounter); }
function _nextColor()  { return STAGE_COLORS[(appState.stageCounter - 1) % STAGE_COLORS.length]; }

// Rooms (from planner) — только текущая сессия, не персистируется
let _rooms = [];

// ── ROOMS ─────────────────────────────────────────────────────────

export function importRoomsFromPlanner(rooms) {
  _rooms = rooms.map(r => ({
    name:  r.name,
    floor: parseFloat(r.floorArea)  || 0,
    walls: parseFloat(r.wallsArea)  || 0,
    perim: parseFloat(r.perimeter)  || 0,
  }));
  _renderExpl();
}

function _syncRoomsFromState() {
  _rooms = (appState.rooms || []).map(r => ({
    name:  r.name,
    floor: r.area,
    walls: r.metrics?.wallAreaNetM2 ?? r.wallArea,
    perim: r.metrics?.perimeterFloorM ?? r.perimeter,
  }));
}

function _renderExpl() {
  // Legacy drawer
  const body = document.getElementById('explBody');
  // New inline header table
  const wrap = document.getElementById('objExplWrap');

  if (!_rooms.length) {
    if (body) body.innerHTML = '<div class="expl-empty">Нет данных. Создайте план на вкладке Чертёж.</div>';
    if (wrap) wrap.innerHTML = '<div class="obj-expl-empty">Нет данных. Создайте план на вкладке Чертёж.</div>';
    _updateHeader();
    return;
  }
  let tf = 0, tw = 0, tp = 0;

  // Drawer HTML (legacy)
  let drawerHtml = _rooms.map(r => {
    tf += r.floor; tw += r.walls; tp += r.perim;
    return `<div class="expl-row">
      <span class="expl-name">${esc(r.name)}</span>
      <span class="expl-num">${r.floor.toFixed(1)}</span>
      <span class="expl-num">${r.walls.toFixed(1)}</span>
      <span class="expl-num">${r.perim.toFixed(1)}</span>
    </div>`;
  }).join('');
  drawerHtml += `<div class="expl-row expl-total">
    <span class="expl-name">Итого</span>
    <span class="expl-num">${tf.toFixed(1)}</span>
    <span class="expl-num">${tw.toFixed(1)}</span>
    <span class="expl-num">${tp.toFixed(1)}</span>
  </div>`;
  if (body) body.innerHTML = drawerHtml;

  // Inline header table HTML
  tf = 0; tw = 0; tp = 0;
  let rows = _rooms.map(r => {
    tf += r.floor; tw += r.walls; tp += r.perim;
    return `<tr>
      <td>${esc(r.name)}</td>
      <td>${r.floor.toFixed(1)}</td>
      <td>${r.walls.toFixed(1)}</td>
      <td>${r.perim.toFixed(1)}</td>
    </tr>`;
  }).join('');
  rows += `<tr class="expl-total">
    <td>Итого</td>
    <td>${tf.toFixed(1)}</td>
    <td>${tw.toFixed(1)}</td>
    <td>${tp.toFixed(1)}</td>
  </tr>`;
  if (wrap) wrap.innerHTML = `<table class="obj-expl-tbl">
    <thead><tr>
      <th>Помещение</th><th>Пол м²</th><th>Стены м²</th><th>Пер. м</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;

  _updateHeader();
}

// ── HEADER BLOCK ──────────────────────────────────────────────────

function _updateHeader() {
  _updateTotals();
}

function _updateTotals() {
  const smrT = appState.smrRows.filter(r => !r.isSection).reduce((s, r) => s + (r.total || 0), 0);
  const matT = appState.matRows.filter(r => !r.isSection).reduce((s, r) => s + (r.total || 0), 0);
  const mastersSmrT = appState.smrRowsMasters.filter(r => !r.isSection).reduce((s, r) => s + (r.total || 0), 0);
  const el = id => document.getElementById(id);
  if (el('hdrSmr'))   el('hdrSmr').textContent   = fmtInt(smrT) + ' ₽';
  if (el('hdrMat'))   el('hdrMat').textContent   = fmtInt(matT) + ' ₽';
  if (el('hdrTotal')) el('hdrTotal').textContent = fmtInt(smrT + matT) + ' ₽';
  const activeSmrT = appState.smrMode === 'masters' ? mastersSmrT : smrT;
  if (el('smrFootTotal')) el('smrFootTotal').textContent = fmt(activeSmrT);
  if (el('matFootTotal')) el('matFootTotal').textContent = fmt(matT);
  const activeSmrRows = appState.smrMode === 'masters' ? appState.smrRowsMasters : appState.smrRows;
  if (el('smrCount')) el('smrCount').textContent = activeSmrRows.filter(r => !r.isSection).length + ' поз. · ' + fmtInt(activeSmrT) + ' ₽';
  if (el('matCount')) el('matCount').textContent = appState.matRows.filter(r => !r.isSection).length + ' поз. · ' + fmtInt(matT) + ' ₽';

  const mastersT = mastersSmrT;
  const marginT  = smrT + matT - mastersT;
  const totalDays = parseInt(document.getElementById('totalDaysSlider')?.value) || 0;

  if (el('hdrMasters')) el('hdrMasters').textContent = mastersT ? fmtInt(mastersT) + ' ₽' : '— ₽';

  if (el('hdrMargin') && (smrT + matT) > 0) {
    const pct = Math.round(marginT / (smrT + matT) * 100);
    el('hdrMargin').textContent = fmtInt(marginT) + ' ₽  (' + pct + '%)';
    el('hdrMargin').className = 'obj-meta-val accent' + (pct >= 30 ? ' margin-good' : pct >= 15 ? ' margin-mid' : ' margin-low');
  } else if (el('hdrMargin')) {
    el('hdrMargin').textContent = '—';
    el('hdrMargin').className = 'obj-meta-val accent';
  }

  if (el('hdrMarginDay') && totalDays > 0 && (smrT + matT) > 0) {
    el('hdrMarginDay').textContent = fmtInt(marginT / totalDays) + ' ₽/день';
  } else if (el('hdrMarginDay')) {
    el('hdrMarginDay').textContent = '—';
  }

  _updateHeaderDates();
}

function _updateHeaderDates() {
  const el = id => document.getElementById(id);
  // Читаем актуальное значение напрямую из инпута слайдера (источник истины)
  const sliderEl = el('totalDaysSlider');
  const totalDays = sliderEl ? (parseInt(sliderEl.value) || 0) : 0;

  // Обновляем строку "Срок" в шапке
  if (el('hdrDays')) el('hdrDays').textContent = totalDays ? totalDays + ' дн.' : '—';

  // Синхронизируем totalDaysVal (используется в _updateTotals для маржи/день)
  const valEl = el('totalDaysVal');
  if (valEl) valEl.textContent = totalDays || '';

  // Пересчитываем финиш через HTML-функцию (она учитывает только рабочие дни)
  if (typeof window._calcFinish === 'function') window._calcFinish();
}

// ── ROW DRAG-AND-DROP ─────────────────────────────────────────────
// Generic: works for both SMR and MAT tables
function _initRowDnd(tbody, rows, onReorder) {
  let dragSrc = null;
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
    const reset = () => {
      tr.draggable = false;
      document.removeEventListener('mouseup', reset);
    };
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
    if (!tbody.contains(e.relatedTarget)) {
      clearHighlights();
      dropTarget = null;
    }
  });

  tbody.addEventListener('drop', e => {
    e.preventDefault();
    if (!dragSrc || !dropTarget) { clearHighlights(); return; }
    const fromIdx = +dragSrc.dataset.rowIdx;
    let toIdx     = +dropTarget.tr.dataset.rowIdx;
    const pos     = dropTarget.position;
    clearHighlights();
    dropTarget = null;
    if (isNaN(fromIdx) || isNaN(toIdx) || fromIdx === toIdx) return;
    const [moved] = rows.splice(fromIdx, 1);
    const adjustedTo = fromIdx < toIdx ? toIdx - 1 : toIdx;
    const finalTo = pos === 'after' ? adjustedTo + 1 : adjustedTo;
    rows.splice(Math.min(finalTo, rows.length), 0, moved);
    onReorder();
  });

  tbody.addEventListener('dragend', () => {
    clearHighlights();
    dragSrc = null;
    dropTarget = null;
  });
}



// ── INSERT ZONES ──────────────────────────────────────────────────
function _initInsertZones(tbody, table) {
  // Close all open dropdowns
  function _closeAll() {
    tbody.querySelectorAll('.tr-insert-plus-wrap.open').forEach(w => {
      w.classList.remove('open');
      w.querySelector('.tr-insert-plus')?.classList.remove('active');
      w.closest('.tr-insert-btn')?.classList.remove('open');
    });
  }

  // Toggle dropdown on plus click
  tbody.querySelectorAll('.tr-insert-plus').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const wrap = btn.closest('.tr-insert-plus-wrap');
      const isOpen = wrap.classList.contains('open');
      _closeAll();
      if (!isOpen) {
        wrap.classList.add('open');
        btn.classList.add('active');
        wrap.closest('.tr-insert-btn').classList.add('open');
      }
    });
  });

  // Dropdown item click
  tbody.querySelectorAll('.tr-insert-dd-item').forEach(item => {
    item.addEventListener('click', e => {
      e.stopPropagation();
      const beforeIdx = +item.dataset.i;
      const isSection = item.dataset.section === '1';
      _closeAll();

      if (table === 'smr') {
        const newRow = isSection
          ? { name: '', isSection: true, _uid: _uid() }
          : { name: '', unit: '', qty: '', price: '', total: 0, note: '', isSection: false, _uid: _uid() };
        if (appState.smrMode === 'masters') {
          appState.smrRowsMasters.splice(beforeIdx, 0, newRow);
        } else {
          appState.smrRows.splice(beforeIdx, 0, newRow);
          appState.smrRowsMasters.splice(beforeIdx, 0, structuredClone(newRow));
        }
        _renderSmrTable();
        _updateTotals();
        if (isSection && appState.smrMode === 'client') _syncSectionsToGantt();
        setTimeout(() => {
          const tbody2 = document.getElementById('smrTbody');
          for (const tr of tbody2.querySelectorAll('tr')) {
            if (tr.classList.contains('tr-insert-zone')) continue;
            if (+tr.dataset.rowIdx === beforeIdx) { tr.querySelector('input')?.focus(); break; }
          }
        }, 30);
      } else {
        const newRow = isSection
          ? { name: '', isSection: true }
          : { name: '', unit: '', qty: '', price: '', total: 0, note: '', isSection: false };
        appState.matRows.splice(beforeIdx, 0, newRow);
        _renderMatTable();
        _updateTotals();
        setTimeout(() => {
          const tbody2 = document.getElementById('matTbody');
          for (const tr of tbody2.querySelectorAll('tr')) {
            if (tr.classList.contains('tr-insert-zone')) continue;
            if (+tr.dataset.rowIdx === beforeIdx) { tr.querySelector('input')?.focus(); break; }
          }
        }, 30);
      }
    });
  });

  // Close on outside click
  document.addEventListener('click', _closeAll, { capture: true, once: false });
}

export function handleSmr(e) {
  const f = e.target.files[0]; if (!f) return;
  parseFile(f, (json, err) => {
    if (err) { alert('Ошибка чтения файла'); return; }
    const rows = smartParse(json);
    if (appState.smrMode === 'masters') {
      rows.forEach(r => { if (!r._uid) r._uid = _uid(); });
      appState.smrRowsMasters = rows;
    } else {
      // Клиентский режим: проставляем UID и создаём независимые копии для мастеров
      rows.forEach(r => { if (!r._uid) r._uid = _uid(); });
      appState.smrRows = rows;
      appState.smrRowsMasters = rows.map(r => structuredClone(r));
    }
    _renderSmrTable();
    _updateTotals();
  });
}

export function initSmrManual() {
  appState.smrRows = [
    { name: '', isSection: true },
    { name: '', unit: 'м²', qty: '', price: '', total: 0, note: '', isSection: false }
  ];
  appState.smrRowsMasters = [];
  _renderSmrTable();
  _updateTotals();
}

function _renderSmrTable() {
  const rows = appState.smrMode === 'masters' ? appState.smrRowsMasters : appState.smrRows;
  const tbody = document.getElementById('smrTbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  let idx = 0;
  rows.forEach((r, i) => {
    // Insert zone BEFORE each row (for inserting above)
    const insZone = document.createElement('tr');
    insZone.className = 'tr-insert-zone';
    const insColspan = 9;
    insZone.innerHTML = `<td colspan="${insColspan}">
      <div class="tr-insert-btn">
        <div class="tr-insert-plus-wrap" data-i="${i}" data-table="smr">
          <button class="tr-insert-plus" title="Вставить">+</button>
          <div class="tr-insert-dropdown">
            <div class="tr-insert-dd-item dd-row" data-i="${i}" data-table="smr" data-section="0">
              <span class="dd-dot"></span>Строка
            </div>
            <div class="tr-insert-dd-item dd-sec" data-i="${i}" data-table="smr" data-section="1">
              <span class="dd-dot"></span>Раздел
            </div>
          </div>
        </div>
        <div class="tr-insert-line"></div>
      </div>
    </td>`;
    tbody.appendChild(insZone);

    const tr = document.createElement('tr');
    tr.draggable = false;
    tr.dataset.rowIdx = i;
    if (r.isSection) {
      tr.className = 'row-section';
      tr.innerHTML = `
        <td colspan="2"></td>
        <td colspan="4"><input class="inp-section" value="${esc(r.name)}" placeholder="Название раздела" data-i="${i}" data-f="name"></td>
        <td colspan="2"><button class="btn-row-del" data-i="${i}" data-table="smr" title="Удалить">×</button></td>`;
    } else {
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
  // Insert zone after last row
  const insLast = document.createElement('tr');
  insLast.className = 'tr-insert-zone';
  insLast.innerHTML = `<td colspan="9">
    <div class="tr-insert-btn">
      <div class="tr-insert-plus-wrap" data-i="${rows.length}" data-table="smr">
        <button class="tr-insert-plus" title="Вставить">+</button>
        <div class="tr-insert-dropdown">
          <div class="tr-insert-dd-item dd-row" data-i="${rows.length}" data-table="smr" data-section="0">
            <span class="dd-dot"></span>Строка
          </div>
          <div class="tr-insert-dd-item dd-sec" data-i="${rows.length}" data-table="smr" data-section="1">
            <span class="dd-dot"></span>Раздел
          </div>
        </div>
      </div>
      <div class="tr-insert-line"></div>
    </div>
  </td>`;
  tbody.appendChild(insLast);

  _bindSmrEvents(tbody);
  _initInsertZones(tbody, 'smr');
  _initRowDnd(tbody, rows, () => { _renderSmrTable(); _updateTotals(); });
}

function _bindSmrEvents(tbody) {
  const activeRows = appState.smrMode === 'masters' ? appState.smrRowsMasters : appState.smrRows;
  tbody.querySelectorAll('input, select').forEach(inp => {
    inp.addEventListener('input', e => {
      const i = +e.target.dataset.i;
      const f = e.target.dataset.f;
      activeRows[i][f] = e.target.value;
      if (f === 'qty' || f === 'price') {
        const r = activeRows[i];
        const q = parseFloat(r.qty) || 0;
        const p = parseFloat(r.price) || 0;
        r.total = q * p;
        const td = e.target.closest('tr').querySelector('.td-total');
        if (td) td.textContent = r.total ? fmtInt(r.total) : '';
        _updateTotals();
      }
      if (f === 'name' && activeRows[i].isSection && appState.smrMode === 'client') {
        _syncSectionsToGantt();
      }
      // Синхронизируем изменения поля в копию мастеров (только в клиентском режиме)
      if (appState.smrMode === 'client' && activeRows[i]?._uid !== undefined) {
        const masterRow = appState.smrRowsMasters.find(r => r._uid === activeRows[i]._uid);
        if (masterRow) {
          masterRow[f] = activeRows[i][f];
          if (f === 'qty' || f === 'price') masterRow.total = activeRows[i].total;
        }
      }
    });
  });
  tbody.querySelectorAll('.btn-row-del').forEach(btn => {
    btn.addEventListener('click', e => {
      const i = +e.target.dataset.i;
      const isClientMode = appState.smrMode === 'client';
      const activeRows = isClientMode ? appState.smrRows : appState.smrRowsMasters;
      const row = activeRows[i];
      const wasSection = row?.isSection;

      if (isClientMode) {
        // Удаляем из клиентского списка и синхронно из мастеров по _uid
        appState.smrRows.splice(i, 1);
        if (row?._uid !== undefined) {
          const masterIdx = appState.smrRowsMasters.findIndex(r => r._uid === row._uid);
          if (masterIdx !== -1) appState.smrRowsMasters.splice(masterIdx, 1);
        }
      } else {
        // Удаляем только из мастеров — клиентский список не трогаем
        appState.smrRowsMasters.splice(i, 1);
      }
      _renderSmrTable();
      _updateTotals();
      if (wasSection && appState.smrMode === 'client') _syncSectionsToGantt();
    });
  });
}

export function addSmrRow(isSection = false) {
  const newRow = isSection
    ? { name: '', isSection: true, _uid: _uid() }
    : { name: '', unit: '', qty: '', price: '', total: 0, note: '', isSection: false, _uid: _uid() };
  if (appState.smrMode === 'masters') {
    appState.smrRowsMasters.push(newRow);
  } else {
    appState.smrRows.push(newRow);
    appState.smrRowsMasters.push(structuredClone(newRow));
  }
  _renderSmrTable();
  _updateTotals();
  if (isSection && appState.smrMode === 'client') _syncSectionsToGantt();
  setTimeout(() => {
    const inputs = document.querySelectorAll('#smrTbody input.inp-name, #smrTbody input.inp-section');
    inputs[inputs.length - 1]?.focus();
  }, 30);
}

// Insert a row/section at a specific index
export function insertSmrRow(afterIdx, isSection = false) {
  const newRow = isSection
    ? { name: '', isSection: true, _uid: _uid() }
    : { name: '', unit: '', qty: '', price: '', total: 0, note: '', isSection: false, _uid: _uid() };
  if (appState.smrMode === 'masters') {
    appState.smrRowsMasters.splice(afterIdx + 1, 0, newRow);
  } else {
    appState.smrRows.splice(afterIdx + 1, 0, newRow);
    appState.smrRowsMasters.splice(afterIdx + 1, 0, structuredClone(newRow));
  }
  _renderSmrTable();
  _updateTotals();
  if (isSection && appState.smrMode === 'client') _syncSectionsToGantt();
  setTimeout(() => {
    const tbody = document.getElementById('smrTbody');
    if (!tbody) return;
    for (const tr of tbody.querySelectorAll('tr')) {
      if (tr.classList.contains('tr-insert-zone')) continue;
      if (+tr.dataset.rowIdx === afterIdx + 1) {
        const inp = tr.querySelector('input.inp-name, input.inp-section');
        if (inp) inp.focus();
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
  _renderSmrTable();
  _updateTotals();
}

export function setSmrMode(mode) {
  if (mode === appState.smrMode) return;
  appState.smrMode = mode;
  // Если переключаемся на мастеров и их массив пустой — создаём независимые копии
  if (mode === 'masters' && appState.smrRowsMasters.length === 0 && appState.smrRows.length > 0) {
    appState.smrRows.forEach(r => { if (!r._uid) r._uid = _uid(); });
    appState.smrRowsMasters = appState.smrRows.map(r => structuredClone(r));
  }
  const btnClient  = document.getElementById('smrBtnClient');
  const btnMasters = document.getElementById('smrBtnMasters');
  if (btnClient)  btnClient.classList.toggle('active',  mode === 'client');
  if (btnMasters) btnMasters.classList.toggle('active', mode === 'masters');
  _renderSmrTable();
  _updateTotals();
}

// Collect for KP/PDF
export function collectSmrRows() { return appState.smrRows; }
export function getSmrTotal() {
  return appState.smrRows.filter(r => !r.isSection).reduce((s, r) => s + (r.total || 0), 0);
}
export function getMastersSmrTotal() {
  return appState.smrRowsMasters.filter(r => !r.isSection).reduce((s, r) => s + (r.total || 0), 0);
}

// ── MATERIALS TABLE ───────────────────────────────────────────────

export function handleMat(e) {
  const f = e.target.files[0]; if (!f) return;
  parseFile(f, (json, err) => {
    if (err) { alert('Ошибка чтения файла'); return; }
    const rows = smartParse(json);
    appState.matRows = rows;
    _renderMatTable();
    _updateTotals();
  });
}

export function initMatManual() {
  appState.matRows = [];
  appState.matRows.push({ name: '', isSection: true });
  appState.matRows.push({ name: '', unit: 'шт', qty: '', price: '', total: 0, note: '', isSection: false });
  _renderMatTable();
  _updateTotals();
}

function _renderMatTable() {
  const tbody = document.getElementById('matTbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  let idx = 0;
  appState.matRows.forEach((r, i) => {
    const insZone = document.createElement('tr');
    insZone.className = 'tr-insert-zone';
    insZone.innerHTML = `<td colspan="9">
      <div class="tr-insert-btn">
        <div class="tr-insert-plus-wrap" data-i="${i}" data-table="mat">
          <button class="tr-insert-plus" title="Вставить">+</button>
          <div class="tr-insert-dropdown">
            <div class="tr-insert-dd-item dd-row" data-i="${i}" data-table="mat" data-section="0">
              <span class="dd-dot"></span>Строка
            </div>
            <div class="tr-insert-dd-item dd-sec" data-i="${i}" data-table="mat" data-section="1">
              <span class="dd-dot"></span>Раздел
            </div>
          </div>
        </div>
        <div class="tr-insert-line"></div>
      </div>
    </td>`;
    tbody.appendChild(insZone);

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
  // Insert zone after last row
  const insLast = document.createElement('tr');
  insLast.className = 'tr-insert-zone';
  insLast.innerHTML = `<td colspan="9">
    <div class="tr-insert-btn">
      <div class="tr-insert-plus-wrap" data-i="${appState.matRows.length}" data-table="mat">
        <button class="tr-insert-plus" title="Вставить">+</button>
        <div class="tr-insert-dropdown">
          <div class="tr-insert-dd-item dd-row" data-i="${appState.matRows.length}" data-table="mat" data-section="0">
            <span class="dd-dot"></span>Строка
          </div>
          <div class="tr-insert-dd-item dd-sec" data-i="${appState.matRows.length}" data-table="mat" data-section="1">
            <span class="dd-dot"></span>Раздел
          </div>
        </div>
      </div>
      <div class="tr-insert-line"></div>
    </div>
  </td>`;
  tbody.appendChild(insLast);

  _bindMatEvents(tbody);
  _initInsertZones(tbody, 'mat');
  _initRowDnd(tbody, appState.matRows, () => { _renderMatTable(); _updateTotals(); });
}

function _bindMatEvents(tbody) {
  tbody.querySelectorAll('input, select').forEach(inp => {
    inp.addEventListener('input', e => {
      const i = +e.target.dataset.i;
      const f = e.target.dataset.f;
      appState.matRows[i][f] = e.target.value;
      if (f === 'qty' || f === 'price') {
        const r = appState.matRows[i];
        const q = parseFloat(r.qty) || 0;
        const p = parseFloat(r.price) || 0;
        r.total = q * p;
        const td = e.target.closest('tr').querySelector('.td-total');
        if (td) td.textContent = r.total ? fmtInt(r.total) : '';
        _updateTotals();
      }
    });
  });
  tbody.querySelectorAll('.btn-row-del').forEach(btn => {
    btn.addEventListener('click', e => {
      const i = +e.target.dataset.i;
      appState.matRows.splice(i, 1);
      _renderMatTable();
      _updateTotals();
    });
  });
}

export function addMatRow(isSection = false) {
  appState.matRows.push(isSection
    ? { name: '', isSection: true }
    : { name: '', unit: '', qty: '', price: '', total: 0, note: '', isSection: false }
  );
  _renderMatTable();
  _updateTotals();
  setTimeout(() => {
    const inputs = document.querySelectorAll('#matTbody input.inp-name, #matTbody input.inp-section');
    inputs[inputs.length - 1]?.focus();
  }, 30);
}

export function clearMat() {
  appState.matRows = [];
  _updateTotals();
}

export function insertMatRow(afterIdx, isSection = false) {
  const newRow = isSection
    ? { name: '', isSection: true }
    : { name: '', unit: '', qty: '', price: '', total: 0, note: '', isSection: false };
  appState.matRows.splice(afterIdx + 1, 0, newRow);
  _renderMatTable();
  _updateTotals();
  setTimeout(() => {
    const tbody = document.getElementById('matTbody');
    if (!tbody) return;
    for (const tr of tbody.querySelectorAll('tr')) {
      if (tr.classList.contains('tr-insert-zone')) continue;
      if (+tr.dataset.rowIdx === afterIdx + 1) {
        const inp = tr.querySelector('input.inp-name, input.inp-section');
        if (inp) inp.focus();
        break;
      }
    }
  }, 30);
}

export function collectMatRows() { return appState.matRows; }
export function getMatTotal() {
  return appState.matRows.filter(r => !r.isSection).reduce((s, r) => s + (r.total || 0), 0);
}

// ── SECTION → GANTT SYNC ──────────────────────────────────────────
// When sections in SMR change, sync them as Gantt stages
function _syncSectionsToGantt() {
  const sections = appState.smrRows.filter(r => r.isSection && r.name && r.name.trim());
  const sectionNames = new Set(sections.map(s => s.name.trim()));

  // Remove stages that no longer have a matching section
  appState.stages = appState.stages.filter(s => sectionNames.has(s.name));

  // Add new stages for sections not yet in gantt
  sections.forEach(sec => {
    const name = sec.name.trim();
    if (!name) return;
    const existing = appState.stages.find(s => s.name === name);
    if (!existing) {
      const id    = _newStageId();
      const color = _nextColor();
      const lastEnd = appState.stages.reduce((m, s) => Math.max(m, s.pct + s.w), 0);
      appState.stages.push({ id, name, color, pct: Math.min(lastEnd, 90), w: 10, daysAuto: 0, daysOverride: null, parallelWithPrev: false });
    }
  });

  _renderGantt();
  _renderPayments();
}

// ── GANTT ─────────────────────────────────────────────────────────

// appState.totalDays — хранится в state.js (по умолчанию 60)
// appState.ganttMode — 'stages' | 'works'
let _dragging  = null; // { idx, type:'bar'|'left'|'right', startX, origPct, origW, trackW }

function _renderGantt() {
  const wrap = document.getElementById('ganttBars');
  if (!wrap) return;
  const mode = appState.ganttMode || 'stages';

  if (mode === 'works') {
    _renderGanttWorks(wrap);
    _renderGanttRuler();
    return;
  }

  // ── Режим "По этапам" (дефолт) ──────────────────────────────────
  if (!appState.stages.length) {
    wrap.innerHTML = '<div style="padding:20px 0;text-align:center;font-size:12px;color:#bbb">Этапы появятся когда вы добавите строки в смету и укажете им этапы</div>';
    _renderGanttRuler();
    return;
  }

  // Убеждаемся что daysAuto посчитан
  _recalcAllStageDaysAuto();

  const totalDays = appState.totalDays || 1;

  // Позиционируем этапы с учётом parallelWithPrev
  let cursor = 0;
  appState.stages.forEach((s, i) => {
    const dur = (s.daysOverride != null ? s.daysOverride : s.daysAuto) || 0;
    const start = (s.parallelWithPrev && i > 0)
      ? (appState.stages[i - 1]._startDay || 0)
      : cursor;
    s._startDay = start;
    if (!s.parallelWithPrev) cursor = start + dur;
  });

  wrap.innerHTML = '';
  appState.stages.forEach((s, idx) => {
    const hasAuto = (s.daysAuto || 0) > 0;
    const dur = s.daysOverride != null ? s.daysOverride : (s.daysAuto || 0);
    const startDay = s._startDay || 0;
    const pct  = totalDays > 0 ? (startDay / totalDays * 100) : s.pct;
    const wPct = totalDays > 0 && dur > 0 ? (dur / totalDays * 100) : s.w;
    const isOverride = s.daysOverride != null;
    const isParallel = s.parallelWithPrev && idx > 0;

    const row  = document.createElement('div');
    row.className = 'gantt-row';

    const ticksHtml = dur > 0 ? Array.from({length: dur + 1}, (_, ti) => {
      const leftPct = (ti / dur * 100).toFixed(2);
      return `<div class="gantt-tick-mark" style="left:${leftPct}%"></div>`;
    }).join('') : '';

    row.innerHTML = `
      <div class="gantt-row-label">
        ${idx > 0
          ? `<button class="gantt-parallel-btn${isParallel ? ' active' : ''}" data-sidx="${idx}" title="Параллельно с предыдущим этапом" style="font-size:13px">⇉</button>`
          : '<span style="width:22px;display:inline-block"></span>'}
        <span class="gantt-stage-dot" style="background:${s.color}"></span>
        <span class="gantt-stage-name" contenteditable="true" data-idx="${idx}">${esc(s.name)}</span>
        ${hasAuto && !isOverride
          ? `<span class="gantt-stage-days" title="Автоматически из работ">🔒 ${dur} дн.</span>
             <button class="gantt-unlock-btn" data-sidx="${idx}" title="Задать вручную">✏️</button>`
          : `<input type="number" min="1" max="999" class="gantt-stage-days-inp" data-sidx="${idx}" value="${dur || ''}" placeholder="0"
               style="width:42px;padding:2px 4px;border-radius:4px;border:1px solid var(--border-1);font-size:11px;
                      text-align:center;background:var(--bg-card);color:var(--text-1);font-family:var(--font-mono);
                      -moz-appearance:textfield;appearance:textfield;outline:none;">
             <span style="font-size:10px;color:var(--text-3)">дн.</span>
             ${hasAuto ? `<button class="gantt-lock-btn" data-sidx="${idx}" title="Вернуть авторасчёт">🔓</button>` : ''}`
        }
      </div>
      <div class="gantt-track-wrap">
        <div class="gantt-track">
          ${wPct > 0 ? `<div class="gantt-bar" data-idx="${idx}" style="left:${pct.toFixed(2)}%;width:${wPct.toFixed(2)}%;background:${s.color};${!isOverride && hasAuto ? 'opacity:0.85;' : ''}">
            ${!isOverride && hasAuto ? '' : `<div class="gantt-handle gantt-handle-l" data-idx="${idx}" data-edge="left"></div>`}
            <div class="gantt-ticks">${ticksHtml}</div>
            <span class="gantt-bar-label">${dur} дн.</span>
            ${!isOverride && hasAuto ? '' : `<div class="gantt-handle gantt-handle-r" data-idx="${idx}" data-edge="right"></div>`}
          </div>` : `<div class="gantt-bar" data-idx="${idx}" style="left:${s.pct}%;width:${s.w}%;background:${s.color}">
            <div class="gantt-handle gantt-handle-l" data-idx="${idx}" data-edge="left"></div>
            <div class="gantt-ticks"></div>
            <span class="gantt-bar-label">${Math.max(1, Math.round(totalDays * s.w / 100))} дн.</span>
            <div class="gantt-handle gantt-handle-r" data-idx="${idx}" data-edge="right"></div>
          </div>`}
        </div>
      </div>`;
    wrap.appendChild(row);

    // Редактирование названия
    const nameEl = row.querySelector('.gantt-stage-name');
    nameEl.addEventListener('blur', () => {
      appState.stages[idx].name = nameEl.textContent.trim();
      _renderPayments();
    });

    // Кнопка параллельности этапа
    const parBtn = row.querySelector('.gantt-parallel-btn[data-sidx]');
    if (parBtn) {
      parBtn.addEventListener('click', () => {
        appState.stages[idx].parallelWithPrev = !appState.stages[idx].parallelWithPrev;
        _recalcTotalDaysAuto();
        _renderGantt();
        _renderPayments();
      });
    }

    // Кнопка "разблокировать" (✏️ → ручной режим)
    const unlockBtn = row.querySelector('.gantt-unlock-btn');
    if (unlockBtn) {
      unlockBtn.addEventListener('click', () => {
        appState.stages[idx].daysOverride = appState.stages[idx].daysAuto || 0;
        _renderGantt();
      });
    }

    // Кнопка "вернуть авто" (🔓)
    const lockBtn = row.querySelector('.gantt-lock-btn');
    if (lockBtn) {
      lockBtn.addEventListener('click', () => {
        appState.stages[idx].daysOverride = null;
        _recalcTotalDaysAuto();
        _renderGantt();
      });
    }

    // Инпут ручных дней
    const daysInp = row.querySelector('.gantt-stage-days-inp');
    if (daysInp) {
      daysInp.addEventListener('input', () => {
        const val = Math.max(0, parseInt(daysInp.value) || 0);
        appState.stages[idx].daysOverride = val > 0 ? val : null;
        _recalcTotalDaysAuto();
        _renderGanttRuler();
        _renderPayments();
      });
    }

    // Drag handles (только если нет авто-лока)
    if (isOverride || !hasAuto) {
      row.querySelectorAll('.gantt-handle').forEach(h => {
        h.addEventListener('mousedown', e => {
          e.preventDefault(); e.stopPropagation();
          const track  = h.closest('.gantt-track');
          const trackW = track.getBoundingClientRect().width;
          _dragging = { idx, type: h.dataset.edge, startX: e.clientX, origPct: s.pct, origW: s.w, trackW };
          document.body.style.cursor = 'ew-resize';
          document.body.style.userSelect = 'none';
        });
      });

      const bar = row.querySelector('.gantt-bar');
      if (bar) {
        bar.addEventListener('mousedown', e => {
          if (e.target.classList.contains('gantt-handle')) return;
          e.preventDefault();
          const track  = bar.closest('.gantt-track');
          const trackW = track.getBoundingClientRect().width;
          _dragging = { idx, type: 'bar', startX: e.clientX, origPct: s.pct, origW: s.w, trackW };
          document.body.style.cursor = 'grabbing';
          document.body.style.userSelect = 'none';
        });
      }
    }
  });

  _renderGanttRuler();
}

// ── Режим "По работам" ────────────────────────────────────────────
// workDays: { [_uid]: days }, workParallel: { [_uid]: bool }
// Группировка по разделам, daysAuto этапа пересчитывается автоматически.

function _calcStageDaysAuto(stageName) {
  let inside = false;
  let auto = 0;
  let prevDays = 0;
  for (const r of appState.smrRows) {
    if (r.isSection) {
      if (inside) break;
      inside = (r.name && r.name.trim() === stageName);
      continue;
    }
    if (!inside) continue;
    const d = appState.workDays?.[r._uid] || 0;
    const isParallel = appState.workParallel?.[r._uid] || false;
    if (isParallel && prevDays > 0) {
      auto = auto - prevDays + Math.max(prevDays, d);
    } else {
      auto += d;
    }
    prevDays = d;
  }
  return auto;
}

function _recalcAllStageDaysAuto() {
  if (!appState.stages) return;
  appState.stages.forEach(s => { s.daysAuto = _calcStageDaysAuto(s.name); });
  _recalcTotalDaysAuto();
}

function _recalcTotalDaysAuto() {
  if (!appState.stages || !appState.stages.length) return;
  let cursor = 0;
  let maxEnd = 0;
  appState.stages.forEach((s, i) => {
    const dur = (s.daysOverride != null ? s.daysOverride : s.daysAuto) || 0;
    const start = (s.parallelWithPrev && i > 0)
      ? (appState.stages[i - 1]._startDay || 0)
      : cursor;
    s._startDay = start;
    const end = start + dur;
    if (!s.parallelWithPrev) cursor = end;
    if (end > maxEnd) maxEnd = end;
  });
  if (!appState.totalDaysOverride && maxEnd > 0) {
    const inp = document.getElementById('totalDaysSlider');
    if (inp) {
      inp.value = maxEnd;
      appState.totalDays = maxEnd;
      const valEl = document.getElementById('totalDaysVal');
      if (valEl) valEl.textContent = maxEnd;
      _updateHeaderDates();
    }
  }
}

function _renderGanttWorks(wrap) {
  if (!appState.workDays)    appState.workDays    = {};
  if (!appState.workParallel) appState.workParallel = {};
  if (!appState.workStart)   appState.workStart   = {};

  // Собираем группы по разделам
  const groups = [];
  let curGroup = null;
  appState.smrRows.forEach(r => {
    if (r.isSection) {
      const stageName = r.name?.trim() || '';
      const stage = appState.stages.find(s => s.name === stageName);
      const color = stage ? stage.color : '#9b9b9b';
      curGroup = { stageName, color, stage, rows: [] };
      groups.push(curGroup);
    } else if (r.name) {
      if (!curGroup) {
        curGroup = { stageName: '', color: '#9b9b9b', stage: null, rows: [] };
        groups.push(curGroup);
      }
      curGroup.rows.push(r);
    }
  });

  const allWorkRows = groups.flatMap(g => g.rows);
  if (!allWorkRows.length) {
    wrap.innerHTML = '<div style="padding:20px 0;text-align:center;font-size:12px;color:#bbb">Добавьте работы в смету — они появятся здесь</div>';
    return;
  }

  _recalcAllStageDaysAuto();

  // Авторасчёт totalDays: считаем последний нужный день всех работ
  let autoTotal = 0;
  groups.forEach(g => {
    let cursor = 0;
    g.rows.forEach((r, ri) => {
      const uid = r._uid;
      const days = appState.workDays[uid] || 0;
      const startOffset = appState.workStart[uid] || 0;
      const isParallel = ri > 0 && (appState.workParallel[uid] || false);
      const prevUid = ri > 0 ? g.rows[ri - 1]._uid : null;
      const prevDays = prevUid ? (appState.workDays[prevUid] || 0) : 0;
      const baseStart = isParallel ? Math.max(0, cursor - prevDays) : cursor;
      const barStart = baseStart + startOffset;
      autoTotal = Math.max(autoTotal, barStart + days);
      if (!isParallel) cursor += days;
      else cursor = Math.max(cursor, baseStart + Math.max(prevDays, days));
    });
  });

  // Берём max(ручной, авто) — никогда не позволяем барам вылезти за границу
  const manualTotal = parseInt(document.getElementById('totalDaysSlider')?.value) || 0;
  let totalDays = Math.max(manualTotal, autoTotal) || 1;

  // Обновляем поле общего срока автоматически
  const sliderEl = document.getElementById('totalDaysSlider');
  if (sliderEl && String(totalDays) !== sliderEl.value) {
    sliderEl.value = totalDays;
    appState.totalDays = totalDays;
  }

  wrap.innerHTML = '';

  groups.forEach(g => {
    if (!g.rows.length) return;

    const daysAuto = g.stage ? (g.stage.daysAuto || 0) : 0;
    const groupHead = document.createElement('div');
    groupHead.className = 'gantt-works-group-head';
    groupHead.innerHTML = `
      <span class="gantt-stage-dot" style="background:${g.color}"></span>
      <span style="font-size:11px;font-weight:600;color:var(--text-1);flex:1">${esc(g.stageName || 'Без этапа')}</span>
      ${g.stage ? `<span class="gantt-works-auto-days">${daysAuto} дн. авто</span>` : ''}`;
    wrap.appendChild(groupHead);

    let cursorInGroup = 0;
    g.rows.forEach((r, ri) => {
      const uid = r._uid;
      const days = appState.workDays[uid] || 0;
      const startOffset = appState.workStart[uid] || 0;
      const isParallel = ri > 0 && (appState.workParallel[uid] || false);
      const prevUid = ri > 0 ? g.rows[ri - 1]._uid : null;
      const prevDays = prevUid ? (appState.workDays[prevUid] || 0) : 0;

      const baseStart = isParallel ? Math.max(0, cursorInGroup - prevDays) : cursorInGroup;
      const barStart = Math.max(0, baseStart + startOffset);
      const pct  = totalDays > 0 ? (barStart / totalDays * 100) : 0;
      const wPct = totalDays > 0 ? (days     / totalDays * 100) : 0;

      const ticksHtml = days > 0 ? Array.from({length: days + 1}, (_, ti) => {
        const leftPct = (ti / days * 100).toFixed(2);
        return `<div class="gantt-tick-mark" style="left:${leftPct}%"></div>`;
      }).join('') : '';

      const row = document.createElement('div');
      row.className = 'gantt-row gantt-works-row';
      row.innerHTML = `
        <div class="gantt-row-label" style="gap:5px;padding-left:20px">
          <span class="gantt-work-name" title="${esc(r.name)}">${esc(r.name)}</span>
          <input type="number" min="0" max="999" value="${days || ''}"
            placeholder="0"
            data-uid="${uid}"
            style="width:42px;flex-shrink:0;padding:2px 4px;border-radius:4px;border:1px solid var(--border-1);
                   font-size:11px;text-align:center;background:var(--bg-card);color:var(--text-1);
                   font-family:var(--font-mono);-moz-appearance:textfield;appearance:textfield;outline:none;"
            class="gantt-work-days-inp">
          <span style="font-size:10px;color:var(--text-3);min-width:16px;flex-shrink:0">дн.</span>
        </div>
        <div class="gantt-track-wrap">
          <div class="gantt-track">
            ${days > 0 ? `<div class="gantt-bar gantt-work-bar" data-uid="${uid}" style="left:${pct.toFixed(2)}%;width:${Math.max(wPct, 0.5).toFixed(2)}%;background:${g.color};opacity:${isParallel ? '0.72' : '1'};cursor:grab;">
              <div class="gantt-handle gantt-handle-l gantt-work-handle" data-uid="${uid}" data-edge="left"></div>
              <div class="gantt-ticks">${ticksHtml}</div>
              <span class="gantt-bar-label">${days} дн.</span>
              <div class="gantt-handle gantt-handle-r gantt-work-handle" data-uid="${uid}" data-edge="right"></div>
            </div>` : ''}
          </div>
        </div>`;
      wrap.appendChild(row);

      if (!isParallel) cursorInGroup += days;
      else cursorInGroup = Math.max(0, cursorInGroup - prevDays) + Math.max(prevDays, days);
    });
  });

  wrap.querySelectorAll('.gantt-work-days-inp').forEach(inp => {
    // Обновляем state при вводе, но НЕ ре-рендерим (чтобы не терять фокус)
    inp.addEventListener('input', () => {
      if (!appState.workDays) appState.workDays = {};
      appState.workDays[inp.dataset.uid] = Math.max(0, parseInt(inp.value) || 0);
    });
    // Полный ре-рендер только когда ушли из поля или нажали Enter
    const commit = () => {
      _recalcAllStageDaysAuto();
      _renderGanttWorks(wrap);
      _renderGanttRuler();
      _updateTotals();
    };
    inp.addEventListener('blur', commit);
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { inp.blur(); } });
  });

  // Drag хэндлов и бара для работ
  wrap.querySelectorAll('.gantt-work-bar').forEach(bar => {
    const uid = bar.dataset.uid;

    // Drag по центру бара — перемещение (startOffset)
    bar.addEventListener('mousedown', e => {
      if (e.target.classList.contains('gantt-handle')) return;
      e.preventDefault(); e.stopPropagation();
      const track = bar.closest('.gantt-track');
      const trackW = track.getBoundingClientRect().width;
      const startX = e.clientX;
      const origOffset = appState.workStart[uid] || 0;
      const tDays = appState.totalDays || 1;
      document.body.style.cursor = 'grabbing';
      document.body.style.userSelect = 'none';

      function onMove(ev) {
        const dx = ev.clientX - startX;
        const delta = Math.round(dx / trackW * tDays);
        appState.workStart[uid] = origOffset + delta;
        _renderGanttWorks(wrap);
        _renderGanttRuler();
      }
      function onUp() {
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        _recalcAllStageDaysAuto();
        _renderGanttWorks(wrap);
        _renderGanttRuler();
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  });

  wrap.querySelectorAll('.gantt-work-handle').forEach(h => {
    h.addEventListener('mousedown', e => {
      e.preventDefault(); e.stopPropagation();
      const uid = h.dataset.uid;
      const bar = h.closest('.gantt-bar');
      const track = h.closest('.gantt-track');
      const trackW = track.getBoundingClientRect().width;
      const startX = e.clientX;
      const startDays = appState.workDays[uid] || 0;
      const startOffset = appState.workStart[uid] || 0;
      const edge = h.dataset.edge; // 'left' | 'right'
      const tDays = appState.totalDays || 1;
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';

      function onMove(ev) {
        const dx = ev.clientX - startX;
        const daysDelta = Math.round(dx / trackW * tDays);
        if (edge === 'right') {
          const newDays = Math.max(1, startDays + daysDelta);
          appState.workDays[uid] = newDays;
          const inp = wrap.querySelector(`.gantt-work-days-inp[data-uid="${uid}"]`);
          if (inp) inp.value = newDays;
        } else {
          // left handle — двигаем начало, уменьшаем/увеличиваем длину
          const newOffset = startOffset + daysDelta;
          const newDays = Math.max(1, startDays - daysDelta);
          appState.workStart[uid] = newOffset;
          appState.workDays[uid] = newDays;
          const inp = wrap.querySelector(`.gantt-work-days-inp[data-uid="${uid}"]`);
          if (inp) inp.value = newDays;
        }
        _renderGanttWorks(wrap);
        _renderGanttRuler();
      }

      function onUp() {
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        _recalcAllStageDaysAuto();
        _renderGanttWorks(wrap);
        _renderGanttRuler();
        _updateTotals();
      }

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  });
}

// Публичная функция переключения режима Ганта
export function setGanttMode(mode) {
  appState.ganttMode = mode; // 'stages' | 'works'
  // Обновляем кнопки-переключатели
  const btnStages = document.getElementById('ganttBtnStages');
  const btnWorks  = document.getElementById('ganttBtnWorks');
  if (btnStages) btnStages.classList.toggle('active', mode === 'stages');
  if (btnWorks)  btnWorks.classList.toggle('active',  mode === 'works');
  _renderGantt();
}

function _updateGanttBarDOM(idx) {
  const s = appState.stages[idx];
  const bar = document.querySelector(`.gantt-bar[data-idx="${idx}"]`);
  if (!bar) return;
  bar.style.left  = s.pct + '%';
  bar.style.width = s.w   + '%';
  const days = Math.max(1, Math.round(appState.totalDays * s.w / 100));
  const lbl = bar.querySelector('.gantt-bar-label');
  if (lbl) lbl.textContent = days + ' дн.';
  // update tick marks
  const ticks = bar.querySelector('.gantt-ticks');
  if (ticks) {
    ticks.innerHTML = Array.from({length: days + 1}, (_, ti) =>
      `<div class="gantt-tick-mark" style="left:${(ti / days * 100).toFixed(2)}%"></div>`
    ).join('');
  }
  const rows = document.querySelectorAll('.gantt-row');
  if (rows[idx]) {
    const dEl = rows[idx].querySelector('.gantt-stage-days');
    if (dEl) dEl.textContent = days + ' дн.';
  }
}

function _renderGanttRuler() {
  const ruler = document.getElementById('ganttRuler');
  if (!ruler) return;
  ruler.innerHTML = '';
  const totalDays = parseInt(document.getElementById('totalDaysSlider')?.value) || appState.totalDays || 0;
  if (!totalDays) return;
  const ticks = Math.min(totalDays, 12);
  for (let i = 0; i <= ticks; i++) {
    const t = document.createElement('span');
    t.className = 'gantt-tick';
    t.textContent = Math.round(totalDays * i / ticks);
    t.style.left = (i / ticks * 100) + '%';
    ruler.appendChild(t);
  }
}

function _initGanttDrag() {
  document.addEventListener('mousemove', e => {
    if (!_dragging) return;
    const { idx, type, startX, origPct, origW, trackW } = _dragging;
    if (!trackW) return;
    const dx   = e.clientX - startX;
    const dpct = dx / trackW * 100;
    const s    = appState.stages[idx];
    // Шаг снэппинга = 1 рабочий день в процентах
    const snap = appState.totalDays > 0 ? (100 / appState.totalDays) : 1;

    if (type === 'bar') {
      let rawPct = Math.max(0, Math.min(origPct + dpct, 100 - origW));
      s.pct = Math.round(rawPct / snap) * snap;
    } else if (type === 'left') {
      let rawPct = Math.max(0, Math.min(origPct + dpct, origPct + origW - snap));
      rawPct = Math.round(rawPct / snap) * snap;
      s.w   = origW - (rawPct - origPct);
      s.pct = rawPct;
    } else {
      let rawW = Math.max(snap, Math.min(origW + dpct, 100 - origPct));
      s.w = Math.round(rawW / snap) * snap;
    }
    _updateGanttBarDOM(idx);
  });

  document.addEventListener('mouseup', () => {
    if (!_dragging) return;
    _dragging = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    _renderPayments();
  });
}

// Public: add a new stage (called from stage select in smr table)
export function ensureStage(name) {
  const existing = appState.stages.find(s => s.name === name);
  if (existing) return existing.id;
  const id    = _newStageId();
  const color = _nextColor();
  // place after last stage, width 10%
  const lastEnd = appState.stages.reduce((m, s) => Math.max(m, s.pct + s.w), 0);
  appState.stages.push({ id, name, color, pct: Math.min(lastEnd, 90), w: 10, daysAuto: 0, daysOverride: null, parallelWithPrev: false });
  _renderGantt();
  _renderPayments();
  return id;
}

// ── STAGE REAL AMOUNTS ────────────────────────────────────────────
// Sum SMR rows belonging to a section whose name matches the stage name
function _getStageAmount(stageName) {
  let total = 0;
  let inSection = false;
  for (const r of appState.smrRows) {
    if (r.isSection) {
      inSection = (r.name && r.name.trim() === stageName);
      continue;
    }
    if (inSection) total += r.total || 0;
  }
  return total;
}

// Sum of all stages that have a matching section
function _getStagesTotalReal() {
  return appState.stages.reduce((s, st) => s + _getStageAmount(st.name), 0);
}

// ── PAYMENTS ─────────────────────────────────────────────────────

// Payment groups: array of { id, name, stageIds[] }
// appState.payments и appState.payCounter объявлены в state.js

function _renderPayments() {
  const wrap = document.getElementById('paymentsWrap');
  if (!wrap) return;
  const grandTotal = getSmrTotal() + getMatTotal();

  wrap.innerHTML = '';

  // Two-column layout: left = payment slots, right = stage pool
  const layout = document.createElement('div');
  layout.className = 'pay-layout';

  // LEFT: payment slots
  const leftCol = document.createElement('div');
  leftCol.className = 'pay-left';

  appState.payments.forEach((p, pi) => {
    // Sum real amounts of assigned stages
    const amount = p.stageIds.reduce((s, id) => {
      const st = appState.stages.find(x => x.id === id);
      return s + (st ? _getStageAmount(st.name) : 0);
    }, 0);
    const totalReal = _getStagesTotalReal() || grandTotal || 1;
    const pct = totalReal > 0 ? Math.round(amount / totalReal * 100) : 0;

    const card = document.createElement('div');
    card.className = 'pay-slot';
    card.dataset.pi = pi;

    const tagsHtml = p.stageIds.map(id => {
      const st = appState.stages.find(x => x.id === id);
      if (!st) return '';
      return `<span class="pay-tag" style="border-color:${st.color};color:${st.color}" data-sid="${id}" data-pi="${pi}">
        ${esc(st.name)}
        <span class="pay-tag-x" data-sid="${id}" data-pi="${pi}">×</span>
      </span>`;
    }).join('');

    card.innerHTML = `
      <div class="pay-slot-head">
        <input class="pay-slot-name" value="${esc(p.name)}" data-pi="${pi}">
        <button class="pay-slot-del" data-pi="${pi}">×</button>
      </div>
      <div class="pay-slot-tags" data-pi="${pi}">${tagsHtml || '<span class="pay-slot-empty">Перетащите этапы сюда</span>'}</div>
      <div class="pay-slot-total">${fmtInt(amount)} ₽ <span class="pay-slot-pct">${pct}%</span></div>`;

    // Drop target
    card.addEventListener('dragover', e => { e.preventDefault(); card.classList.add('drag-over'); });
    card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
    card.addEventListener('drop', e => {
      e.preventDefault();
      card.classList.remove('drag-over');
      const sid = e.dataTransfer.getData('stageId');
      if (sid && !p.stageIds.includes(sid)) {
        p.stageIds.push(sid);
        _renderPayments();
      }
    });
    leftCol.appendChild(card);
  });

  // Add payment button
  const addBtn = document.createElement('button');
  addBtn.className = 'pay-add-slot-btn';
  addBtn.textContent = '+ Добавить этап оплаты';
  addBtn.addEventListener('click', () => {
    appState.payments.push({ id: 'p' + (++appState.payCounter), name: 'Платёж ' + appState.payments.length, stageIds: [] });
    _renderPayments();
  });
  leftCol.appendChild(addBtn);

  // RIGHT: stage pool
  const rightCol = document.createElement('div');
  rightCol.className = 'pay-right';
  const rightHead = document.createElement('div');
  rightHead.className = 'pay-right-head';
  rightHead.textContent = 'Этапы работ';
  rightCol.appendChild(rightHead);

  if (!appState.stages.length) {
    const empty = document.createElement('div');
    empty.className = 'pay-right-empty';
    empty.textContent = 'Добавьте этапы в Ганtt';
    rightCol.appendChild(empty);
  } else {
    appState.stages.forEach(s => {
      const stageDays  = Math.max(1, Math.round(appState.totalDays * s.w / 100));
      const stageAmt   = _getStageAmount(s.name);

      const pill = document.createElement('div');
      pill.className = 'pay-stage-pill';
      pill.draggable = true;
      pill.dataset.sid = s.id;
      pill.innerHTML = `<span class="pay-stage-pill-dot" style="background:${s.color}"></span>
        <span class="pay-stage-pill-name">${esc(s.name)}</span>
        <span class="pay-stage-pill-info">${stageDays} дн. · ${fmtInt(stageAmt)} ₽</span>`;
      pill.addEventListener('dragstart', e => {
        e.dataTransfer.setData('stageId', s.id);
        pill.classList.add('dragging');
      });
      pill.addEventListener('dragend', () => pill.classList.remove('dragging'));
      rightCol.appendChild(pill);
    });
  }

  layout.appendChild(leftCol);
  layout.appendChild(rightCol);
  wrap.appendChild(layout);

  // Bind events
  wrap.querySelectorAll('.pay-slot-name').forEach(inp => {
    inp.addEventListener('input', e => { appState.payments[+e.target.dataset.pi].name = e.target.value; });
  });
  wrap.querySelectorAll('.pay-slot-del').forEach(btn => {
    btn.addEventListener('click', e => { appState.payments.splice(+e.target.dataset.pi, 1); _renderPayments(); });
  });
  wrap.querySelectorAll('.pay-tag-x').forEach(x => {
    x.addEventListener('click', e => {
      e.stopPropagation();
      const pi  = +e.target.dataset.pi;
      const sid = e.target.dataset.sid;
      appState.payments[pi].stageIds = appState.payments[pi].stageIds.filter(id => id !== sid);
      _renderPayments();
    });
  });
}

// ── DRAWER (Экспликация) ──────────────────────────────────────────

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

// ── SECTION COLLAPSE ──────────────────────────────────────────────

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

// ── DAYS SLIDER ───────────────────────────────────────────────────

function _initDaysSlider() {
  const slider = document.getElementById('totalDaysSlider');
  const output = document.getElementById('totalDaysVal');
  if (!slider || !output) return;

  // Восстанавливаем значение из appState только если оно было явно задано пользователем
  if (appState.totalDaysSet && appState.totalDays > 0) {
    slider.value = appState.totalDays;
    output.textContent = appState.totalDays;
  } else {
    slider.value = '';
    output.textContent = '';
  }

  slider.addEventListener('input', () => {
    const v = +slider.value || 0;
    appState.totalDays    = v;
    appState.totalDaysSet = v > 0;
    output.textContent    = v || '';

    // Если пользователь вручную ввёл значение — это override
    // Применяем масштабирование к этапам если есть авто-значение
    if (v > 0) {
      // Считаем авто-сумму этапов
      let autoTotal = 0;
      let cursor2 = 0;
      (appState.stages || []).forEach((s, i) => {
        const dur = (s.daysOverride != null ? s.daysOverride : s.daysAuto) || 0;
        const start = (s.parallelWithPrev && i > 0) ? (appState.stages[i - 1]._startDay || 0) : cursor2;
        s._startDay = start;
        if (!s.parallelWithPrev) cursor2 = start + dur;
        const end = start + dur;
        if (end > autoTotal) autoTotal = end;
      });

      if (autoTotal > 0 && v !== autoTotal) {
        // Масштабируем все daysOverride (или daysAuto если нет override)
        const k = v / autoTotal;
        (appState.stages || []).forEach(s => {
          const base = s.daysOverride != null ? s.daysOverride : (s.daysAuto || 0);
          if (base > 0) s.daysOverride = Math.max(1, Math.round(base * k));
        });
        appState.totalDaysOverride = v; // помечаем что это ручной override
      } else {
        appState.totalDaysOverride = null;
      }
    } else {
      appState.totalDaysOverride = null;
    }

    _renderGantt();
    _renderPayments();
    _updateHeaderDates();
    _updateTotals();
  });

  // При инициализации пересчитываем финиш (если уже есть дата старта из сохранённого проекта)
  if (typeof window._calcFinish === 'function') window._calcFinish();
}

// ── PDF ───────────────────────────────────────────────────────────

export async function generatePDF() {
  const street = document.getElementById('hdrStreet')?.value || '';
  const house  = document.getElementById('hdrHouse')?.value || '';
  const flat   = document.getElementById('hdrFlat')?.value || '';
  const on = [street, house, flat ? 'кв. ' + flat : ''].filter(Boolean).join(', ') || '—';
  const pageHtmlArr = [];
  document.querySelectorAll('.spp-page:not(.spp-hidden) .spp-a4').forEach(page => {
    const clone = page.cloneNode(true);
    clone.querySelectorAll('.be-toolbar, .be-h-corner, .be-margin-guide').forEach(el => el.remove());
    clone.querySelectorAll('.be-block').forEach(el => { el.classList.remove('be-selected', 'be-editing'); });
    clone.querySelectorAll('.be-hidden').forEach(el => { el.style.display = 'none'; });
    clone.style.transform = 'none';
    clone.style.width  = '1123px';
    clone.style.height = '794px';
    pageHtmlArr.push(`<div class="pdf-a4-page">${clone.outerHTML}</div>`);
  });
  const pdfHtml = pageHtmlArr.join('\n');
  const sheetCss = Array.from(document.styleSheets).map(s => {
    try { return Array.from(s.cssRules).map(r => r.cssText).join('\n'); } catch { return ''; }
  }).join('\n');
  const pdfCss = `
    @import url('https://fonts.googleapis.com/css2?family=Onest:wght@300;400;500;600&display=swap');
    @font-face {
      font-family: 'Merriweather';
      src: url('https://raw.githubusercontent.com/MishkinIN/Font_GOST_2.304/master/gost_2.304.ttf') format('truetype');
    }
    @page { size: 297mm 210mm; margin: 0; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 0; background: #fff; font-family: 'Merriweather', serif; }
    .pdf-a4-page { width: 297mm; height: 210mm; page-break-after: always; overflow: hidden; position: relative; }
    .pdf-a4-page:last-child { page-break-after: auto; }
    .spp-a4 { width: 1123px; height: 794px; transform-origin: top left; transform: scale(0.2646); }
    .spp-a4 * { font-family: 'Merriweather', serif !important; }
    .be-margin-guide { display: none !important; }
    ${sheetCss}`;
  const btns = document.querySelectorAll('.btn-generate');
  btns.forEach(b => { b.textContent = 'Генерация...'; b.disabled = true; });
  try {
    const resp = await fetch('https://assistcloudai.xyz/webhook/generate-pdf', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html: pdfHtml, css: pdfCss }),
    });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const blob = await resp.blob();
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `Смета_${on}.pdf`; a.click();
  } catch (e2) { alert('Ошибка генерации PDF: ' + e2.message); }
  finally { btns.forEach(b => { b.textContent = 'Сформировать PDF →'; b.disabled = false; }); }
}

// ── INIT ──────────────────────────────────────────────────────────

export function initSmeta() {
  _initDrawer();
  _initCollapse();
  _initDaysSlider();
  _initGanttDrag();
  _renderExpl();
  // Если данные уже загружены из проекта — только отрисовываем их,
  // не создаём дефолтные пустые строки
  if (appState.smrRows.length === 0 && appState.smrRowsMasters.length === 0) {
    initSmrManual();
  } else {
    // Проставляем UID строкам, загруженным из localStorage (могут не иметь _uid)
    appState.smrRows.forEach(r => { if (!r._uid) r._uid = _uid(); });
    appState.smrRowsMasters.forEach(r => { if (!r._uid) r._uid = _uid(); });
    _renderSmrTable();
  }
  if (appState.matRows.length === 0) {
    initMatManual();
  } else {
    _renderMatTable();
  }
  _renderGantt();
  _renderPayments();
  _updateTotals();

  // Автоматическая синхронизация экспликации с планировщиком
  EventBus.on('rooms:computed', () => {
    _syncRoomsFromState();
    _renderExpl();
    _updateTotals();
  });

  // Если комнаты уже загружены (например, из localStorage), сразу показать
  if (appState.rooms && appState.rooms.length) {
    _syncRoomsFromState();
    _renderExpl();
  }
}
