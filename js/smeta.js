// ─── SMETA.JS ─────────────────────────────────────────────────────
import { appState } from './state.js';
import { renderToImage, getWallsBboxWorld } from './render.js';

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
    num:   fi('№', 'п/п', 'n/n', 'номер', 'num'),
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

// Stages (production)
let _stages = []; // заполняется из колонки «Этап» в СМР или вручную в Ганtt
const STAGE_COLORS = ['#e07b39','#9b6dda','#5b8dd9','#4aaa6f','#da6d8a','#6da8b8','#a8b85b','#b85b6d'];
let _stageCounter = 0;
function _newStageId() { return 's' + (++_stageCounter); }
function _nextColor() { return STAGE_COLORS[(_stageCounter - 1) % STAGE_COLORS.length]; }

// Smeta rows
let _smrRows = [];
let _matRows = [];

// Rooms (from planner)
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

function _renderExpl() {
  const body = document.getElementById('explBody');
  if (!body) return;
  const meta = document.getElementById('explCountMeta');
  if (!_rooms.length) {
    body.innerHTML = '<div class="expl-empty" style="padding:16px;font-size:12px;color:#bbb;text-align:center">Нет данных — создайте план на вкладке Чертёж</div>';
    if (meta) meta.textContent = '';
    return;
  }
  let tf = 0, tw = 0, tp = 0;
  let html = _rooms.map(r => {
    tf += r.floor; tw += r.walls; tp += r.perim;
    return `<div style="display:grid;grid-template-columns:1fr 56px 56px 56px;padding:5px 16px;font-size:12px;border-bottom:0.5px solid #f4f4f4">
      <span style="color:#333">${esc(r.name)}</span>
      <span style="text-align:right;color:#555">${r.floor.toFixed(1)}</span>
      <span style="text-align:right;color:#555">${r.walls.toFixed(1)}</span>
      <span style="text-align:right;color:#555">${r.perim.toFixed(1)}</span>
    </div>`;
  }).join('');
  html += `<div style="display:grid;grid-template-columns:1fr 56px 56px 56px;padding:5px 16px;font-size:12px;font-weight:600;color:#1a1a2e;border-top:0.5px solid #ddd;background:#fafafa">
    <span>Итого</span>
    <span style="text-align:right">${tf.toFixed(1)}</span>
    <span style="text-align:right">${tw.toFixed(1)}</span>
    <span style="text-align:right">${tp.toFixed(1)}</span>
  </div>`;
  body.innerHTML = html;
  if (meta) meta.textContent = _rooms.length + ' помещений';
  _updateHeader();
}

// ── HEADER BLOCK ──────────────────────────────────────────────────

function _updateHeader() {
  const tf = _rooms.reduce((s, r) => s + r.floor, 0);
  const el = document.getElementById('hdrFloor');
  if (el) el.textContent = tf.toFixed(1) + ' м²';
  _updateTotals();
}

function _updateTotals() {
  const smrT = _smrRows.filter(r => !r.isSection).reduce((s, r) => s + (r.total || 0), 0);
  const matT = _matRows.filter(r => !r.isSection).reduce((s, r) => s + (r.total || 0), 0);
  const el = id => document.getElementById(id);
  if (el('hdrSmr'))   el('hdrSmr').textContent   = fmtInt(smrT) + ' ₽';
  if (el('hdrMat'))   el('hdrMat').textContent   = fmtInt(matT) + ' ₽';
  if (el('hdrTotal')) el('hdrTotal').textContent = fmtInt(smrT + matT) + ' ₽';
  if (el('smrFootTotal')) el('smrFootTotal').textContent = fmt(smrT);
  if (el('matFootTotal')) el('matFootTotal').textContent = fmt(matT);
  if (el('smrCount')) el('smrCount').textContent = _smrRows.filter(r => !r.isSection).length + ' поз. · ' + fmtInt(smrT) + ' ₽';
  if (el('matCount')) el('matCount').textContent = _matRows.filter(r => !r.isSection).length + ' поз. · ' + fmtInt(matT) + ' ₽';
}

// ── ROW DRAG-AND-DROP ─────────────────────────────────────────────
// Generic: works for both SMR and MAT tables
function _initRowDnd(tbody, rows, onReorder) {
  let dragSrc = null;

  function getDragRow(el) {
    return el.closest('tr[draggable]');
  }

  tbody.addEventListener('dragstart', e => {
    const tr = getDragRow(e.target);
    if (!tr) return;
    dragSrc = tr;
    tr.classList.add('row-dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', tr.dataset.rowIdx);
  });

  tbody.addEventListener('dragover', e => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const tr = getDragRow(e.target);
    if (!tr || tr === dragSrc) return;
    tbody.querySelectorAll('tr').forEach(r => r.classList.remove('row-drag-over'));
    tr.classList.add('row-drag-over');
  });

  tbody.addEventListener('dragleave', e => {
    if (!tbody.contains(e.relatedTarget)) {
      tbody.querySelectorAll('tr').forEach(r => r.classList.remove('row-drag-over'));
    }
  });

  tbody.addEventListener('drop', e => {
    e.preventDefault();
    tbody.querySelectorAll('tr').forEach(r => r.classList.remove('row-drag-over', 'row-dragging'));
    const tr = getDragRow(e.target);
    if (!tr || tr === dragSrc) return;
    const fromIdx = +dragSrc.dataset.rowIdx;
    const toIdx   = +tr.dataset.rowIdx;
    if (isNaN(fromIdx) || isNaN(toIdx) || fromIdx === toIdx) return;
    // Reorder array
    const [moved] = rows.splice(fromIdx, 1);
    rows.splice(toIdx, 0, moved);
    onReorder();
  });

  tbody.addEventListener('dragend', () => {
    tbody.querySelectorAll('tr').forEach(r => r.classList.remove('row-drag-over', 'row-dragging'));
    dragSrc = null;
  });
}


// ── INSERT ZONES ──────────────────────────────────────────────────
let _activeInsertPopup = null;

function _closeAllInsertPopups() {
  if (_activeInsertPopup) {
    _activeInsertPopup.classList.remove('open');
    _activeInsertPopup = null;
  }
}

// Close popup on outside click
if (!window._insertPopupListenerAdded) {
  window._insertPopupListenerAdded = true;
  document.addEventListener('click', e => {
    if (!e.target.closest('.tr-insert-circle')) _closeAllInsertPopups();
  });
}

function _doInsert(beforeIdx, isSection, table) {
  const newRow = isSection
    ? { name: '', isSection: true }
    : { name: '', unit: '', qty: '', price: '', total: 0, note: '', isSection: false };

  if (table === 'smr') {
    _smrRows.splice(beforeIdx, 0, newRow);
    _renderSmrTable();
    _updateTotals();
    if (isSection) _syncSectionsToGantt();
    setTimeout(() => {
      const tbody2 = document.getElementById('smrTbody');
      for (const tr of (tbody2?.querySelectorAll('tr') || [])) {
        if (tr.classList.contains('tr-insert-zone')) continue;
        if (+tr.dataset.rowIdx === beforeIdx) { tr.querySelector('input')?.focus(); break; }
      }
    }, 30);
  } else {
    _matRows.splice(beforeIdx, 0, newRow);
    _renderMatTable();
    _updateTotals();
    setTimeout(() => {
      const tbody2 = document.getElementById('matTbody');
      for (const tr of (tbody2?.querySelectorAll('tr') || [])) {
        if (tr.classList.contains('tr-insert-zone')) continue;
        if (+tr.dataset.rowIdx === beforeIdx) { tr.querySelector('input')?.focus(); break; }
      }
    }, 30);
  }
}

function _initInsertZones(tbody, table) {
  // Circle click → toggle popup
  tbody.querySelectorAll('.tr-insert-circle').forEach(circle => {
    circle.addEventListener('click', e => {
      e.stopPropagation();
      const popup = circle.querySelector('.tr-insert-popup');
      if (!popup) return;
      const isOpen = popup.classList.contains('open');
      _closeAllInsertPopups();
      if (!isOpen) {
        popup.classList.add('open');
        _activeInsertPopup = popup;
      }
    });
  });

  // Popup button click → insert
  tbody.querySelectorAll('.tr-insert-pop-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      _closeAllInsertPopups();
      const beforeIdx = +btn.dataset.i;
      const isSection = btn.dataset.section === '1';
      _doInsert(beforeIdx, isSection, table);
    });
  });
}

export function handleSmr(e) {
  const f = e.target.files[0]; if (!f) return;
  parseFile(f, (json, err) => {
    if (err) { alert('Ошибка чтения файла'); return; }
    const rows = smartParse(json);
    _smrRows = rows;
    _renderSmrTable();
    _showSmrTable();
    _updateTotals();
  });
}

export function initSmrManual() {
  _smrRows = [];
  _renderSmrTable();
  _updateTotals();
}

function _showSmrTable() { /* table always visible */ }
function _showSmrDrop()  { /* no drop zone */ }

function _renderSmrTable() {
  const tbody = document.getElementById('smrTbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  let idx = 0;

  function makeInsertZone(i) {
    const insZone = document.createElement('tr');
    insZone.className = 'tr-insert-zone';
    insZone.innerHTML = `<td colspan="9">
      <div class="tr-insert-btn">
        <div class="tr-insert-circle" data-i="${i}" data-table="smr">+
          <div class="tr-insert-popup">
            <button class="tr-insert-pop-btn" data-i="${i}" data-table="smr" data-section="0">Строка</button>
            <button class="tr-insert-pop-btn section" data-i="${i}" data-table="smr" data-section="1">Раздел</button>
          </div>
        </div>
      </div>
    </td>`;
    return insZone;
  }

  // Empty state
  if (!_smrRows.length) {
    const emptyZone = document.createElement('tr');
    emptyZone.className = 'tr-insert-zone';
    emptyZone.innerHTML = `<td colspan="9">
      <div style="position:relative">
        <div class="tbl-empty-hint">Нет позиций — нажмите «+ Строка» или «+ Раздел»</div>
        <div class="tr-insert-btn" style="opacity:1;pointer-events:auto;top:auto;position:static;justify-content:center;padding:4px 0 12px">
          <div class="tr-insert-circle" data-i="0" data-table="smr">+
            <div class="tr-insert-popup">
              <button class="tr-insert-pop-btn" data-i="0" data-table="smr" data-section="0">Строка</button>
              <button class="tr-insert-pop-btn section" data-i="0" data-table="smr" data-section="1">Раздел</button>
            </div>
          </div>
        </div>
      </div>
    </td>`;
    tbody.appendChild(emptyZone);
    _bindSmrEvents(tbody);
    _initInsertZones(tbody, 'smr');
    return;
  }

  _smrRows.forEach((r, i) => {
    tbody.appendChild(makeInsertZone(i));

    const tr = document.createElement('tr');
    tr.draggable = true;
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
  // Final insert zone after last row
  tbody.appendChild(makeInsertZone(_smrRows.length));

  _bindSmrEvents(tbody);
  _initInsertZones(tbody, 'smr');
  _initRowDnd(tbody, _smrRows, () => { _renderSmrTable(); _updateTotals(); });
}

function _bindSmrEvents(tbody) {
  tbody.querySelectorAll('input, select').forEach(inp => {
    inp.addEventListener('input', e => {
      const i = +e.target.dataset.i;
      const f = e.target.dataset.f;
      _smrRows[i][f] = e.target.value;
      if (f === 'qty' || f === 'price') {
        const r = _smrRows[i];
        const q = parseFloat(r.qty) || 0;
        const p = parseFloat(r.price) || 0;
        r.total = q * p;
        const td = e.target.closest('tr').querySelector('.td-total');
        if (td) td.textContent = r.total ? fmtInt(r.total) : '';
        _updateTotals();
      }
      if (f === 'stage') _updateTotals();
    });
    // Sync section name to Gantt only on blur (not on every keystroke)
    inp.addEventListener('blur', e => {
      const i = +e.target.dataset.i;
      if (_smrRows[i] && _smrRows[i].isSection) {
        _smrRows[i].name = e.target.value;
        _syncSectionsToGantt();
      }
    });
  });
  tbody.querySelectorAll('.btn-row-del').forEach(btn => {
    btn.addEventListener('click', e => {
      const i = +e.target.dataset.i;
      _smrRows.splice(i, 1);
      if (!_smrRows.length) _showSmrDrop();
      else _renderSmrTable();
      _updateTotals();
    });
  });
}

export function addSmrRow(isSection = false) {
  if (!_smrRows.length) _showSmrTable();
  _smrRows.push(isSection
    ? { name: '', isSection: true }
    : { name: '', unit: '', qty: '', price: '', total: 0, note: '', isSection: false }
  );
  _renderSmrTable();
  _updateTotals();
  if (isSection) _syncSectionsToGantt();
  // Focus last name input
  setTimeout(() => {
    const inputs = document.querySelectorAll('#smrTbody input.inp-name, #smrTbody input.inp-section');
    inputs[inputs.length - 1]?.focus();
  }, 30);
}

// Insert a row/section at a specific index
export function insertSmrRow(afterIdx, isSection = false) {
  const newRow = isSection
    ? { name: '', isSection: true }
    : { name: '', unit: '', qty: '', price: '', total: 0, note: '', isSection: false };
  _smrRows.splice(afterIdx + 1, 0, newRow);
  _renderSmrTable();
  _updateTotals();
  if (isSection) _syncSectionsToGantt();
  setTimeout(() => {
    // Focus the newly inserted row's input
    const tbody = document.getElementById('smrTbody');
    if (!tbody) return;
    const rows = tbody.querySelectorAll('tr:not(.tr-insert-zone)');
    // find the row at afterIdx+1 position (skipping insert zones)
    let dataIdx = 0;
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
  _smrRows = [];
  _showSmrDrop();
  _updateTotals();
}

// Collect for KP/PDF
export function collectSmrRows() { return _smrRows; }
export function getSmrTotal() {
  return _smrRows.filter(r => !r.isSection).reduce((s, r) => s + (r.total || 0), 0);
}

// ── MATERIALS TABLE ───────────────────────────────────────────────

export function handleMat(e) {
  const f = e.target.files[0]; if (!f) return;
  parseFile(f, (json, err) => {
    if (err) { alert('Ошибка чтения файла'); return; }
    const rows = smartParse(json);
    _matRows = rows;
    _renderMatTable();
    _showMatTable();
    _updateTotals();
  });
}

export function initMatManual() {
  _matRows = [];
  _renderMatTable();
  _updateTotals();
}

function _showMatTable() { /* table always visible */ }
function _showMatDrop()  { /* no drop zone */ }

function _renderMatTable() {
  const tbody = document.getElementById('matTbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  let idx = 0;

  function makeInsertZone(i) {
    const insZone = document.createElement('tr');
    insZone.className = 'tr-insert-zone';
    insZone.innerHTML = `<td colspan="9">
      <div class="tr-insert-btn">
        <div class="tr-insert-circle" data-i="${i}" data-table="mat">+
          <div class="tr-insert-popup">
            <button class="tr-insert-pop-btn" data-i="${i}" data-table="mat" data-section="0">Строка</button>
            <button class="tr-insert-pop-btn section" data-i="${i}" data-table="mat" data-section="1">Раздел</button>
          </div>
        </div>
      </div>
    </td>`;
    return insZone;
  }

  if (!_matRows.length) {
    const emptyZone = document.createElement('tr');
    emptyZone.className = 'tr-insert-zone';
    emptyZone.innerHTML = `<td colspan="9">
      <div style="position:relative">
        <div class="tbl-empty-hint">Нет позиций — нажмите «+ Строка» или «+ Раздел»</div>
        <div class="tr-insert-btn" style="opacity:1;pointer-events:auto;top:auto;position:static;justify-content:center;padding:4px 0 12px">
          <div class="tr-insert-circle" data-i="0" data-table="mat">+
            <div class="tr-insert-popup">
              <button class="tr-insert-pop-btn" data-i="0" data-table="mat" data-section="0">Строка</button>
              <button class="tr-insert-pop-btn section" data-i="0" data-table="mat" data-section="1">Раздел</button>
            </div>
          </div>
        </div>
      </div>
    </td>`;
    tbody.appendChild(emptyZone);
    _bindMatEvents(tbody);
    _initInsertZones(tbody, 'mat');
    return;
  }

  _matRows.forEach((r, i) => {
    tbody.appendChild(makeInsertZone(i));

    const tr = document.createElement('tr');
    tr.draggable = true;
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
  tbody.appendChild(makeInsertZone(_matRows.length));

  _bindMatEvents(tbody);
  _initInsertZones(tbody, 'mat');
  _initRowDnd(tbody, _matRows, () => { _renderMatTable(); _updateTotals(); });
}

function _bindMatEvents(tbody) {
  tbody.querySelectorAll('input, select').forEach(inp => {
    inp.addEventListener('input', e => {
      const i = +e.target.dataset.i;
      const f = e.target.dataset.f;
      _matRows[i][f] = e.target.value;
      if (f === 'qty' || f === 'price') {
        const r = _matRows[i];
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
      _matRows.splice(i, 1);
      if (!_matRows.length) _showMatDrop();
      else _renderMatTable();
      _updateTotals();
    });
  });
}

export function addMatRow(isSection = false) {
  if (!_matRows.length) _showMatTable();
  _matRows.push(isSection
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
  _matRows = [];
  _showMatDrop();
  _updateTotals();
}

export function insertMatRow(afterIdx, isSection = false) {
  const newRow = isSection
    ? { name: '', isSection: true }
    : { name: '', unit: '', qty: '', price: '', total: 0, note: '', isSection: false };
  _matRows.splice(afterIdx + 1, 0, newRow);
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

export function collectMatRows() { return _matRows; }
export function getMatTotal() {
  return _matRows.filter(r => !r.isSection).reduce((s, r) => s + (r.total || 0), 0);
}

// ── SECTION → GANTT SYNC ──────────────────────────────────────────
// Sync SMR sections to Gantt stages (called on section name blur)
function _syncSectionsToGantt() {
  // Collect current section names (non-empty)
  const sections = _smrRows
    .filter(r => r.isSection && r.name && r.name.trim())
    .map(r => r.name.trim());

  // Add stages for new sections not yet in gantt
  sections.forEach(name => {
    const existing = _stages.find(s => s.name === name);
    if (!existing) {
      const id    = _newStageId();
      const color = _nextColor();
      const lastEnd = _stages.reduce((m, s) => Math.max(m, s.pct + s.w), 0);
      _stages.push({ id, name, color, pct: Math.min(lastEnd, 90), w: 10 });
    }
  });

  // Remove stages whose section name no longer exists in SMR
  _stages = _stages.filter(s => sections.includes(s.name));

  _renderGantt();
  _renderPayments();
}

// ── GANTT ─────────────────────────────────────────────────────────

let _totalDays = 60;
let _dragging  = null; // { idx, type:'bar'|'left'|'right', startX, origPct, origW, trackW }

function _renderGantt() {
  const wrap = document.getElementById('ganttBars');
  if (!wrap) return;

  if (!_stages.length) {
    wrap.innerHTML = '<div style="padding:20px 0;text-align:center;font-size:12px;color:#bbb">Этапы появятся когда вы добавите строки в смету и укажете им этапы</div>';
    _renderGanttRuler();
    return;
  }

  wrap.innerHTML = '';
  _stages.forEach((s, idx) => {
    const days = Math.max(1, Math.round(_totalDays * s.w / 100));
    const row  = document.createElement('div');
    row.className = 'gantt-row';

    // Tick marks inside bar
    const ticksHtml = Array.from({length: days + 1}, (_, ti) => {
      const leftPct = (ti / days * 100).toFixed(2);
      return `<div class="gantt-tick-mark" style="left:${leftPct}%"></div>`;
    }).join('');

    row.innerHTML = `
      <div class="gantt-row-label">
        <span class="gantt-stage-dot" style="background:${s.color}"></span>
        <span class="gantt-stage-name" contenteditable="true" data-idx="${idx}">${esc(s.name)}</span>
        <span class="gantt-stage-days">${days} дн.</span>
      </div>
      <div class="gantt-track-wrap">
        <div class="gantt-track">
          <div class="gantt-bar" data-idx="${idx}" style="left:${s.pct}%;width:${s.w}%;background:${s.color}">
            <div class="gantt-handle gantt-handle-l" data-idx="${idx}" data-edge="left"></div>
            <div class="gantt-ticks">${ticksHtml}</div>
            <span class="gantt-bar-label">${days} дн.</span>
            <div class="gantt-handle gantt-handle-r" data-idx="${idx}" data-edge="right"></div>
          </div>
        </div>
      </div>`;
    wrap.appendChild(row);

    // Editable name
    const nameEl = row.querySelector('.gantt-stage-name');
    nameEl.addEventListener('blur', () => {
      _stages[idx].name = nameEl.textContent.trim();
      _renderPayments();
    });

    // Left/right handles
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

    // Drag whole bar (mousedown on bar itself, not handles)
    const bar = row.querySelector('.gantt-bar');
    bar.addEventListener('mousedown', e => {
      if (e.target.classList.contains('gantt-handle')) return;
      e.preventDefault();
      const track  = bar.closest('.gantt-track');
      const trackW = track.getBoundingClientRect().width;
      _dragging = { idx, type: 'bar', startX: e.clientX, origPct: s.pct, origW: s.w, trackW };
      document.body.style.cursor = 'grabbing';
      document.body.style.userSelect = 'none';
    });
  });

  _renderGanttRuler();
}

function _updateGanttBarDOM(idx) {
  const s = _stages[idx];
  const bar = document.querySelector(`.gantt-bar[data-idx="${idx}"]`);
  if (!bar) return;
  bar.style.left  = s.pct + '%';
  bar.style.width = s.w   + '%';
  const days = Math.max(1, Math.round(_totalDays * s.w / 100));
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
  const ticks = Math.min(_totalDays, 12);
  for (let i = 0; i <= ticks; i++) {
    const t = document.createElement('span');
    t.className = 'gantt-tick';
    t.textContent = Math.round(_totalDays * i / ticks);
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
    const s    = _stages[idx];

    if (type === 'bar') {
      s.pct = Math.max(0, Math.min(origPct + dpct, 100 - origW));
    } else if (type === 'left') {
      const newPct = Math.max(0, Math.min(origPct + dpct, origPct + origW - 2));
      s.w   = origW - (newPct - origPct);
      s.pct = newPct;
    } else {
      s.w = Math.max(2, Math.min(origW + dpct, 100 - origPct));
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
  const existing = _stages.find(s => s.name === name);
  if (existing) return existing.id;
  const id    = _newStageId();
  const color = _nextColor();
  // place after last stage, width 10%
  const lastEnd = _stages.reduce((m, s) => Math.max(m, s.pct + s.w), 0);
  _stages.push({ id, name, color, pct: Math.min(lastEnd, 90), w: 10 });
  _renderGantt();
  _renderPayments();
  return id;
}

// ── PAYMENTS ─────────────────────────────────────────────────────

// Payment groups: array of { id, name, stageIds[] }
let _payments = [];
let _payCounter = 0;

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

  _payments.forEach((p, pi) => {
    // Sum stages by their day share
    const shareDays = p.stageIds.reduce((s, id) => {
      const st = _stages.find(x => x.id === id);
      return s + (st ? st.w : 0);
    }, 0);
    const totalW = _stages.reduce((s, x) => s + x.w, 0) || 100;
    const amount = grandTotal > 0 ? Math.round(grandTotal * shareDays / totalW) : 0;
    const pct    = Math.round(shareDays / totalW * 100);

    const card = document.createElement('div');
    card.className = 'pay-slot';
    card.dataset.pi = pi;

    const tagsHtml = p.stageIds.map(id => {
      const st = _stages.find(x => x.id === id);
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
    _payments.push({ id: 'p' + (++_payCounter), name: 'Платёж ' + _payments.length, stageIds: [] });
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

  if (!_stages.length) {
    const empty = document.createElement('div');
    empty.className = 'pay-right-empty';
    empty.textContent = 'Добавьте этапы в Ганtt';
    rightCol.appendChild(empty);
  } else {
    _stages.forEach(s => {
      const stageDays = Math.max(1, Math.round(_totalDays * s.w / 100));
      const totalW    = _stages.reduce((x, y) => x + y.w, 0) || 100;
      const stageAmt  = grandTotal > 0 ? Math.round(grandTotal * s.w / totalW) : 0;

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
    inp.addEventListener('input', e => { _payments[+e.target.dataset.pi].name = e.target.value; });
  });
  wrap.querySelectorAll('.pay-slot-del').forEach(btn => {
    btn.addEventListener('click', e => { _payments.splice(+e.target.dataset.pi, 1); _renderPayments(); });
  });
  wrap.querySelectorAll('.pay-tag-x').forEach(x => {
    x.addEventListener('click', e => {
      e.stopPropagation();
      const pi  = +e.target.dataset.pi;
      const sid = e.target.dataset.sid;
      _payments[pi].stageIds = _payments[pi].stageIds.filter(id => id !== sid);
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
    head.addEventListener('click', () => {
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
  slider.addEventListener('input', () => {
    _totalDays = +slider.value;
    output.textContent = _totalDays;
    _renderGantt();
    _renderPayments();
  });
}

// ── FILE DROP ZONES ───────────────────────────────────────────────

function _initDropZones() {
  [['smrDropZone', 'smrFileInput'], ['matDropZone', 'matFileInput']].forEach(([zoneId, inputId]) => {
    const zone  = document.getElementById(zoneId);
    const input = document.getElementById(inputId);
    if (!zone || !input) return;
    zone.addEventListener('click', () => input.click());
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      const f = e.dataTransfer.files[0];
      if (!f) return;
      const fakeEvent = { target: { files: [f] } };
      if (zoneId === 'smrDropZone') handleSmr(fakeEvent);
      else handleMat(fakeEvent);
    });
  });
}

// ── PDF (preserved, reads from new state) ────────────────────────

export function fmtForKp(v) { return fmt(v); }

export async function generatePDF() {
  const on = document.getElementById('hdrAddress')?.value || '—';
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
  _initCollapse();
  _initDaysSlider();
  _initGanttDrag();
  _renderExpl();
  // Init tables with empty section + row
  initSmrManual();
  initMatManual();
  _renderGantt();
  _renderPayments();
  _updateTotals();
}
