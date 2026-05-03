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
let _stages = []; // синхронизируется с разделами SMR через _syncSectionsToGantt
const STAGE_COLORS = ['#e07b39','#9b6dda','#5b8dd9','#4aaa6f','#da6d8a','#6da8b8','#a8b85b','#b85b6d'];
let _stageCounter = 0;
function _newStageId() { return 's' + (++_stageCounter); }
function _nextColor() { return STAGE_COLORS[(_stageCounter - 1) % STAGE_COLORS.length]; }

// ── STATE ─────────────────────────────────────────────────────────
// Вместо старой одной переменной:
let _clientSmrRows = [];
let _masterSmrRows = [];
let _smrMode = 'client';

let _matRows = [];
let _rooms = [];

// Геттер/сеттер для работы с активной сметой
function _getSmrRows() {
  return _smrMode === 'master' ? _masterSmrRows : _clientSmrRows;
}
function _setSmrRows(arr) {
  if (_smrMode === 'master') _masterSmrRows = arr;
  else _clientSmrRows = arr;
}

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
  const clientSmrT = _clientSmrRows.filter(r => !r.isSection).reduce((s, r) => s + (r.total || 0), 0);
  const masterSmrT = _masterSmrRows.filter(r => !r.isSection).reduce((s, r) => s + (r.total || 0), 0);
  const matT = _matRows.filter(r => !r.isSection).reduce((s, r) => s + (r.total || 0), 0);

  const smrT = clientSmrT; // для клиента всегда показываем клиентскую
  const el = id => document.getElementById(id);
  if (el('hdrSmr'))   el('hdrSmr').textContent   = fmtInt(smrT) + ' ₽';
  if (el('hdrMat'))   el('hdrMat').textContent   = fmtInt(matT) + ' ₽';
  if (el('hdrTotal')) el('hdrTotal').textContent = fmtInt(smrT + matT) + ' ₽';
  if (el('smrFootTotal')) el('smrFootTotal').textContent = fmt(smrT);
  if (el('matFootTotal')) el('matFootTotal').textContent = fmt(matT);
  if (el('smrCount')) el('smrCount').textContent = _clientSmrRows.filter(r => !r.isSection).length + ' поз. · ' + fmtInt(smrT) + ' ₽';
  if (el('matCount')) el('matCount').textContent = _matRows.filter(r => !r.isSection).length + ' поз. · ' + fmtInt(matT) + ' ₽';

  // Мастера
  if (el('hdrMasters')) el('hdrMasters').textContent = masterSmrT ? fmtInt(masterSmrT) + ' ₽' : '— ₽';

  // Маржа
  const marginT = smrT + matT - masterSmrT;
  const totalDays = parseInt(document.getElementById('totalDaysVal')?.textContent) || 0;

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
  const totalDays = parseInt(el('totalDaysVal')?.textContent) || 0;
  if (el('hdrDays')) el('hdrDays').textContent = totalDays ? totalDays + ' дн.' : '—';

  // Try to get start date from first stage, calculate finish
  const startStage = _stages.length ? _stages.reduce((a, b) => (a.start < b.start ? a : b), _stages[0]) : null;
  const endStage   = _stages.length ? _stages.reduce((a, b) => ((a.start + a.dur) > (b.start + b.dur) ? a : b), _stages[0]) : null;

  if (startStage && totalDays > 0) {
    // Use today as project start reference if no explicit date
    const base = new Date();
    const startDay = startStage.start || 0;
    const endDay   = endStage ? (endStage.start + endStage.dur) : totalDays;
    const startDate = new Date(base); startDate.setDate(startDate.getDate() + startDay);
    const finishDate = new Date(base); finishDate.setDate(finishDate.getDate() + endDay);
    if (el('hdrStart'))  el('hdrStart').textContent  = startDate.toLocaleDateString('ru-RU', {day:'numeric',month:'short'});
    if (el('hdrFinish')) el('hdrFinish').textContent = finishDate.toLocaleDateString('ru-RU', {day:'numeric',month:'short'});
  } else {
    if (el('hdrStart'))  el('hdrStart').textContent  = '—';
    if (el('hdrFinish')) el('hdrFinish').textContent = '—';
  }
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
    ? { name: '', isSection: true }
    : { name: '', unit: '', qty: '', price: '', total: 0, note: '', isSection: false };
  const rows = _getSmrRows();
  rows.splice(beforeIdx, 0, newRow);
  _setSmrRows(rows);
  _renderSmrTable();
  _updateTotals();
  if (isSection) _syncSectionsToGantt();
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
        _matRows.splice(beforeIdx, 0, newRow);
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
    _setSmrRows(rows);          // ← пишем в активную смету
    _renderSmrTable();
    _updateTotals();
  });
}

export function initSmrManual() {
  _clientSmrRows = [];   // клиентская
  _masterSmrRows = [];   // мастерская – пока пусто
  _clientSmrRows.push({ name: '', isSection: true });
  _clientSmrRows.push({ name: '', unit: 'м²', qty: '', price: '', total: 0, note: '', isSection: false });
  _renderSmrTable();
  _updateTotals();
}

function _renderSmrTable() {
  const tbody = document.getElementById('smrTbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  let idx = 0;
  _getSmrRows().forEach((r, i) => {
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
  // Insert zone after last row
  const insLast = document.createElement('tr');
  insLast.className = 'tr-insert-zone';
  insLast.innerHTML = `<td colspan="9">
    <div class="tr-insert-btn">
      <div class="tr-insert-plus-wrap" data-i="${_getSmrRows().length}" data-table="smr">
        <button class="tr-insert-plus" title="Вставить">+</button>
        <div class="tr-insert-dropdown">
          <div class="tr-insert-dd-item dd-row" data-i="${_getSmrRows().length}" data-table="smr" data-section="0">
            <span class="dd-dot"></span>Строка
          </div>
          <div class="tr-insert-dd-item dd-sec" data-i="${_getSmrRows().length}" data-table="smr" data-section="1">
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
  _initRowDnd(tbody, _getSmrRows(), () => { _renderSmrTable(); _updateTotals(); });
}

function _bindSmrEvents(tbody) {
  tbody.querySelectorAll('input, select').forEach(inp => {
    inp.addEventListener('input', e => {
      const i = +e.target.dataset.i;
      const f = e.target.dataset.f;
      _getSmrRows()[i][f] = e.target.value;
      if (f === 'qty' || f === 'price') {
        const r = _getSmrRows()[i];
        const q = parseFloat(r.qty) || 0;
        const p = parseFloat(r.price) || 0;
        r.total = q * p;
        const td = e.target.closest('tr').querySelector('.td-total');
        if (td) td.textContent = r.total ? fmtInt(r.total) : '';
        _updateTotals();
      }
      // If editing a section name, sync to gantt
      if (f === 'name' && _getSmrRows()[i].isSection) {
        _syncSectionsToGantt();
      }
    });
  });
  tbody.querySelectorAll('.btn-row-del').forEach(btn => {
    btn.addEventListener('click', e => {
      const i = +e.target.dataset.i;
      const wasSection = _getSmrRows()[i]?.isSection;
      _getSmrRows().splice(i, 1);
      _renderSmrTable();
      _updateTotals();
      if (wasSection) _syncSectionsToGantt();
    });
  });
}

export function addSmrRow(isSection = false) {
  const rows = _getSmrRows();
  rows.push(isSection
    ? { name: '', isSection: true }
    : { name: '', unit: '', qty: '', price: '', total: 0, note: '', isSection: false }
  );
  _setSmrRows(rows);
  _renderSmrTable();
  _updateTotals();
  if (isSection) _syncSectionsToGantt();
  setTimeout(() => {
    const inputs = document.querySelectorAll('#smrTbody input.inp-name, #smrTbody input.inp-section');
    inputs[inputs.length - 1]?.focus();
  }, 30);
}
// Insert a row/section at a specific index
export function insertSmrRow(afterIdx, isSection = false) {
  const rows = _getSmrRows();
  const newRow = isSection
    ? { name: '', isSection: true }
    : { name: '', unit: '', qty: '', price: '', total: 0, note: '', isSection: false };
  rows.splice(afterIdx + 1, 0, newRow);
  _setSmrRows(rows);
  _renderSmrTable();
  _updateTotals();
  if (isSection) _syncSectionsToGantt();
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
  _setSmrRows([]);
  _updateTotals();
  _renderSmrTable();
}

// Collect for KP/PDF
export function collectSmrRows() { return _getSmrRows(); }
export function getSmrTotal() {
  const rows = _getSmrRows();
  return rows.filter(r => !r.isSection).reduce((s, r) => s + (r.total || 0), 0);
}

// ── MATERIALS TABLE ───────────────────────────────────────────────

export function handleMat(e) {
  const f = e.target.files[0]; if (!f) return;
  parseFile(f, (json, err) => {
    if (err) { alert('Ошибка чтения файла'); return; }
    const rows = smartParse(json);
    _matRows = rows;
    _renderMatTable();
    _updateTotals();
  });
}

export function initMatManual() {
  _matRows = [];
  _matRows.push({ name: '', isSection: true });
  _matRows.push({ name: '', unit: 'шт', qty: '', price: '', total: 0, note: '', isSection: false });
  _renderMatTable();
  _updateTotals();
}

function _renderMatTable() {
  const tbody = document.getElementById('matTbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  let idx = 0;
  _matRows.forEach((r, i) => {
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
  // Insert zone after last row
  const insLast = document.createElement('tr');
  insLast.className = 'tr-insert-zone';
  insLast.innerHTML = `<td colspan="9">
    <div class="tr-insert-btn">
      <div class="tr-insert-plus-wrap" data-i="${_matRows.length}" data-table="mat">
        <button class="tr-insert-plus" title="Вставить">+</button>
        <div class="tr-insert-dropdown">
          <div class="tr-insert-dd-item dd-row" data-i="${_matRows.length}" data-table="mat" data-section="0">
            <span class="dd-dot"></span>Строка
          </div>
          <div class="tr-insert-dd-item dd-sec" data-i="${_matRows.length}" data-table="mat" data-section="1">
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
      _renderMatTable();
      _updateTotals();
    });
  });
}

export function addMatRow(isSection = false) {
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
  _renderMatTable();
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
// When sections in SMR change, sync them as Gantt stages
function _syncSectionsToGantt() {
  const sections = _clientSmrRows.filter(r => r.isSection && r.name && r.name.trim());
  const sectionNames = new Set(sections.map(s => s.name.trim()));

  // Remove stages that no longer have a matching section
  _stages = _stages.filter(s => sectionNames.has(s.name));

  // Add new stages for sections not yet in gantt
  sections.forEach(sec => {
    const name = sec.name.trim();
    if (!name) return;
    const existing = _stages.find(s => s.name === name);
    if (!existing) {
      const id    = _newStageId();
      const color = _nextColor();
      const lastEnd = _stages.reduce((m, s) => Math.max(m, s.pct + s.w), 0);
      _stages.push({ id, name, color, pct: Math.min(lastEnd, 90), w: 10 });
    }
  });

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

// ── STAGE REAL AMOUNTS ────────────────────────────────────────────
// Sum SMR rows belonging to a section whose name matches the stage name
function _getStageAmount(stageName) {
  let total = 0;
  let inSection = false;
  for (const r of _clientSmrRows) {
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
  return _stages.reduce((s, st) => s + _getStageAmount(st.name), 0);
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
    // Sum real amounts of assigned stages
    const amount = p.stageIds.reduce((s, id) => {
      const st = _stages.find(x => x.id === id);
      return s + (st ? _getStageAmount(st.name) : 0);
    }, 0);
    const totalReal = _getStagesTotalReal() || grandTotal || 1;
    const pct = totalReal > 0 ? Math.round(amount / totalReal * 100) : 0;

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
      const stageDays  = Math.max(1, Math.round(_totalDays * s.w / 100));
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
    _updateHeaderDates();
    _updateTotals();
  });
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
  initSmrManual();
  initMatManual();
  _renderGantt();
  _renderPayments();
  _updateTotals();
  // Привязываем кнопки переключения режима
  document.querySelectorAll('.smr-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => switchSmrMode(btn.dataset.mode));
  });
}

export function switchSmrMode(mode) {
  if (mode !== 'client' && mode !== 'master') return;
  if (mode === _smrMode) return;
  // При первом переключении на "мастера" копируем смету заказчика, если мастерская пуста
  if (mode === 'master' && _masterSmrRows.length === 0) {
    _masterSmrRows = _clientSmrRows.map(r => ({...r}));  // копия
  }
  _smrMode = mode;
  _renderSmrTable();
  _updateTotals();
  // Визуально переключаем кнопки
  document.querySelectorAll('.smr-mode-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });
}
