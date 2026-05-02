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
let _stages = [
  { id: 's1', name: 'Демонтаж',   color: '#e07b39', pct: 0,  w: 10 },
  { id: 's2', name: 'Черновые',   color: '#9b6dda', pct: 10, w: 25 },
  { id: 's3', name: 'Инженерка',  color: '#5b8dd9', pct: 35, w: 25 },
  { id: 's4', name: 'Чистовые',   color: '#4aaa6f', pct: 60, w: 30 },
  { id: 's5', name: 'Финиш',      color: '#da6d8a', pct: 90, w: 10 },
];

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
  if (!_rooms.length) {
    body.innerHTML = '<div class="expl-empty">Нет данных. Создайте план на вкладке Чертёж.</div>';
    return;
  }
  let tf = 0, tw = 0, tp = 0;
  let html = _rooms.map(r => {
    tf += r.floor; tw += r.walls; tp += r.perim;
    return `<div class="expl-row">
      <span class="expl-name">${esc(r.name)}</span>
      <span class="expl-num">${r.floor.toFixed(1)}</span>
      <span class="expl-num">${r.walls.toFixed(1)}</span>
      <span class="expl-num">${r.perim.toFixed(1)}</span>
    </div>`;
  }).join('');
  html += `<div class="expl-row expl-total">
    <span class="expl-name">Итого</span>
    <span class="expl-num">${tf.toFixed(1)}</span>
    <span class="expl-num">${tw.toFixed(1)}</span>
    <span class="expl-num">${tp.toFixed(1)}</span>
  </div>`;
  body.innerHTML = html;
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

// ── SMR TABLE ─────────────────────────────────────────────────────

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
  _smrRows.push({ name: '', unit: '', qty: '', price: '', total: 0, note: '', isSection: false });
  _renderSmrTable();
  _showSmrTable();
}

function _showSmrTable() {
  const zone = document.getElementById('smrDropZone');
  const wrap = document.getElementById('smrTableWrap');
  if (zone) zone.style.display = 'none';
  if (wrap) wrap.style.display = '';
}

function _showSmrDrop() {
  const zone = document.getElementById('smrDropZone');
  const wrap = document.getElementById('smrTableWrap');
  if (zone) zone.style.display = '';
  if (wrap) wrap.style.display = 'none';
}

function _renderSmrTable() {
  const tbody = document.getElementById('smrTbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  let idx = 0;
  _smrRows.forEach((r, i) => {
    const tr = document.createElement('tr');
    if (r.isSection) {
      tr.className = 'row-section';
      tr.innerHTML = `
        <td colspan="2"></td>
        <td colspan="4"><input class="inp-section" value="${esc(r.name)}" placeholder="Название раздела" data-i="${i}" data-f="name"></td>
        <td colspan="2"><button class="btn-row-del" data-i="${i}" data-table="smr" title="Удалить">×</button></td>`;
    } else {
      idx++;
      const stageOpts = _stages.map(s =>
        `<option value="${s.id}" ${r.stage === s.id ? 'selected' : ''}>${s.name}</option>`
      ).join('');
      tr.innerHTML = `
        <td class="td-drag" title="Перетащить">⠿</td>
        <td class="td-num">${idx}</td>
        <td><input class="inp-name" value="${esc(r.name)}" placeholder="Наименование работы" data-i="${i}" data-f="name"></td>
        <td><input class="inp-unit" value="${esc(r.unit)}" placeholder="м²" data-i="${i}" data-f="unit"></td>
        <td><input class="inp-num" value="${r.qty}" placeholder="0" data-i="${i}" data-f="qty" type="number" min="0"></td>
        <td><input class="inp-num" value="${r.price || ''}" placeholder="0" data-i="${i}" data-f="price" type="number" min="0"></td>
        <td class="td-total">${r.total ? fmtInt(r.total) : ''}</td>
        <td>
          <select class="inp-stage" data-i="${i}" data-f="stage">
            <option value="">—</option>${stageOpts}
          </select>
        </td>
        <td><input class="inp-note" value="${esc(r.note || '')}" placeholder="Примечание" data-i="${i}" data-f="note"></td>
        <td><button class="btn-row-del" data-i="${i}" data-table="smr" title="Удалить">×</button></td>`;
    }
    tbody.appendChild(tr);
  });
  _bindSmrEvents(tbody);
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
    : { name: '', unit: '', qty: '', price: '', total: 0, note: '', stage: '', isSection: false }
  );
  _renderSmrTable();
  _updateTotals();
  // Focus last name input
  setTimeout(() => {
    const inputs = document.querySelectorAll('#smrTbody input.inp-name, #smrTbody input.inp-section');
    inputs[inputs.length - 1]?.focus();
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
  _matRows.push({ name: '', unit: '', qty: '', price: '', total: 0, note: '', isSection: false });
  _renderMatTable();
  _showMatTable();
}

function _showMatTable() {
  const zone = document.getElementById('matDropZone');
  const wrap = document.getElementById('matTableWrap');
  if (zone) zone.style.display = 'none';
  if (wrap) wrap.style.display = '';
}

function _showMatDrop() {
  const zone = document.getElementById('matDropZone');
  const wrap = document.getElementById('matTableWrap');
  if (zone) zone.style.display = '';
  if (wrap) wrap.style.display = 'none';
}

function _renderMatTable() {
  const tbody = document.getElementById('matTbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  let idx = 0;
  _matRows.forEach((r, i) => {
    const tr = document.createElement('tr');
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
  _bindMatEvents(tbody);
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

export function collectMatRows() { return _matRows; }
export function getMatTotal() {
  return _matRows.filter(r => !r.isSection).reduce((s, r) => s + (r.total || 0), 0);
}

// ── GANTT ─────────────────────────────────────────────────────────

let _totalDays = 60;
let _dragging  = null; // { idx, edge:'left'|'right', startX, startPct, startW }

function _renderGantt() {
  const wrap = document.getElementById('ganttBars');
  if (!wrap) return;
  wrap.innerHTML = '';

  _stages.forEach((s, idx) => {
    const row = document.createElement('div');
    row.className = 'gantt-row';

    const labelDays = Math.round(_totalDays * s.w / 100);

    row.innerHTML = `
      <div class="gantt-row-label">
        <span class="gantt-stage-dot" style="background:${s.color}"></span>
        <span class="gantt-stage-name" contenteditable="true" data-idx="${idx}">${esc(s.name)}</span>
        <span class="gantt-stage-days">${labelDays} дн.</span>
      </div>
      <div class="gantt-track-wrap">
        <div class="gantt-track">
          <div class="gantt-bar" data-idx="${idx}" style="left:${s.pct}%;width:${s.w}%;background:${s.color}">
            <div class="gantt-handle gantt-handle-l" data-idx="${idx}" data-edge="left"></div>
            <span class="gantt-bar-label">${labelDays} дн.</span>
            <div class="gantt-handle gantt-handle-r" data-idx="${idx}" data-edge="right"></div>
          </div>
        </div>
      </div>`;
    wrap.appendChild(row);

    // Editable stage name
    const nameEl = row.querySelector('.gantt-stage-name');
    nameEl.addEventListener('blur', () => { _stages[idx].name = nameEl.textContent.trim(); _renderPayments(); });

    // Handle drag
    row.querySelectorAll('.gantt-handle').forEach(h => {
      h.addEventListener('mousedown', e => {
        e.preventDefault();
        e.stopPropagation();
        const track = h.closest('.gantt-track');
        const trackW = track.getBoundingClientRect().width;
        _dragging = { idx, edge: h.dataset.edge, startX: e.clientX, startPct: s.pct, startW: s.w, trackW };
        document.body.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none';
      });
    });
  });

  _renderGanttRuler();
}

function _renderGanttRuler() {
  const ruler = document.getElementById('ganttRuler');
  if (!ruler) return;
  ruler.innerHTML = '';
  const ticks = 6;
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
    const { idx, edge, startX, startPct, startW, trackW } = _dragging;
    if (!trackW) return;
    const dx = e.clientX - startX;
    const dpct = dx / trackW * 100;
    const s = _stages[idx];

    if (edge === 'left') {
      const newPct = Math.max(0, Math.min(startPct + dpct, startPct + startW - 2));
      const newW   = startW - (newPct - startPct);
      if (newW < 2) return;
      s.pct = newPct;
      s.w   = newW;
    } else {
      const newW = Math.max(2, Math.min(startW + dpct, 100 - startPct));
      s.w = newW;
    }

    // Update DOM without full re-render for smooth drag
    const bar = document.querySelector(`.gantt-bar[data-idx="${idx}"]`);
    if (bar) {
      bar.style.left  = s.pct + '%';
      bar.style.width = s.w   + '%';
      const days = Math.round(_totalDays * s.w / 100);
      const lbl = bar.querySelector('.gantt-bar-label');
      if (lbl) lbl.textContent = days + ' дн.';
    }
    const rowLabel = document.querySelectorAll('.gantt-row')[idx];
    if (rowLabel) {
      const daysEl = rowLabel.querySelector('.gantt-stage-days');
      if (daysEl) daysEl.textContent = Math.round(_totalDays * s.w / 100) + ' дн.';
    }
  });

  document.addEventListener('mouseup', () => {
    if (!_dragging) return;
    _dragging = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    _renderPayments();
  });
}

// ── PAYMENTS ─────────────────────────────────────────────────────

// Payment groups: array of { name, stageIds[] }
let _payments = [
  { name: 'Аванс', stageIds: ['s1'] },
  { name: '1-й платёж', stageIds: ['s2', 's3'] },
  { name: 'Финальный расчёт', stageIds: ['s4', 's5'] },
];

function _renderPayments() {
  const wrap = document.getElementById('paymentsWrap');
  if (!wrap) return;
  const smrTotal = getSmrTotal();
  const matTotal = getMatTotal();
  const grandTotal = smrTotal + matTotal;

  // Compute stage → pct of total work (by days share)
  const stagePct = {};
  _stages.forEach(s => { stagePct[s.id] = s.w / 100; });

  wrap.innerHTML = '';
  _payments.forEach((p, pi) => {
    const shareDays = p.stageIds.reduce((s, id) => {
      const st = _stages.find(x => x.id === id);
      return s + (st ? st.w : 0);
    }, 0);
    const sharePct = shareDays; // as % of 100 total days
    const amount = grandTotal > 0 ? Math.round(grandTotal * sharePct / 100) : 0;

    const tags = p.stageIds.map(id => {
      const st = _stages.find(x => x.id === id);
      return st ? `<span class="pay-tag" style="border-color:${st.color};color:${st.color}">${esc(st.name)}</span>` : '';
    }).join('');

    const card = document.createElement('div');
    card.className = 'pay-card';
    card.innerHTML = `
      <div class="pay-card-head">
        <input class="pay-card-name" value="${esc(p.name)}" data-pi="${pi}">
        <button class="pay-card-del" data-pi="${pi}" title="Удалить платёж">×</button>
      </div>
      <div class="pay-tags">${tags}</div>
      <div class="pay-amount">${fmtInt(amount)} ₽</div>
      <div class="pay-pct">${Math.round(sharePct)}% от суммы</div>
      <div class="pay-add-stage">
        <select class="pay-stage-sel" data-pi="${pi}">
          <option value="">+ Добавить этап</option>
          ${_stages.filter(s => !p.stageIds.includes(s.id)).map(s =>
            `<option value="${s.id}">${esc(s.name)}</option>`
          ).join('')}
        </select>
      </div>`;
    wrap.appendChild(card);
  });

  // Add payment button
  const addBtn = document.createElement('button');
  addBtn.className = 'pay-add-btn';
  addBtn.textContent = '+ Платёж';
  addBtn.addEventListener('click', () => {
    _payments.push({ name: 'Новый платёж', stageIds: [] });
    _renderPayments();
  });
  wrap.appendChild(addBtn);

  // Bind events
  wrap.querySelectorAll('.pay-card-name').forEach(inp => {
    inp.addEventListener('input', e => { _payments[+e.target.dataset.pi].name = e.target.value; });
  });
  wrap.querySelectorAll('.pay-card-del').forEach(btn => {
    btn.addEventListener('click', e => {
      _payments.splice(+e.target.dataset.pi, 1);
      _renderPayments();
    });
  });
  wrap.querySelectorAll('.pay-stage-sel').forEach(sel => {
    sel.addEventListener('change', e => {
      const pi = +e.target.dataset.pi;
      const val = e.target.value;
      if (val && !_payments[pi].stageIds.includes(val)) {
        _payments[pi].stageIds.push(val);
        _renderPayments();
      }
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
  _initDrawer();
  _initCollapse();
  _initDaysSlider();
  _initDropZones();
  _initGanttDrag();
  _renderExpl();
  _renderGantt();
  _renderPayments();
  _updateTotals();
}
