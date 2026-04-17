// ─── SMETA.JS ─────────────────────────────────────────────────────
import { appState } from './state.js';
import { renderToImage } from './render.js';

// ── Utils ─────────────────────────────────────────────────────────

export function fmt(v) {
  return (+v || 0).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₽';
}
export function fmtDate(v) {
  if (!v) return '—';
  const d = new Date(v); return isNaN(d) ? v : d.toLocaleDateString('ru-RU');
}
export function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function cName() { return document.getElementById('companyName')?.value.trim() || 'КОМПАНИЯ'; }
function cLetter() { return cName().charAt(0).toUpperCase(); }

// ── Logo ──────────────────────────────────────────────────────────

export function handleLogo(e) {
  const f = e.target.files[0]; if (!f) return;ф// ─── SMETA.JS ─────────────────────────────────────────────────────
import { appState } from './state.js';
import { renderToImage } from './render.js';

// ── Utils ─────────────────────────────────────────────────────────

export function fmt(v) {
  return (+v || 0).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₽';
}
export function fmtDate(v) {
  if (!v) return '—';
  const d = new Date(v); return isNaN(d) ? v : d.toLocaleDateString('ru-RU');
}
export function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function cName() { return document.getElementById('companyName')?.value.trim() || 'КОМПАНИЯ'; }
function cLetter() { return cName().charAt(0).toUpperCase(); }

// ── Logo ──────────────────────────────────────────────────────────

export function handleLogo(e) {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = ev => {
    appState.logoData = ev.target.result;
    document.getElementById('logoPreview').src = appState.logoData;
    document.getElementById('logoPreview').style.display = 'block';
    document.getElementById('logoPlaceholder').style.display = 'none';
    liveUpdate();
  };
  r.readAsDataURL(f);
}

// ── Plan ──────────────────────────────────────────────────────────

export function handlePlan(e) {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = ev => {
    appState.planData = ev.target.result;
    document.getElementById('planPreview').src = appState.planData;
    document.getElementById('planPreview').style.display = 'block';
    document.getElementById('planPlaceholder').style.display = 'none';
    liveUpdate();
  };
  r.readAsDataURL(f);
}

// ── Capture canvas as plan image ─────────────────────────────────
// Берёт текущий canvas чертежа, вычисляет bbox всех стен в экранных
// координатах, кропает и масштабирует на offscreen canvas.
// Результат: PNG dataURL сохраняется как planData.
export function captureCanvas() {
  const walls = window._appState?.walls ?? appState?.walls ?? [];
  if (!walls.length) { alert('Нарисуйте план перед захватом'); return; }

  // planData — чистый чертёж (без сетки и размеров) для страницы "Планирование работ"
  const cleanImg = renderToImage(800, 600, false);
  // planDataFull — полный обмерный план (со всеми размерами) для отдельной страницы
  const fullImg  = renderToImage(2480, 1754, true); // A4 landscape @300dpi

  if (!cleanImg) { alert('Не удалось захватить чертёж'); return; }

  appState.planData     = cleanImg;
  appState.planDataFull = fullImg;
  if (window._appState) {
    window._appState.planData     = cleanImg;
    window._appState.planDataFull = fullImg;
  }

  // Обновляем превью в форме
  const planPreview = document.getElementById('planPreview');
  const planPlaceholder = document.getElementById('planPlaceholder');
  if (planPreview) { planPreview.src = cleanImg; planPreview.style.display = 'block'; }
  if (planPlaceholder) planPlaceholder.style.display = 'none';

  liveUpdate();
  alert('Чертёж захвачен ✓');
}

// ── Rooms (smeta side) ────────────────────────────────────────────

let roomCnt = 0;

export function addRoom(n = '', f = '', w = '', p = '') {
  roomCnt++;
  const id = 'rm' + roomCnt;
  const d = document.createElement('div');
  d.className = 'room-item'; d.id = id;
  d.innerHTML = `
    <div class="room-item-head">
      <input class="room-name-inp" placeholder="Название помещения" value="${esc(n)}" oninput="window._smetaModule.recalcRooms()">
      <button class="btn-del-room" onclick="document.getElementById('${id}').remove();window._smetaModule.recalcRooms()">×</button>
    </div>
    <div class="room-fields">
      <div class="room-field"><label>Пол м²</label><input placeholder="0.00" value="${f}" oninput="window._smetaModule.recalcRooms()"></div>
      <div class="room-field"><label>Стены м²</label><input placeholder="0.00" value="${w}" oninput="window._smetaModule.recalcRooms()"></div>
      <div class="room-field"><label>Периметр м</label><input placeholder="0.00" value="${p}" oninput="window._smetaModule.recalcRooms()"></div>
    </div>`;
  document.getElementById('roomsList')?.appendChild(d);
  recalcRooms();
}

export function recalcRooms() {
  let tf = 0, tw = 0, tp = 0;
  document.querySelectorAll('.room-item').forEach(ri => {
    const ins = ri.querySelectorAll('.room-fields input');
    tf += parseFloat(ins[0]?.value) || 0;
    tw += parseFloat(ins[1]?.value) || 0;
    tp += parseFloat(ins[2]?.value) || 0;
  });
  const has = document.querySelectorAll('.room-item').length > 0;
  const strip = document.getElementById('totalsStrip');
  if (strip) strip.style.display = has ? 'grid' : 'none';
  const tf2 = document.getElementById('totalFloor'), tw2 = document.getElementById('totalWalls'), tp2 = document.getElementById('totalPerim');
  if (tf2) tf2.textContent = tf.toFixed(2);
  if (tw2) tw2.textContent = tw.toFixed(2);
  if (tp2) tp2.textContent = tp.toFixed(2);
  updateSummary(); liveUpdate();
}

export function getRooms() {
  return Array.from(document.querySelectorAll('.room-item')).map(ri => {
    const nm = ri.querySelector('.room-name-inp')?.value || '—';
    const ins = ri.querySelectorAll('.room-fields input');
    return { name: nm, floor: ins[0]?.value || '0', walls: ins[1]?.value || '0', perim: ins[2]?.value || '0' };
  });
}

/** Import computed rooms from 2D planner into smeta rooms list */
export function importRoomsFromPlanner(rooms) {
  document.getElementById('roomsList').innerHTML = '';
  roomCnt = 0;
  rooms.forEach(r => addRoom(r.name, r.floorArea, r.wallsArea, r.perimeter));
  recalcRooms();
}

// ── Excel parse ───────────────────────────────────────────────────

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
  for (let i = 0; i < Math.min(json.length, 10); i++) {
    if (json[i].filter(c => String(c || '').trim()).length >= 4) { hi = i; break; }
  }
  const h = json[hi].map(c => String(c || '').toLowerCase());
  const fi = (...kw) => { for (const k of kw) { const i = h.findIndex(x => x.includes(k)); if (i >= 0) return i; } return -1; };
  const cols = {
    name:  fi('наименование', 'работ', 'материал', 'name', 'смр', 'description'),
    unit:  fi('ед', 'unit', 'единиц'),
    qty:   fi('кол', 'qty', 'объём', 'объем', 'count'),
    price: fi('за ед', 'цена', 'price', 'стоимость за', 'rate'),
    total: fi('всего', 'итого', 'total', 'сумма', 'amount'),
  };
  const rows = [];
  for (let i = hi + 1; i < json.length; i++) {
    const row = json[i];
    const name = String(row[cols.name] || '').trim();
    if (!name || /^итого|^всего/i.test(name)) continue;
    const n = v => parseFloat(String(v || '').replace(/[^0-9.,]/g, '').replace(',', '.')) || 0;
    const qty = cols.qty >= 0 ? n(row[cols.qty]) : 0;
    const price = cols.price >= 0 ? n(row[cols.price]) : 0;
    let total = cols.total >= 0 ? n(row[cols.total]) : 0;
    if (!total && qty && price) total = qty * price;
    rows.push({ name, unit: cols.unit >= 0 ? String(row[cols.unit] || '').trim() : '', qty: qty || '', price: price || '', total: total || 0 });
  }
  return rows;
}

// ── SMR table ─────────────────────────────────────────────────────

export function handleSmr(e) {
  const f = e.target.files[0]; if (!f) return;
  parseFile(f, (json, err) => {
    if (err) return;
    const rows = smartParse(json);
    const st = document.getElementById('smrSt');
    if (st) st.innerHTML = `<span class="smeta-ok">✓ Загружено ${rows.length} позиций</span>`;
    document.getElementById('smrZone')?.classList.add('has-data');
    const wrap = document.getElementById('smrWrap'); if (wrap) wrap.style.display = 'block';
    const mb = document.getElementById('smrManualBtn'); if (mb) mb.style.display = 'none';
    document.getElementById('smrBody').innerHTML = '';
    rows.forEach(r => addSmrRowData(r.name, r.unit, r.qty, r.price, r.total));
    recalcSmr();
  });
}

export function initSmrManual() {
  const mb = document.getElementById('smrManualBtn'); if (mb) mb.style.display = 'none';
  const wrap = document.getElementById('smrWrap'); if (wrap) wrap.style.display = 'block';
  addSmrRow();
}

export function addSmrRow() { addSmrRowData('', '', '', '', 0); recalcSmr(); }

function addSmrRowData(name, unit, qty, price, total) {
  const wrap = document.getElementById('smrBody'); if (!wrap) return;
  const idx = wrap.children.length + 1;
  const d = document.createElement('div'); d.className = 'work-row-item';
  d.innerHTML = `
    <span class="wn">${idx}</span>
    <input value="${esc(name)}" placeholder="Наименование" oninput="window._smetaModule.recalcSmr()">
    <input value="${esc(unit)}" placeholder="м2" style="text-align:center">
    <input value="${qty}" placeholder="0" style="text-align:center">
    <input value="${total || ''}" placeholder="0.00" style="text-align:right" oninput="window._smetaModule.recalcSmr()">
    <button class="btn-del-row" onclick="this.closest('.work-row-item').remove();window._smetaModule.renumRows('smrBody');window._smetaModule.recalcSmr()">×</button>`;
  wrap.appendChild(d);
}

export function recalcSmr() {
  let t = 0;
  document.querySelectorAll('#smrBody .work-row-item').forEach(r => { t += parseFloat(r.querySelectorAll('input')[3]?.value) || 0; });
  const el = document.getElementById('smrTotal'); if (el) el.textContent = fmt(t);
  updateSummary(); liveUpdate();
}

export function getSmrTotal() {
  let t = 0;
  document.querySelectorAll('#smrBody .work-row-item').forEach(r => { t += parseFloat(r.querySelectorAll('input')[3]?.value) || 0; });
  return t;
}

export function collectSmrRows() {
  return Array.from(document.querySelectorAll('#smrBody .work-row-item')).map(r => {
    const ins = r.querySelectorAll('input');
    return { name: ins[0]?.value || '', unit: ins[1]?.value || '', qty: ins[2]?.value || '', total: parseFloat(ins[3]?.value) || 0 };
  });
}

// ── Materials table ───────────────────────────────────────────────

export function handleMat(e) {
  const f = e.target.files[0]; if (!f) return;
  parseFile(f, (json, err) => {
    if (err) return;
    const rows = smartParse(json);
    const st = document.getElementById('matSt');
    if (st) st.innerHTML = `<span class="smeta-ok">✓ Загружено ${rows.length} позиций</span>`;
    document.getElementById('matZone')?.classList.add('has-data');
    const wrap = document.getElementById('matWrap'); if (wrap) wrap.style.display = 'block';
    const mb = document.getElementById('matManualBtn'); if (mb) mb.style.display = 'none';
    document.getElementById('matBody').innerHTML = '';
    rows.forEach(r => addMatRowData(r.name, r.unit, r.qty, r.price, r.total));
    recalcMat();
  });
}

export function initMatManual() {
  const mb = document.getElementById('matManualBtn'); if (mb) mb.style.display = 'none';
  const wrap = document.getElementById('matWrap'); if (wrap) wrap.style.display = 'block';
  addMatRow();
}

export function addMatRow() { addMatRowData('', '', '', '', 0); recalcMat(); }

function addMatRowData(name, unit, qty, price, total) {
  const wrap = document.getElementById('matBody'); if (!wrap) return;
  const idx = wrap.children.length + 1;
  const d = document.createElement('div'); d.className = 'work-row-item';
  d.innerHTML = `
    <span class="wn">${idx}</span>
    <input value="${esc(name)}" placeholder="Материал" oninput="window._smetaModule.recalcMat()">
    <input value="${esc(unit)}" placeholder="шт" style="text-align:center">
    <input value="${qty}" placeholder="0" style="text-align:center">
    <input value="${total || ''}" placeholder="0.00" style="text-align:right" oninput="window._smetaModule.recalcMat()">
    <button class="btn-del-row" onclick="this.closest('.work-row-item').remove();window._smetaModule.renumRows('matBody');window._smetaModule.recalcMat()">×</button>`;
  wrap.appendChild(d);
}

export function recalcMat() {
  let t = 0;
  document.querySelectorAll('#matBody .work-row-item').forEach(r => { t += parseFloat(r.querySelectorAll('input')[3]?.value) || 0; });
  const el = document.getElementById('matTotal'); if (el) el.textContent = fmt(t);
  updateSummary(); liveUpdate();
}

export function getMatTotal() {
  let t = 0;
  document.querySelectorAll('#matBody .work-row-item').forEach(r => { t += parseFloat(r.querySelectorAll('input')[3]?.value) || 0; });
  return t;
}

export function collectMatRows() {
  return Array.from(document.querySelectorAll('#matBody .work-row-item')).map(r => {
    const ins = r.querySelectorAll('input');
    return { name: ins[0]?.value || '', unit: ins[1]?.value || '', qty: ins[2]?.value || '', total: parseFloat(ins[3]?.value) || 0 };
  });
}

export function renumRows(id) {
  document.querySelectorAll(`#${id} .work-row-item .wn`).forEach((s, i) => s.textContent = i + 1);
}

// ── Summary ───────────────────────────────────────────────────────

export function updateSummary() {
  const s = getSmrTotal(), m = getMatTotal();
  const scSmr = document.getElementById('scSmr'), scMat = document.getElementById('scMat');
  const scTotal = document.getElementById('scTotal'), scMatRow = document.getElementById('scMatRow');
  if (scSmr) scSmr.textContent = fmt(s);
  if (scMat) scMat.textContent = fmt(m);
  if (scTotal) scTotal.textContent = fmt(s + m);
  if (scMatRow) scMatRow.style.display = m > 0 ? 'flex' : 'none';
}

// ── Live preview update ───────────────────────────────────────────

export function liveUpdate() {
  const cn = cName(), cl = cLetter();
  const sl = (document.getElementById('companySlogan')?.value || 'КАЧЕСТВО ПОД КЛЮЧ').toUpperCase();
  const on = document.getElementById('objectName')?.value || '—';
  const client = document.getElementById('clientName')?.value || '—';
  const ex = document.getElementById('executorName')?.value || '—';
  const dt = fmtDate(document.getElementById('inspDate')?.value);

  // Cover preview
  const pli = document.getElementById('prevLogoImg'), pc = document.getElementById('prevCircle');
  if (appState.logoData) { if (pli) { pli.src = appState.logoData; pli.style.display = 'block'; } if (pc) pc.style.display = 'none'; }
  else { if (pli) pli.style.display = 'none'; if (pc) { pc.style.display = 'flex'; pc.textContent = cl; } }
  const pcn = document.getElementById('prevCovName'); if (pcn) pcn.textContent = cn.toUpperCase();
  const pcs = document.getElementById('prevCovSlogan'); if (pcs) pcs.textContent = sl;
  const pfc = document.getElementById('prevFootCircle'); if (pfc) pfc.textContent = cl;
  const pfn = document.getElementById('prevFootName'); if (pfn) pfn.textContent = cn.toUpperCase();

  // Plan preview
  const ppi = document.getElementById('prevPlanImg'), pph = document.getElementById('prevPlanPh');
  if (appState.planData) { if (ppi) { ppi.src = appState.planData; ppi.style.display = 'block'; } if (pph) pph.style.display = 'none'; }
  else { if (ppi) ppi.style.display = 'none'; if (pph) pph.style.display = 'block'; }

  const poi = document.getElementById('prevObjInfo');
  if (poi) poi.innerHTML = `<strong>Объект:</strong> ${esc(on)}<br><strong>Дата осмотра:</strong> ${dt}<br><strong>Заказчик:</strong> ${esc(client)}<br><strong>Исполнитель:</strong> ${esc(ex)}`;

  // Rooms preview
  const rooms = getRooms();
  let tf = 0, tw = 0, tp = 0;
  const rb = document.getElementById('prevRoomsBody');
  if (rb) {
    rb.innerHTML = '';
    rooms.forEach(r => {
      tf += parseFloat(r.floor) || 0; tw += parseFloat(r.walls) || 0; tp += parseFloat(r.perim) || 0;
      rb.innerHTML += `<tr><td style="border:1px solid #e0e0e0;padding:5px 7px">${esc(r.name)}</td><td style="border:1px solid #e0e0e0;padding:5px 7px;text-align:center">${r.floor}</td><td style="border:1px solid #e0e0e0;padding:5px 7px;text-align:center">${r.walls}</td><td style="border:1px solid #e0e0e0;padding:5px 7px;text-align:center">${r.perim}</td></tr>`;
    });
  }
  const ptf = document.getElementById('prevTotF'), ptw = document.getElementById('prevTotW'), ptp = document.getElementById('prevTotP');
  if (ptf) ptf.textContent = tf.toFixed(2); if (ptw) ptw.textContent = tw.toFixed(2); if (ptp) ptp.textContent = tp.toFixed(2);
  ['prevPfC', 'prevPfN'].forEach((id, i) => { const el = document.getElementById(id); if (el) el.textContent = i === 0 ? cl : cn.toUpperCase(); });

  // SMR preview
  const smrRows = collectSmrRows().slice(0, 20), smrTot = getSmrTotal();
  const smrPrev = document.getElementById('prevSmr');
  if (smrRows.length > 0 && smrPrev) {
    smrPrev.style.display = 'block';
    const se = document.getElementById('prevSmrEmpty'); if (se) se.style.display = 'none';
    const sb = document.getElementById('prevSmrBody');
    if (sb) sb.innerHTML = smrRows.map((r, i) => `<tr><td style="border:1px solid #e0e0e0;padding:5px 6px;text-align:center;font-size:10px">${i + 1}</td><td style="border:1px solid #e0e0e0;padding:5px 6px;font-size:10px">${esc(r.name)}</td><td style="border:1px solid #e0e0e0;padding:5px 6px;text-align:center;font-size:10px">${esc(r.unit)}</td><td style="border:1px solid #e0e0e0;padding:5px 6px;text-align:center;font-size:10px">${r.qty}</td><td style="border:1px solid #e0e0e0;padding:5px 6px;text-align:right;font-size:10px;font-weight:500">${fmt(r.total)}</td></tr>`).join('') +
      `<tr><td colspan="4" style="border:1px solid #ccc;padding:6px;text-align:right;font-weight:700;background:#f5f5f2;font-size:10px">Итого:</td><td style="border:1px solid #ccc;padding:6px;text-align:right;font-weight:700;background:#f5f5f2;font-size:11px">${fmt(smrTot)}</td></tr>`;
  }

  // Mat preview
  const matRows = collectMatRows().slice(0, 20), matTot = getMatTotal();
  const matPrev = document.getElementById('prevMat');
  if (matRows.length > 0 && matPrev) {
    matPrev.style.display = 'block';
    const mb2 = document.getElementById('prevMatBody');
    if (mb2) mb2.innerHTML = matRows.map((r, i) => `<tr><td style="border:1px solid #e0e0e0;padding:5px 6px;text-align:center;font-size:10px">${i + 1}</td><td style="border:1px solid #e0e0e0;padding:5px 6px;font-size:10px">${esc(r.name)}</td><td style="border:1px solid #e0e0e0;padding:5px 6px;text-align:center;font-size:10px">${esc(r.unit)}</td><td style="border:1px solid #e0e0e0;padding:5px 6px;text-align:center;font-size:10px">${r.qty}</td><td style="border:1px solid #e0e0e0;padding:5px 6px;text-align:right;font-size:10px;font-weight:500">${fmt(r.total)}</td></tr>`).join('') +
      `<tr><td colspan="4" style="border:1px solid #ccc;padding:6px;text-align:right;font-weight:700;background:#f5f5f2;font-size:10px">Итого:</td><td style="border:1px solid #ccc;padding:6px;text-align:right;font-weight:700;background:#f5f5f2;font-size:11px">${fmt(matTot)}</td></tr>`;
  }

  // Final preview
  const smrV = getSmrTotal(), matV = getMatTotal();
  const finPrev = document.getElementById('prevFinal');
  if ((smrV > 0 || matV > 0) && finPrev) {
    finPrev.style.display = 'block';
    let rows = '', num = 0;
    if (smrV > 0) { num++; rows += `<tr><td style="border:1px solid #e0e0e0;padding:7px 10px;text-align:center">${num}</td><td style="border:1px solid #e0e0e0;padding:7px 10px">Строительно-монтажные работы</td><td style="border:1px solid #e0e0e0;padding:7px 10px;text-align:center">м²</td><td style="border:1px solid #e0e0e0;padding:7px 10px;text-align:center">${tf.toFixed(2)}</td><td style="border:1px solid #e0e0e0;padding:7px 10px;text-align:right">${tf > 0 ? fmt(smrV / tf) : '—'}</td><td style="border:1px solid #e0e0e0;padding:7px 10px;text-align:right;font-weight:600">${fmt(smrV)}</td><td style="border:1px solid #e0e0e0;padding:7px 10px"></td></tr>`; }
    if (matV > 0) { num++; rows += `<tr><td style="border:1px solid #e0e0e0;padding:7px 10px;text-align:center">${num}</td><td style="border:1px solid #e0e0e0;padding:7px 10px">Строительные и отделочные материалы</td><td style="border:1px solid #e0e0e0;padding:7px 10px;text-align:center">м²</td><td style="border:1px solid #e0e0e0;padding:7px 10px;text-align:center">${tf.toFixed(2)}</td><td style="border:1px solid #e0e0e0;padding:7px 10px;text-align:right">${tf > 0 ? fmt(matV / tf) : '—'}</td><td style="border:1px solid #e0e0e0;padding:7px 10px;text-align:right;font-weight:600">${fmt(matV)}</td><td style="border:1px solid #e0e0e0;padding:7px 10px"></td></tr>`; }
    const pfb = document.getElementById('prevFinBody'); if (pfb) pfb.innerHTML = rows;
    const pfv = document.getElementById('prevFinVal'); if (pfv) pfv.textContent = fmt(smrV + matV);
  }

  // Страница обмерного плана — показываем если есть полный чертёж
  const fullPlanPage = document.getElementById('fullPlanPage');
  const fullPlanImg  = document.getElementById('fullPlanImg');
  const fullImg = appState.planDataFull || null;
  if (fullPlanPage) {
    if (fullImg) {
      fullPlanPage.style.display = 'block';
      if (fullPlanImg) { fullPlanImg.src = fullImg; fullPlanImg.style.display = 'block'; }
    } else {
      fullPlanPage.style.display = 'none';
    }
  }

  // ── Sync right panel (desktop preview) ──────────────────────────
  _syncRightPanel({ cn, cl, sl, on, client, ex, dt, rooms, tf, tw, tp, smrRows, smrTot, matRows, matTot });
}

function _syncRightPanel({ cn, cl, sl, on, client, ex, dt, rooms, tf, tw, tp, smrRows, smrTot, matRows, matTot }) {
  // Cover
  const pli2 = document.getElementById('prevLogoImg2'), pc2 = document.getElementById('prevCircle2');
  if (appState.logoData) { if (pli2) { pli2.src = appState.logoData; pli2.style.display = 'block'; } if (pc2) pc2.style.display = 'none'; }
  else { if (pli2) pli2.style.display = 'none'; if (pc2) { pc2.style.display = 'flex'; pc2.textContent = cl; } }
  const pcn2 = document.getElementById('prevCovName2'); if (pcn2 && !pcn2.isContentEditable && !pcn2.dataset.userEdited) pcn2.textContent = cn.toUpperCase();
  const pcs2 = document.getElementById('prevCovSlogan2'); if (pcs2 && !pcs2.dataset.userEdited) pcs2.textContent = sl;
  const pfc2 = document.getElementById('prevFootCircle2'); if (pfc2 && !pfc2.dataset.userEdited) pfc2.textContent = cl;
  const pfn2 = document.getElementById('prevFootName2'); if (pfn2 && !pfn2.dataset.userEdited) pfn2.textContent = cn.toUpperCase();
  const pct2 = document.getElementById('prevCovType2'); // не трогаем если пользователь редактировал

  // Plan
  const ppi2 = document.getElementById('prevPlanImg2'), pph2 = document.getElementById('prevPlanPh2');
  if (appState.planData) { if (ppi2) { ppi2.src = appState.planData; ppi2.style.display = 'block'; } if (pph2) pph2.style.display = 'none'; }
  else { if (ppi2) ppi2.style.display = 'none'; if (pph2) pph2.style.display = 'block'; }
  const poi2 = document.getElementById('prevObjInfo2');
  if (poi2) poi2.innerHTML = `<strong>Объект:</strong> ${esc(on)}<br><strong>Дата осмотра:</strong> ${dt}<br><strong>Заказчик:</strong> ${esc(client)}<br><strong>Исполнитель:</strong> ${esc(ex)}`;

  // Rooms table in plan page
  const rb2 = document.getElementById('prevRoomsBody2');
  if (rb2) {
    rb2.innerHTML = '';
    rooms.forEach(r => { rb2.innerHTML += `<tr><td style="border:1px solid #e0e0e0;padding:5px 7px">${esc(r.name)}</td><td style="border:1px solid #e0e0e0;padding:5px 7px;text-align:center">${r.floor}</td><td style="border:1px solid #e0e0e0;padding:5px 7px;text-align:center">${r.walls}</td><td style="border:1px solid #e0e0e0;padding:5px 7px;text-align:center">${r.perim}</td></tr>`; });
  }

  // SMR
  const sb2 = document.getElementById('prevSmrBody2'), se2 = document.getElementById('prevSmrEmpty2');
  if (sb2) {
    if (smrRows.length > 0) {
      if (se2) se2.style.display = 'none';
      sb2.innerHTML = smrRows.slice(0,25).map((r, i) => `<tr><td style="border:1px solid #e0e0e0;padding:5px 6px;text-align:center;font-size:10px">${i+1}</td><td style="border:1px solid #e0e0e0;padding:5px 6px;font-size:10px">${esc(r.name)}</td><td style="border:1px solid #e0e0e0;padding:5px 6px;text-align:center;font-size:10px">${esc(r.unit)}</td><td style="border:1px solid #e0e0e0;padding:5px 6px;text-align:center;font-size:10px">${r.qty}</td><td style="border:1px solid #e0e0e0;padding:5px 6px;text-align:right;font-size:10px;font-weight:500">${fmt(r.total)}</td></tr>`).join('') +
        `<tr><td colspan="4" style="border:1px solid #ccc;padding:6px;text-align:right;font-weight:700;background:#f5f5f2;font-size:10px">Итого:</td><td style="border:1px solid #ccc;padding:6px;text-align:right;font-weight:700;background:#f5f5f2;font-size:11px">${fmt(smrTot)}</td></tr>`;
    } else { if (se2) se2.style.display = 'flex'; sb2.innerHTML = ''; }
  }

  // Mat
  const mb2 = document.getElementById('prevMatBody2'), me2 = document.getElementById('prevMatEmpty2');
  if (mb2) {
    if (matRows.length > 0) {
      if (me2) me2.style.display = 'none';
      mb2.innerHTML = matRows.slice(0,25).map((r, i) => `<tr><td style="border:1px solid #e0e0e0;padding:5px 6px;text-align:center;font-size:10px">${i+1}</td><td style="border:1px solid #e0e0e0;padding:5px 6px;font-size:10px">${esc(r.name)}</td><td style="border:1px solid #e0e0e0;padding:5px 6px;text-align:center;font-size:10px">${esc(r.unit)}</td><td style="border:1px solid #e0e0e0;padding:5px 6px;text-align:center;font-size:10px">${r.qty}</td><td style="border:1px solid #e0e0e0;padding:5px 6px;text-align:right;font-size:10px;font-weight:500">${fmt(r.total)}</td></tr>`).join('') +
        `<tr><td colspan="4" style="border:1px solid #ccc;padding:6px;text-align:right;font-weight:700;background:#f5f5f2;font-size:10px">Итого:</td><td style="border:1px solid #ccc;padding:6px;text-align:right;font-weight:700;background:#f5f5f2;font-size:11px">${fmt(matTot)}</td></tr>`;
    } else { if (me2) me2.style.display = 'flex'; mb2.innerHTML = ''; }
  }

  // Final
  const smrV = getSmrTotal(), matV = getMatTotal();
  const pfb2 = document.getElementById('prevFinBody2'), pfv2 = document.getElementById('prevFinVal2');
  if (pfb2) {
    let rows2 = '', num2 = 0;
    if (smrV > 0) { num2++; rows2 += `<tr><td style="border:1px solid #e0e0e0;padding:7px 10px;text-align:center">${num2}</td><td style="border:1px solid #e0e0e0;padding:7px 10px">Строительно-монтажные работы</td><td style="border:1px solid #e0e0e0;padding:7px 10px;text-align:center">м²</td><td style="border:1px solid #e0e0e0;padding:7px 10px;text-align:center">${tf.toFixed(2)}</td><td style="border:1px solid #e0e0e0;padding:7px 10px;text-align:right">${tf>0?fmt(smrV/tf):'—'}</td><td style="border:1px solid #e0e0e0;padding:7px 10px;text-align:right;font-weight:600">${fmt(smrV)}</td><td style="border:1px solid #e0e0e0;padding:7px 10px"></td></tr>`; }
    if (matV > 0) { num2++; rows2 += `<tr><td style="border:1px solid #e0e0e0;padding:7px 10px;text-align:center">${num2}</td><td style="border:1px solid #e0e0e0;padding:7px 10px">Строительные и отделочные материалы</td><td style="border:1px solid #e0e0e0;padding:7px 10px;text-align:center">м²</td><td style="border:1px solid #e0e0e0;padding:7px 10px;text-align:center">${tf.toFixed(2)}</td><td style="border:1px solid #e0e0e0;padding:7px 10px;text-align:right">${tf>0?fmt(matV/tf):'—'}</td><td style="border:1px solid #e0e0e0;padding:7px 10px;text-align:right;font-weight:600">${fmt(matV)}</td><td style="border:1px solid #e0e0e0;padding:7px 10px"></td></tr>`; }
    pfb2.innerHTML = rows2;
  }
  if (pfv2) pfv2.textContent = fmt(smrV + matV);
}

// ── Preview modal ─────────────────────────────────────────────────

export function openPreview() {
  liveUpdate();
  document.getElementById('modalOverlay')?.classList.add('open');
  document.body.style.overflow = 'hidden';
  setTimeout(initEditor, 100);
}

export function closePreview() {
  document.getElementById('modalOverlay')?.classList.remove('open');
  document.body.style.overflow = '';
}

export function closePreviewOnBg(e) {
  if (e.target === document.getElementById('modalOverlay')) closePreview();
}

// ── PDF generation ────────────────────────────────────────────────

export function buildDocPages(rows, totalVal, titleText) {
  const PER = 26; let html = '';
  for (let s = 0; s < rows.length; s += PER) {
    const chunk = rows.slice(s, s + PER), isLast = s + PER >= rows.length;
    html += `<div class="a4"><div class="pg"><div class="smeta-ttl">${titleText}</div>
      <table class="sm-t"><thead><tr>
        <th style="width:24px">№<br>п/п</th><th>Наименование</th>
        <th style="width:46px">Ед.<br>изм.</th><th style="width:52px">Кол-во</th>
        <th style="width:90px">За ед. ₽</th><th style="width:100px">Всего ₽</th>
      </tr></thead><tbody>${chunk.map((r, i) => `<tr><td>${s + i + 1}</td><td>${esc(r.name)}</td>
        <td style="text-align:center">${esc(r.unit)}</td><td style="text-align:center">${r.qty}</td>
        <td style="text-align:right">—</td><td style="text-align:right;font-weight:500">${fmt(r.total)}</td></tr>`).join('')}
      </tbody>${isLast ? `<tfoot><tr class="tot-r"><td colspan="4" style="border:1px solid #e0e0e0"></td>
        <td style="text-align:right;font-weight:700;background:#f5f5f2;border:1px solid #ccc">Итого:</td>
        <td style="text-align:right;font-weight:700;background:#f5f5f2;border:1px solid #ccc">${fmt(totalVal)}</td></tr></tfoot>` : ''}
      </table><div class="pg-foot"><div class="pfc">${cLetter()}</div><div class="pfn">${esc(cName().toUpperCase())}</div></div>
    </div></div>`;
  }
  return html;
}

export async function generatePDF() {
  const cn = cName(), cl = cLetter();
  const sl = (document.getElementById('companySlogan')?.value || 'КАЧЕСТВО ПОД КЛЮЧ').toUpperCase();
  const on = document.getElementById('objectName')?.value || '—';
  const client = document.getElementById('clientName')?.value || '—';
  const ex = document.getElementById('executorName')?.value || '—';
  const dt = fmtDate(document.getElementById('inspDate')?.value);

  // Update print-doc elements
  const cli = document.getElementById('covLogoImg'), cc = document.getElementById('covCircle');
  if (appState.logoData) { if (cli) { cli.src = appState.logoData; cli.style.display = 'block'; } if (cc) cc.style.display = 'none'; }
  else { if (cli) cli.style.display = 'none'; if (cc) { cc.style.display = 'flex'; cc.textContent = cl; } }
  ['covName', 'covSlogan', 'covFtC', 'covFtN'].forEach((id, i) => {
    const el = document.getElementById(id); if (!el) return;
    el.textContent = i === 0 ? cn.toUpperCase() : i === 1 ? sl : i === 2 ? cl : cn.toUpperCase();
  });

  const pi = document.getElementById('docPlanImg'), ph = document.getElementById('docPlanPh');
  if (appState.planData) { if (pi) { pi.src = appState.planData; pi.style.display = 'block'; } if (ph) ph.style.display = 'none'; }
  else { if (pi) pi.style.display = 'none'; if (ph) ph.style.display = 'block'; }

  const doi = document.getElementById('docObjInfo');
  if (doi) doi.innerHTML = `<strong>Объект:</strong> ${esc(on)}<br><strong>Дата осмотра:</strong> ${dt}<br><strong>Заказчик:</strong> ${esc(client)}<br><strong>Исполнитель:</strong> ${esc(ex)}`;

  const rooms = getRooms(); let tf = 0, tw = 0, tp = 0;
  const docRb = document.getElementById('docRoomsBody');
  if (docRb) {
    docRb.innerHTML = '';
    rooms.forEach(r => {
      tf += parseFloat(r.floor) || 0; tw += parseFloat(r.walls) || 0; tp += parseFloat(r.perim) || 0;
      docRb.innerHTML += `<tr><td>${esc(r.name)}</td><td>${r.floor}</td><td>${r.walls}</td><td>${r.perim}</td></tr>`;
    });
  }
  ['dTotF', 'dTotW', 'dTotP'].forEach((id, i) => { const el = document.getElementById(id); if (el) el.textContent = [tf, tw, tp][i].toFixed(2); });
  ['pfC1', 'pfC2'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = cl; });
  ['pfN1', 'pfN2'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = cn.toUpperCase(); });

  const smrRows = collectSmrRows(), smrTot = getSmrTotal();
  const smrDp = document.getElementById('smrDocPages');
  if (smrDp) smrDp.innerHTML = smrRows.length > 0 ? buildDocPages(smrRows, smrTot, 'Смета строительно-монтажных работ') : '';

  const matRows = collectMatRows(), matTot = getMatTotal();
  const matDp = document.getElementById('matDocPages');
  if (matDp) matDp.innerHTML = matRows.length > 0 ? buildDocPages(matRows, matTot, 'Смета на строительные и отделочные материалы') : '';

  const fb = document.getElementById('finBody'); let num = 0;
  if (fb) {
    fb.innerHTML = '';
    if (smrRows.length > 0) { num++; fb.innerHTML += `<tr><td>${num}</td><td>Строительно-монтажные работы</td><td>м²</td><td>${tf.toFixed(2)}</td><td>${tf > 0 ? fmt(smrTot / tf) : '—'}</td><td>${fmt(smrTot)}</td><td></td></tr>`; }
    if (matRows.length > 0) { num++; fb.innerHTML += `<tr><td>${num}</td><td>Строительные и отделочные материалы</td><td>м²</td><td>${tf.toFixed(2)}</td><td>${tf > 0 ? fmt(matTot / tf) : '—'}</td><td>${fmt(matTot)}</td><td></td></tr>`; }
  }
  const ft = document.getElementById('finTotal'); if (ft) ft.textContent = fmt(smrTot + matTot);
  syncEditorToDoc();

  // Страница "Обмерный план" — полный чертёж со всеми размерами
  const fullPlanPage = document.getElementById('fullPlanPage');
  if (fullPlanPage) {
    const fullImg = appState.planDataFull || appState.planData;
    if (fullImg) {
      fullPlanPage.style.display = 'block';
      const fpi = document.getElementById('fullPlanImg');
      if (fpi) { fpi.src = fullImg; fpi.style.display = 'block'; }
    } else {
      fullPlanPage.style.display = 'none';
    }
  }

  const btns = document.querySelectorAll('.btn-generate');
  btns.forEach(b => { b.textContent = 'Генерация...'; b.disabled = true; });
  try {
    const css = Array.from(document.styleSheets).map(s => { try { return Array.from(s.cssRules).map(r => r.cssText).join('\n'); } catch { return ''; } }).join('\n');
    const resp = await fetch('https://assistcloudai.xyz/webhook/generate-pdf', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        html: Array.from(document.querySelectorAll('.preview-page'))
          .filter(p => p.style.display !== 'none')
          .map(p => { const cl2 = p.cloneNode(true); cl2.querySelectorAll('.ed-controls,.ed-resize').forEach(el => el.remove()); cl2.style.transform = 'none'; cl2.style.margin = '0'; return `<div class="a4">${cl2.innerHTML}</div>`; }).join(''),
        css,
      }),
    });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const blob = await resp.blob();
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `Смета_${on}.pdf`; a.click();
  } catch (e2) { alert('Ошибка генерации PDF: ' + e2.message); }
  finally { btns.forEach(b => { b.textContent = 'Сформировать PDF →'; b.disabled = false; }); }
}

// ── Preview editor ────────────────────────────────────────────────

const SCALE = 0.85;

function initEditor() {
  document.querySelectorAll('.ed-el').forEach(el => makeEditable(el));
}

function makeEditable(el) {
  if (el.dataset.edInit) return;
  el.dataset.edInit = '1'; el.classList.add('ed-ready');
  const wrap = document.createElement('div'); wrap.className = 'ed-controls';
  const btnDel = document.createElement('button'); btnDel.className = 'ed-btn-del'; btnDel.innerHTML = '✕';
  btnDel.onmousedown = e => e.stopPropagation();
  btnDel.onclick = e => { e.stopPropagation(); el.style.visibility = 'hidden'; el.dataset.hidden = '1'; };
  wrap.appendChild(btnDel); el.appendChild(wrap);
  const resizeHandle = document.createElement('div'); resizeHandle.className = 'ed-resize'; el.appendChild(resizeHandle);

  let isDragging = false, startX, startY, origLeft, origTop;
  el.addEventListener('mousedown', e => {
    if (e.target.closest('.ed-controls') || e.target === resizeHandle) return;
    isDragging = true; const page = el.closest('.preview-page'); const pageRect = page.getBoundingClientRect(); const elRect = el.getBoundingClientRect();
    if (!el.dataset.posInit) { el.dataset.posInit = '1'; el.style.transform = 'none'; el.style.left = ((elRect.left - pageRect.left) / SCALE) + 'px'; el.style.top = ((elRect.top - pageRect.top) / SCALE) + 'px'; }
    origLeft = parseFloat(el.style.left) || 0; origTop = parseFloat(el.style.top) || 0; startX = e.clientX; startY = e.clientY; e.preventDefault();
  });
  document.addEventListener('mousemove', e => { if (!isDragging) return; el.style.left = (origLeft + (e.clientX - startX) / SCALE) + 'px'; el.style.top = (origTop + (e.clientY - startY) / SCALE) + 'px'; });
  document.addEventListener('mouseup', () => { isDragging = false; });

  let isResizing = false, rsX, rsY, rsW, rsH, rsScale;
  resizeHandle.addEventListener('mousedown', e => {
    e.stopPropagation(); e.preventDefault(); isResizing = true; rsX = e.clientX; rsY = e.clientY;
    const rect = el.getBoundingClientRect(); rsW = rect.width / SCALE; rsH = rect.height / SCALE; rsScale = parseFloat(el.dataset.scale || '1');
  });
  document.addEventListener('mousemove', e => {
    if (!isResizing) return;
    const dx = (e.clientX - rsX) / SCALE, dy = (e.clientY - rsY) / SCALE;
    const delta = (Math.abs(dx) > Math.abs(dy) ? dx : dy);
    const ns = Math.max(0.3, rsScale + delta / 150); el.dataset.scale = ns; el.style.transform = `scale(${ns})`; el.style.transformOrigin = 'top left';
  });
  document.addEventListener('mouseup', () => { isResizing = false; });
}

export function syncEditorToDoc() {
  [['prevCovLogo', ['covLogoImg', 'covCircle']], ['prevCovName', ['covName']], ['prevCovSlogan', ['covSlogan']], ['prevCovType', ['covDtype']], ['prevCovFoot', ['covFtC', 'covFtN']]].forEach(([prevId, docIds]) => {
    const prevEl = document.getElementById(prevId); if (!prevEl) return;
    const hidden = prevEl.style.display === 'none';
    docIds.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = hidden ? 'none' : ''; });
  });
  const logoEl = document.getElementById('prevCovLogo');
  if (logoEl?.dataset.scale) { const sc = logoEl.dataset.scale; ['covLogoImg', 'covCircle'].forEach(id => { const el = document.getElementById(id); if (el) el.style.transform = `scale(${sc})`; }); }
  const nameEl = document.getElementById('prevCovName');
  if (nameEl?.dataset.scale) { const sc = nameEl.dataset.scale; const el = document.getElementById('covName'); if (el) el.style.transform = `scale(${sc})`; }
}

// ── Init smeta ────────────────────────────────────────────────────

export function initSmeta() {
  addRoom('Спальня', '12.92', '36.92', '14.13');
  addRoom('Кухня - гостиная', '14.69', '42.21', '14.72');
  addRoom('Прихожая', '3.30', '15.82', '5.03');
  addRoom('Сан. узел', '3.57', '19.86', '6.92');
  liveUpdate();
  // Init editor for right panel right away (not only in modal)
  setTimeout(initRightPanelEditor, 200);
}


// ══════════════════════════════════════════════════════════════════
// BLOCK EDITOR — universal drag/resize/edit for .spp-a4 pages
// ══════════════════════════════════════════════════════════════════
//
// ══════════════════════════════════════════════════════════════════
// BLOCK EDITOR v3 — drag-to-move, corner-resize, minimal toolbar
// ══════════════════════════════════════════════════════════════════
// UX:
//   • Click element → select (blue outline, show mini toolbar at bottom)
//   • Hold & drag element body → reposition
//   • Drag corner handle (bottom-right) → resize / scale
//   • Double-click text → inline edit (contenteditable)
//   • Toolbar: rotate ↺  |  hide ✕  (just two small buttons)
//   • Click outside → deselect

const BlockEditor = (() => {

  let _sel = null; // selected element

  // ── CSS ─────────────────────────────────────────────────────────
  const CSS = `
    .be-block {
      box-sizing: border-box;
      border-radius: 2px;
    }
    .be-block:hover {
      outline: 1.5px dashed rgba(74,159,255,0.32);
      outline-offset: 2px;
      cursor: grab;
    }
    .be-block.be-selected {
      outline: 2px solid #4a9eff !important;
      outline-offset: 2px;
      cursor: grab;
    }
    .be-block.be-editing {
      outline: 2px solid #2272e0 !important;
      cursor: text !important;
    }
    .be-block.be-dragging {
      cursor: grabbing !important;
      opacity: .92;
    }
    .be-block.be-hidden {
      opacity: .08;
    }

    /* ── Mini toolbar (bottom of selected block) ── */
    .be-toolbar {
      display: none;
      position: absolute;
      bottom: -30px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 9999;
      background: #1a1a2e;
      border-radius: 20px;
      padding: 4px 8px;
      gap: 4px;
      align-items: center;
      box-shadow: 0 3px 12px rgba(0,0,0,.32);
      user-select: none;
      pointer-events: all;
      white-space: nowrap;
    }
    .be-block.be-selected > .be-toolbar,
    .be-block.be-editing > .be-toolbar { display: flex; }

    .be-tbtn {
      background: rgba(255,255,255,.12);
      border: none;
      border-radius: 12px;
      color: #fff;
      font-size: 12px;
      padding: 3px 9px;
      cursor: pointer;
      font-family: 'Onest', sans-serif;
      line-height: 1.3;
      transition: background .12s;
    }
    .be-tbtn:hover { background: rgba(255,255,255,.28); }
    .be-tbtn-del { background: rgba(180,40,30,.55) !important; }
    .be-tbtn-del:hover { background: rgba(220,60,45,.85) !important; }

    /* ── Corner resize handle ── */
    .be-resize {
      display: none;
      position: absolute;
      bottom: -5px;
      right: -5px;
      width: 12px;
      height: 12px;
      background: #4a9eff;
      border-radius: 3px;
      cursor: se-resize;
      z-index: 9999;
    }
    .be-block.be-selected > .be-resize { display: block; }

    /* ── Margin guide ── */
    .be-margin-guide {
      position: absolute;
      pointer-events: none;
      z-index: 0;
      border: 1px dashed rgba(150,150,150,.28);
      box-sizing: border-box;
    }
  `;

  function injectStyle() {
    if (document.getElementById('be-style-v3')) return;
    const s = document.createElement('style');
    s.id = 'be-style-v3';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  // ── Helpers ──────────────────────────────────────────────────────
  function getScale(el) { return parseFloat(el.dataset.beScale || '1'); }
  function getRot(el)   { return parseFloat(el.dataset.beRot   || '0'); }

  function applyTransform(el) {
    el.style.transform = `rotate(${getRot(el)}deg) scale(${getScale(el)})`;
    el.style.transformOrigin = 'top left';
    // Keep toolbar counter-rotated so it stays horizontal
    const tb = el.querySelector('.be-toolbar');
    if (tb) updateToolbarCounterRot(tb, el);
  }

  function updateToolbarCounterRot(tb, el) {
    const rot = getRot(el);
    // Counter-rotate toolbar to always be horizontal
    // Also reposition: at 0°→bottom-center, 90°→left-center, 180°→top-center, 270°→right-center
    tb.style.transform = '';
    tb.style.bottom = '';
    tb.style.top = '';
    tb.style.left = '';
    tb.style.right = '';
    if (rot === 0) {
      tb.style.bottom = '-34px';
      tb.style.top = 'auto';
      tb.style.left = '50%';
      tb.style.right = 'auto';
      tb.style.transform = 'translateX(-50%) rotate(0deg)';
    } else if (rot === 90) {
      // Element rotated 90° CW — toolbar should appear below the visual bottom
      tb.style.bottom = '-34px';
      tb.style.top = 'auto';
      tb.style.left = '50%';
      tb.style.right = 'auto';
      tb.style.transform = 'translateX(-50%) rotate(-90deg)';
    } else if (rot === 180) {
      tb.style.bottom = '-34px';
      tb.style.top = 'auto';
      tb.style.left = '50%';
      tb.style.right = 'auto';
      tb.style.transform = 'translateX(-50%) rotate(-180deg)';
    } else if (rot === 270) {
      tb.style.bottom = '-34px';
      tb.style.top = 'auto';
      tb.style.left = '50%';
      tb.style.right = 'auto';
      tb.style.transform = 'translateX(-50%) rotate(-270deg)';
    }
  }

  // Snapshot absolute position from current layout (call before first drag)
  function snapAbsolute(el, page) {
    if (el.dataset.bePosInit) return;
    el.dataset.bePosInit = '1';
    const pr = page.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    el.style.position = 'absolute';
    el.style.margin   = '0';
    // strip centering translate
    el.style.transform = (el.style.transform || '').replace(/translate\([^)]*\)/g, '').trim();
    el.style.left = (er.left - pr.left) + 'px';
    el.style.top  = (er.top  - pr.top)  + 'px';
  }

  // ── Selection ────────────────────────────────────────────────────
  function select(el, page) {
    if (_sel && _sel !== el) deselect(_sel);
    _sel = el;
    el.classList.add('be-selected');
    // Show floating handles
    if (el._beToolbar) { el._beToolbar.style.display = 'flex'; }
    if (el._beResize)  { el._beResize.style.display  = 'block'; }
    // Position them
    if (page) requestAnimationFrame(() => positionFloatingHandles(el, page));
  }
  function deselect(el) {
    if (!el) return;
    el.classList.remove('be-selected', 'be-editing', 'be-dragging');
    if (el.contentEditable === 'true') el.contentEditable = 'false';
    // Hide floating handles
    if (el._beToolbar) el._beToolbar.style.display = 'none';
    if (el._beResize)  el._beResize.style.display  = 'none';
    if (_sel === el) _sel = null;
  }

  // ── Drag-to-move ─────────────────────────────────────────────────
  function setupDragMove(el, page, onMoveCb) {
    let moved = false, ox, oy, sx, sy;

    el.addEventListener('mousedown', e => {
      if (e.target.closest('.be-toolbar-float') || e.target.closest('.be-resize-float')) return;
      if (e.button !== 0) return;
      if (el.classList.contains('be-editing')) return;

      e.preventDefault();
      select(el, page);
      snapAbsolute(el, page);

      moved = false;
      sx = e.clientX; sy = e.clientY;
      ox = parseFloat(el.style.left) || 0;
      oy = parseFloat(el.style.top)  || 0;

      const onMove = mv => {
        const dx = mv.clientX - sx, dy = mv.clientY - sy;
        if (!moved && Math.hypot(dx, dy) < 3) return;
        moved = true;
        el.classList.add('be-dragging');
        el.style.left = (ox + dx) + 'px';
        el.style.top  = (oy + dy) + 'px';
        if (onMoveCb) onMoveCb();
      };
      const onUp = () => {
        el.classList.remove('be-dragging');
        if (onMoveCb) onMoveCb();
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup',   onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup',   onUp);
    });
  }

  // ── Corner resize ────────────────────────────────────────────────
  function setupResize(resizeHandle, el, page, onMoveCb) {
    resizeHandle.addEventListener('mousedown', e => {
      e.preventDefault();
      e.stopPropagation();
      snapAbsolute(el, page);

      const startX = e.clientX, startY = e.clientY;
      const startScale = getScale(el);
      const rect = el.getBoundingClientRect();
      const refSize = Math.max(rect.width, rect.height) / startScale;

      const onMove = mv => {
        const dx = mv.clientX - startX;
        const dy = mv.clientY - startY;
        const delta = (Math.abs(dx) > Math.abs(dy) ? dx : dy);
        const newScale = Math.max(0.15, Math.min(5, startScale + delta / refSize));
        el.dataset.beScale = newScale.toFixed(3);
        applyTransform(el);
        if (onMoveCb) onMoveCb();
      };
      const onUp = () => {
        if (onMoveCb) onMoveCb();
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup',   onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup',   onUp);
    });
  }

  // ── Double-click to edit text ────────────────────────────────────
  function setupTextEdit(el) {
    el.addEventListener('dblclick', e => {
      if (e.target.closest('.be-toolbar') || e.target.closest('.be-resize')) return;
      select(el);
      el.contentEditable = 'true';
      el.spellcheck = false;
      el.classList.add('be-editing');
      el.focus();
      // Move cursor to click position
      try {
        const range = document.caretRangeFromPoint(e.clientX, e.clientY);
        if (range) {
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
        }
      } catch(_) {}
    });
    el.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        el.contentEditable = 'false';
        el.classList.remove('be-editing');
        el.blur();
      }
    });
    el.addEventListener('blur', () => {
      el.contentEditable = 'false';
      el.classList.remove('be-editing');
    }, true);
  }

  // ── Floating toolbar — child of PAGE so it never rotates ───────────
  function mkFloatingToolbar(el, page) {
    const t = document.createElement('div');
    t.className = 'be-toolbar be-toolbar-float';
    t.style.display = 'none'; // shown via select()
    t.innerHTML = `
      <button class="be-tbtn be-tbtn-rot" title="Повернуть на 90°">↺</button>
      <button class="be-tbtn be-tbtn-del" title="Скрыть / показать">✕</button>`;

    t.addEventListener('mousedown', e => e.stopPropagation());
    t.addEventListener('click',     e => e.stopPropagation());

    t.querySelector('.be-tbtn-rot').onclick = e => {
      e.stopPropagation();
      el.dataset.beRot = (getRot(el) + 90) % 360;
      applyTransform(el);
      // Reposition after rotation (bounding box changes)
      requestAnimationFrame(() => positionFloatingHandles(el, page));
    };
    t.querySelector('.be-tbtn-del').onclick = e => {
      e.stopPropagation();
      const hidden = el.classList.toggle('be-hidden');
      el.dataset.beHidden = hidden ? '1' : '0';
      e.target.textContent = hidden ? '👁' : '✕';
      e.target.title = hidden ? 'Показать' : 'Скрыть';
    };
    page.appendChild(t);
    return t;
  }

  // Floating resize handle — also child of PAGE
  function mkFloatingResize(el, page) {
    const rh = document.createElement('div');
    rh.className = 'be-resize be-resize-float';
    rh.style.display = 'none';
    rh.style.position = 'absolute';
    rh.style.zIndex = '9999';
    page.appendChild(rh);
    setupResize(rh, el, page, () => positionFloatingHandles(el, page));
    return rh;
  }

  // Position toolbar + resize handle at element's current visual position
  function positionFloatingHandles(el, page) {
    const pageRect = page.getBoundingClientRect();
    const elRect   = el.getBoundingClientRect();
    const tb  = el._beToolbar;
    const rh  = el._beResize;
    if (tb) {
      const cx = elRect.left - pageRect.left + elRect.width / 2;
      const by = elRect.bottom - pageRect.top + 8;
      tb.style.left      = cx + 'px';
      tb.style.top       = by + 'px';
      tb.style.bottom    = 'auto';
      tb.style.transform = 'translateX(-50%)';
    }
    if (rh) {
      rh.style.left = (elRect.right  - pageRect.left - 6) + 'px';
      rh.style.top  = (elRect.bottom - pageRect.top  - 6) + 'px';
    }
  }

  // ── Attach editor to one element ─────────────────────────────────
  function attach(el, page) {
    if (!el || el.dataset.beInit) return;
    el.dataset.beInit = '1';
    el.classList.add('be-block');
    el.style.position = el.style.position || 'relative';

    // Floating handles (children of page, not el — so they never rotate)
    el._beToolbar = mkFloatingToolbar(el, page);
    el._beResize  = mkFloatingResize(el, page);

    // Drag-to-move (repositions handles on every mousemove)
    setupDragMove(el, page, () => positionFloatingHandles(el, page));

    // Text edit
    const hasTable = !!el.querySelector('table');
    const hasImg   = !!el.querySelector('img');
    if (!hasTable && !hasImg) {
      setupTextEdit(el);
    }
  }

  // ── Margin guide (2cm ≈ 38px at 96dpi / A4 794px wide) ──────────
  // Preview panel width ~680px → ratio 680/794 ≈ 0.856 → 2cm ≈ 64px
  function addMarginGuide(page) {
    if (page.querySelector('.be-margin-guide')) return;
    const g = document.createElement('div');
    g.className = 'be-margin-guide';
    // 2cm at 96dpi = 75.6px; preview scales A4 to ~680px (794*0.856)
    // So margin = 75.6 * 0.856 ≈ 65px
    const m = 65;
    g.style.cssText = `top:${m}px;left:${m}px;right:${m}px;bottom:${m}px;`;
    page.appendChild(g);
  }

  // ── Click outside → deselect ─────────────────────────────────────
  function setupDeselect(page) {
    if (page.dataset.beDeselect) return;
    page.dataset.beDeselect = '1';
    page.addEventListener('mousedown', e => {
      if (!e.target.closest('.be-block') && !e.target.closest('.be-toolbar')) {
        if (_sel) deselect(_sel);
      }
    });
  }

  // ── Init one .spp-a4 page ────────────────────────────────────────
  function initPage(page) {
    if (!page || page.dataset.bePageInit) return;
    page.dataset.bePageInit = '1';
    page.style.position = 'relative';

    addMarginGuide(page);
    setupDeselect(page);

    // Direct children (excluding guide/toolbar injected elements)
    Array.from(page.children).forEach(child => {
      const c = child.className || '';
      if (c.includes('be-margin') || c.includes('be-toolbar')) return;
      attach(child, page);
    });

    // Named inner elements that should be individually editable
    [
      '#prevCovLogo2','#prevCovName2','#prevCovSlogan2','#prevCovType2',
      '#prevObjInfo2','#prevPlanBox2','.be-editable-title',
      '.be-plan-docs',
    ].forEach(sel => page.querySelectorAll(sel).forEach(el => attach(el, page)));
  }

  // ── Public ───────────────────────────────────────────────────────
  function init() {
    injectStyle();
    document.querySelectorAll('.spp-a4').forEach(initPage);
  }

  return { init, initPage };

})();

function initRightPanelEditor() {
  BlockEditor.init();
  window.BlockEditor = BlockEditor;
}

export { BlockEditor };
  const r = new FileReader();
  r.onload = ev => {
    appState.logoData = ev.target.result;
    document.getElementById('logoPreview').src = appState.logoData;
    document.getElementById('logoPreview').style.display = 'block';
    document.getElementById('logoPlaceholder').style.display = 'none';
    liveUpdate();
  };
  r.readAsDataURL(f);
}

// ── Plan ──────────────────────────────────────────────────────────

export function handlePlan(e) {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = ev => {
    appState.planData = ev.target.result;
    document.getElementById('planPreview').src = appState.planData;
    document.getElementById('planPreview').style.display = 'block';
    document.getElementById('planPlaceholder').style.display = 'none';
    liveUpdate();
  };
  r.readAsDataURL(f);
}

// ── Capture canvas as plan image ─────────────────────────────────
// Берёт текущий canvas чертежа, вычисляет bbox всех стен в экранных
// координатах, кропает и масштабирует на offscreen canvas.
// Результат: PNG dataURL сохраняется как planData.
export function captureCanvas() {
  const walls = window._appState?.walls ?? appState?.walls ?? [];
  if (!walls.length) { alert('Нарисуйте план перед захватом'); return; }

  // planData — чистый чертёж (без сетки и размеров) для страницы "Планирование работ"
  const cleanImg = renderToImage(800, 600, false);
  // planDataFull — полный обмерный план (со всеми размерами) для отдельной страницы
  const fullImg  = renderToImage(2480, 1754, true); // A4 landscape @300dpi

  if (!cleanImg) { alert('Не удалось захватить чертёж'); return; }

  appState.planData     = cleanImg;
  appState.planDataFull = fullImg;
  if (window._appState) {
    window._appState.planData     = cleanImg;
    window._appState.planDataFull = fullImg;
  }

  // Обновляем превью в форме
  const planPreview = document.getElementById('planPreview');
  const planPlaceholder = document.getElementById('planPlaceholder');
  if (planPreview) { planPreview.src = cleanImg; planPreview.style.display = 'block'; }
  if (planPlaceholder) planPlaceholder.style.display = 'none';

  liveUpdate();
  alert('Чертёж захвачен ✓');
}

// ── Rooms (smeta side) ────────────────────────────────────────────

let roomCnt = 0;

export function addRoom(n = '', f = '', w = '', p = '') {
  roomCnt++;
  const id = 'rm' + roomCnt;
  const d = document.createElement('div');
  d.className = 'room-item'; d.id = id;
  d.innerHTML = `
    <div class="room-item-head">
      <input class="room-name-inp" placeholder="Название помещения" value="${esc(n)}" oninput="window._smetaModule.recalcRooms()">
      <button class="btn-del-room" onclick="document.getElementById('${id}').remove();window._smetaModule.recalcRooms()">×</button>
    </div>
    <div class="room-fields">
      <div class="room-field"><label>Пол м²</label><input placeholder="0.00" value="${f}" oninput="window._smetaModule.recalcRooms()"></div>
      <div class="room-field"><label>Стены м²</label><input placeholder="0.00" value="${w}" oninput="window._smetaModule.recalcRooms()"></div>
      <div class="room-field"><label>Периметр м</label><input placeholder="0.00" value="${p}" oninput="window._smetaModule.recalcRooms()"></div>
    </div>`;
  document.getElementById('roomsList')?.appendChild(d);
  recalcRooms();
}

export function recalcRooms() {
  let tf = 0, tw = 0, tp = 0;
  document.querySelectorAll('.room-item').forEach(ri => {
    const ins = ri.querySelectorAll('.room-fields input');
    tf += parseFloat(ins[0]?.value) || 0;
    tw += parseFloat(ins[1]?.value) || 0;
    tp += parseFloat(ins[2]?.value) || 0;
  });
  const has = document.querySelectorAll('.room-item').length > 0;
  const strip = document.getElementById('totalsStrip');
  if (strip) strip.style.display = has ? 'grid' : 'none';
  const tf2 = document.getElementById('totalFloor'), tw2 = document.getElementById('totalWalls'), tp2 = document.getElementById('totalPerim');
  if (tf2) tf2.textContent = tf.toFixed(2);
  if (tw2) tw2.textContent = tw.toFixed(2);
  if (tp2) tp2.textContent = tp.toFixed(2);
  updateSummary(); liveUpdate();
}

export function getRooms() {
  return Array.from(document.querySelectorAll('.room-item')).map(ri => {
    const nm = ri.querySelector('.room-name-inp')?.value || '—';
    const ins = ri.querySelectorAll('.room-fields input');
    return { name: nm, floor: ins[0]?.value || '0', walls: ins[1]?.value || '0', perim: ins[2]?.value || '0' };
  });
}

/** Import computed rooms from 2D planner into smeta rooms list */
export function importRoomsFromPlanner(rooms) {
  document.getElementById('roomsList').innerHTML = '';
  roomCnt = 0;
  rooms.forEach(r => addRoom(r.name, r.floorArea, r.wallsArea, r.perimeter));
  recalcRooms();
}

// ── Excel parse ───────────────────────────────────────────────────

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
  for (let i = 0; i < Math.min(json.length, 10); i++) {
    if (json[i].filter(c => String(c || '').trim()).length >= 4) { hi = i; break; }
  }
  const h = json[hi].map(c => String(c || '').toLowerCase());
  const fi = (...kw) => { for (const k of kw) { const i = h.findIndex(x => x.includes(k)); if (i >= 0) return i; } return -1; };
  const cols = {
    name:  fi('наименование', 'работ', 'материал', 'name', 'смр', 'description'),
    unit:  fi('ед', 'unit', 'единиц'),
    qty:   fi('кол', 'qty', 'объём', 'объем', 'count'),
    price: fi('за ед', 'цена', 'price', 'стоимость за', 'rate'),
    total: fi('всего', 'итого', 'total', 'сумма', 'amount'),
  };
  const rows = [];
  for (let i = hi + 1; i < json.length; i++) {
    const row = json[i];
    const name = String(row[cols.name] || '').trim();
    if (!name || /^итого|^всего/i.test(name)) continue;
    const n = v => parseFloat(String(v || '').replace(/[^0-9.,]/g, '').replace(',', '.')) || 0;
    const qty = cols.qty >= 0 ? n(row[cols.qty]) : 0;
    const price = cols.price >= 0 ? n(row[cols.price]) : 0;
    let total = cols.total >= 0 ? n(row[cols.total]) : 0;
    if (!total && qty && price) total = qty * price;
    rows.push({ name, unit: cols.unit >= 0 ? String(row[cols.unit] || '').trim() : '', qty: qty || '', price: price || '', total: total || 0 });
  }
  return rows;
}

// ── SMR table ─────────────────────────────────────────────────────

export function handleSmr(e) {
  const f = e.target.files[0]; if (!f) return;
  parseFile(f, (json, err) => {
    if (err) return;
    const rows = smartParse(json);
    const st = document.getElementById('smrSt');
    if (st) st.innerHTML = `<span class="smeta-ok">✓ Загружено ${rows.length} позиций</span>`;
    document.getElementById('smrZone')?.classList.add('has-data');
    const wrap = document.getElementById('smrWrap'); if (wrap) wrap.style.display = 'block';
    const mb = document.getElementById('smrManualBtn'); if (mb) mb.style.display = 'none';
    document.getElementById('smrBody').innerHTML = '';
    rows.forEach(r => addSmrRowData(r.name, r.unit, r.qty, r.price, r.total));
    recalcSmr();
  });
}

export function initSmrManual() {
  const mb = document.getElementById('smrManualBtn'); if (mb) mb.style.display = 'none';
  const wrap = document.getElementById('smrWrap'); if (wrap) wrap.style.display = 'block';
  addSmrRow();
}

export function addSmrRow() { addSmrRowData('', '', '', '', 0); recalcSmr(); }

function addSmrRowData(name, unit, qty, price, total) {
  const wrap = document.getElementById('smrBody'); if (!wrap) return;
  const idx = wrap.children.length + 1;
  const d = document.createElement('div'); d.className = 'work-row-item';
  d.innerHTML = `
    <span class="wn">${idx}</span>
    <input value="${esc(name)}" placeholder="Наименование" oninput="window._smetaModule.recalcSmr()">
    <input value="${esc(unit)}" placeholder="м2" style="text-align:center">
    <input value="${qty}" placeholder="0" style="text-align:center">
    <input value="${total || ''}" placeholder="0.00" style="text-align:right" oninput="window._smetaModule.recalcSmr()">
    <button class="btn-del-row" onclick="this.closest('.work-row-item').remove();window._smetaModule.renumRows('smrBody');window._smetaModule.recalcSmr()">×</button>`;
  wrap.appendChild(d);
}

export function recalcSmr() {
  let t = 0;
  document.querySelectorAll('#smrBody .work-row-item').forEach(r => { t += parseFloat(r.querySelectorAll('input')[3]?.value) || 0; });
  const el = document.getElementById('smrTotal'); if (el) el.textContent = fmt(t);
  updateSummary(); liveUpdate();
}

export function getSmrTotal() {
  let t = 0;
  document.querySelectorAll('#smrBody .work-row-item').forEach(r => { t += parseFloat(r.querySelectorAll('input')[3]?.value) || 0; });
  return t;
}

export function collectSmrRows() {
  return Array.from(document.querySelectorAll('#smrBody .work-row-item')).map(r => {
    const ins = r.querySelectorAll('input');
    return { name: ins[0]?.value || '', unit: ins[1]?.value || '', qty: ins[2]?.value || '', total: parseFloat(ins[3]?.value) || 0 };
  });
}

// ── Materials table ───────────────────────────────────────────────

export function handleMat(e) {
  const f = e.target.files[0]; if (!f) return;
  parseFile(f, (json, err) => {
    if (err) return;
    const rows = smartParse(json);
    const st = document.getElementById('matSt');
    if (st) st.innerHTML = `<span class="smeta-ok">✓ Загружено ${rows.length} позиций</span>`;
    document.getElementById('matZone')?.classList.add('has-data');
    const wrap = document.getElementById('matWrap'); if (wrap) wrap.style.display = 'block';
    const mb = document.getElementById('matManualBtn'); if (mb) mb.style.display = 'none';
    document.getElementById('matBody').innerHTML = '';
    rows.forEach(r => addMatRowData(r.name, r.unit, r.qty, r.price, r.total));
    recalcMat();
  });
}

export function initMatManual() {
  const mb = document.getElementById('matManualBtn'); if (mb) mb.style.display = 'none';
  const wrap = document.getElementById('matWrap'); if (wrap) wrap.style.display = 'block';
  addMatRow();
}

export function addMatRow() { addMatRowData('', '', '', '', 0); recalcMat(); }

function addMatRowData(name, unit, qty, price, total) {
  const wrap = document.getElementById('matBody'); if (!wrap) return;
  const idx = wrap.children.length + 1;
  const d = document.createElement('div'); d.className = 'work-row-item';
  d.innerHTML = `
    <span class="wn">${idx}</span>
    <input value="${esc(name)}" placeholder="Материал" oninput="window._smetaModule.recalcMat()">
    <input value="${esc(unit)}" placeholder="шт" style="text-align:center">
    <input value="${qty}" placeholder="0" style="text-align:center">
    <input value="${total || ''}" placeholder="0.00" style="text-align:right" oninput="window._smetaModule.recalcMat()">
    <button class="btn-del-row" onclick="this.closest('.work-row-item').remove();window._smetaModule.renumRows('matBody');window._smetaModule.recalcMat()">×</button>`;
  wrap.appendChild(d);
}

export function recalcMat() {
  let t = 0;
  document.querySelectorAll('#matBody .work-row-item').forEach(r => { t += parseFloat(r.querySelectorAll('input')[3]?.value) || 0; });
  const el = document.getElementById('matTotal'); if (el) el.textContent = fmt(t);
  updateSummary(); liveUpdate();
}

export function getMatTotal() {
  let t = 0;
  document.querySelectorAll('#matBody .work-row-item').forEach(r => { t += parseFloat(r.querySelectorAll('input')[3]?.value) || 0; });
  return t;
}

export function collectMatRows() {
  return Array.from(document.querySelectorAll('#matBody .work-row-item')).map(r => {
    const ins = r.querySelectorAll('input');
    return { name: ins[0]?.value || '', unit: ins[1]?.value || '', qty: ins[2]?.value || '', total: parseFloat(ins[3]?.value) || 0 };
  });
}

export function renumRows(id) {
  document.querySelectorAll(`#${id} .work-row-item .wn`).forEach((s, i) => s.textContent = i + 1);
}

// ── Summary ───────────────────────────────────────────────────────

export function updateSummary() {
  const s = getSmrTotal(), m = getMatTotal();
  const scSmr = document.getElementById('scSmr'), scMat = document.getElementById('scMat');
  const scTotal = document.getElementById('scTotal'), scMatRow = document.getElementById('scMatRow');
  if (scSmr) scSmr.textContent = fmt(s);
  if (scMat) scMat.textContent = fmt(m);
  if (scTotal) scTotal.textContent = fmt(s + m);
  if (scMatRow) scMatRow.style.display = m > 0 ? 'flex' : 'none';
}

// ── Live preview update ───────────────────────────────────────────

export function liveUpdate() {
  const cn = cName(), cl = cLetter();
  const sl = (document.getElementById('companySlogan')?.value || 'КАЧЕСТВО ПОД КЛЮЧ').toUpperCase();
  const on = document.getElementById('objectName')?.value || '—';
  const client = document.getElementById('clientName')?.value || '—';
  const ex = document.getElementById('executorName')?.value || '—';
  const dt = fmtDate(document.getElementById('inspDate')?.value);

  // Cover preview
  const pli = document.getElementById('prevLogoImg'), pc = document.getElementById('prevCircle');
  if (appState.logoData) { if (pli) { pli.src = appState.logoData; pli.style.display = 'block'; } if (pc) pc.style.display = 'none'; }
  else { if (pli) pli.style.display = 'none'; if (pc) { pc.style.display = 'flex'; pc.textContent = cl; } }
  const pcn = document.getElementById('prevCovName'); if (pcn) pcn.textContent = cn.toUpperCase();
  const pcs = document.getElementById('prevCovSlogan'); if (pcs) pcs.textContent = sl;
  const pfc = document.getElementById('prevFootCircle'); if (pfc) pfc.textContent = cl;
  const pfn = document.getElementById('prevFootName'); if (pfn) pfn.textContent = cn.toUpperCase();

  // Plan preview
  const ppi = document.getElementById('prevPlanImg'), pph = document.getElementById('prevPlanPh');
  if (appState.planData) { if (ppi) { ppi.src = appState.planData; ppi.style.display = 'block'; } if (pph) pph.style.display = 'none'; }
  else { if (ppi) ppi.style.display = 'none'; if (pph) pph.style.display = 'block'; }

  const poi = document.getElementById('prevObjInfo');
  if (poi) poi.innerHTML = `<strong>Объект:</strong> ${esc(on)}<br><strong>Дата осмотра:</strong> ${dt}<br><strong>Заказчик:</strong> ${esc(client)}<br><strong>Исполнитель:</strong> ${esc(ex)}`;

  // Rooms preview
  const rooms = getRooms();
  let tf = 0, tw = 0, tp = 0;
  const rb = document.getElementById('prevRoomsBody');
  if (rb) {
    rb.innerHTML = '';
    rooms.forEach(r => {
      tf += parseFloat(r.floor) || 0; tw += parseFloat(r.walls) || 0; tp += parseFloat(r.perim) || 0;
      rb.innerHTML += `<tr><td style="border:1px solid #e0e0e0;padding:5px 7px">${esc(r.name)}</td><td style="border:1px solid #e0e0e0;padding:5px 7px;text-align:center">${r.floor}</td><td style="border:1px solid #e0e0e0;padding:5px 7px;text-align:center">${r.walls}</td><td style="border:1px solid #e0e0e0;padding:5px 7px;text-align:center">${r.perim}</td></tr>`;
    });
  }
  const ptf = document.getElementById('prevTotF'), ptw = document.getElementById('prevTotW'), ptp = document.getElementById('prevTotP');
  if (ptf) ptf.textContent = tf.toFixed(2); if (ptw) ptw.textContent = tw.toFixed(2); if (ptp) ptp.textContent = tp.toFixed(2);
  ['prevPfC', 'prevPfN'].forEach((id, i) => { const el = document.getElementById(id); if (el) el.textContent = i === 0 ? cl : cn.toUpperCase(); });

  // SMR preview
  const smrRows = collectSmrRows().slice(0, 20), smrTot = getSmrTotal();
  const smrPrev = document.getElementById('prevSmr');
  if (smrRows.length > 0 && smrPrev) {
    smrPrev.style.display = 'block';
    const se = document.getElementById('prevSmrEmpty'); if (se) se.style.display = 'none';
    const sb = document.getElementById('prevSmrBody');
    if (sb) sb.innerHTML = smrRows.map((r, i) => `<tr><td style="border:1px solid #e0e0e0;padding:5px 6px;text-align:center;font-size:10px">${i + 1}</td><td style="border:1px solid #e0e0e0;padding:5px 6px;font-size:10px">${esc(r.name)}</td><td style="border:1px solid #e0e0e0;padding:5px 6px;text-align:center;font-size:10px">${esc(r.unit)}</td><td style="border:1px solid #e0e0e0;padding:5px 6px;text-align:center;font-size:10px">${r.qty}</td><td style="border:1px solid #e0e0e0;padding:5px 6px;text-align:right;font-size:10px;font-weight:500">${fmt(r.total)}</td></tr>`).join('') +
      `<tr><td colspan="4" style="border:1px solid #ccc;padding:6px;text-align:right;font-weight:700;background:#f5f5f2;font-size:10px">Итого:</td><td style="border:1px solid #ccc;padding:6px;text-align:right;font-weight:700;background:#f5f5f2;font-size:11px">${fmt(smrTot)}</td></tr>`;
  }

  // Mat preview
  const matRows = collectMatRows().slice(0, 20), matTot = getMatTotal();
  const matPrev = document.getElementById('prevMat');
  if (matRows.length > 0 && matPrev) {
    matPrev.style.display = 'block';
    const mb2 = document.getElementById('prevMatBody');
    if (mb2) mb2.innerHTML = matRows.map((r, i) => `<tr><td style="border:1px solid #e0e0e0;padding:5px 6px;text-align:center;font-size:10px">${i + 1}</td><td style="border:1px solid #e0e0e0;padding:5px 6px;font-size:10px">${esc(r.name)}</td><td style="border:1px solid #e0e0e0;padding:5px 6px;text-align:center;font-size:10px">${esc(r.unit)}</td><td style="border:1px solid #e0e0e0;padding:5px 6px;text-align:center;font-size:10px">${r.qty}</td><td style="border:1px solid #e0e0e0;padding:5px 6px;text-align:right;font-size:10px;font-weight:500">${fmt(r.total)}</td></tr>`).join('') +
      `<tr><td colspan="4" style="border:1px solid #ccc;padding:6px;text-align:right;font-weight:700;background:#f5f5f2;font-size:10px">Итого:</td><td style="border:1px solid #ccc;padding:6px;text-align:right;font-weight:700;background:#f5f5f2;font-size:11px">${fmt(matTot)}</td></tr>`;
  }

  // Final preview
  const smrV = getSmrTotal(), matV = getMatTotal();
  const finPrev = document.getElementById('prevFinal');
  if ((smrV > 0 || matV > 0) && finPrev) {
    finPrev.style.display = 'block';
    let rows = '', num = 0;
    if (smrV > 0) { num++; rows += `<tr><td style="border:1px solid #e0e0e0;padding:7px 10px;text-align:center">${num}</td><td style="border:1px solid #e0e0e0;padding:7px 10px">Строительно-монтажные работы</td><td style="border:1px solid #e0e0e0;padding:7px 10px;text-align:center">м²</td><td style="border:1px solid #e0e0e0;padding:7px 10px;text-align:center">${tf.toFixed(2)}</td><td style="border:1px solid #e0e0e0;padding:7px 10px;text-align:right">${tf > 0 ? fmt(smrV / tf) : '—'}</td><td style="border:1px solid #e0e0e0;padding:7px 10px;text-align:right;font-weight:600">${fmt(smrV)}</td><td style="border:1px solid #e0e0e0;padding:7px 10px"></td></tr>`; }
    if (matV > 0) { num++; rows += `<tr><td style="border:1px solid #e0e0e0;padding:7px 10px;text-align:center">${num}</td><td style="border:1px solid #e0e0e0;padding:7px 10px">Строительные и отделочные материалы</td><td style="border:1px solid #e0e0e0;padding:7px 10px;text-align:center">м²</td><td style="border:1px solid #e0e0e0;padding:7px 10px;text-align:center">${tf.toFixed(2)}</td><td style="border:1px solid #e0e0e0;padding:7px 10px;text-align:right">${tf > 0 ? fmt(matV / tf) : '—'}</td><td style="border:1px solid #e0e0e0;padding:7px 10px;text-align:right;font-weight:600">${fmt(matV)}</td><td style="border:1px solid #e0e0e0;padding:7px 10px"></td></tr>`; }
    const pfb = document.getElementById('prevFinBody'); if (pfb) pfb.innerHTML = rows;
    const pfv = document.getElementById('prevFinVal'); if (pfv) pfv.textContent = fmt(smrV + matV);
  }

  // Страница обмерного плана — показываем если есть полный чертёж
  const fullPlanPage = document.getElementById('fullPlanPage');
  const fullPlanImg  = document.getElementById('fullPlanImg');
  const fullImg = appState.planDataFull || null;
  if (fullPlanPage) {
    if (fullImg) {
      fullPlanPage.style.display = 'block';
      if (fullPlanImg) { fullPlanImg.src = fullImg; fullPlanImg.style.display = 'block'; }
    } else {
      fullPlanPage.style.display = 'none';
    }
  }

  // ── Sync right panel (desktop preview) ──────────────────────────
  _syncRightPanel({ cn, cl, sl, on, client, ex, dt, rooms, tf, tw, tp, smrRows, smrTot, matRows, matTot });
}

function _syncRightPanel({ cn, cl, sl, on, client, ex, dt, rooms, tf, tw, tp, smrRows, smrTot, matRows, matTot }) {
  // Cover
  const pli2 = document.getElementById('prevLogoImg2'), pc2 = document.getElementById('prevCircle2');
  if (appState.logoData) { if (pli2) { pli2.src = appState.logoData; pli2.style.display = 'block'; } if (pc2) pc2.style.display = 'none'; }
  else { if (pli2) pli2.style.display = 'none'; if (pc2) { pc2.style.display = 'flex'; pc2.textContent = cl; } }
  const pcn2 = document.getElementById('prevCovName2'); if (pcn2 && !pcn2.isContentEditable && !pcn2.dataset.userEdited) pcn2.textContent = cn.toUpperCase();
  const pcs2 = document.getElementById('prevCovSlogan2'); if (pcs2 && !pcs2.dataset.userEdited) pcs2.textContent = sl;
  const pfc2 = document.getElementById('prevFootCircle2'); if (pfc2 && !pfc2.dataset.userEdited) pfc2.textContent = cl;
  const pfn2 = document.getElementById('prevFootName2'); if (pfn2 && !pfn2.dataset.userEdited) pfn2.textContent = cn.toUpperCase();
  const pct2 = document.getElementById('prevCovType2'); // не трогаем если пользователь редактировал

  // Plan
  const ppi2 = document.getElementById('prevPlanImg2'), pph2 = document.getElementById('prevPlanPh2');
  if (appState.planData) { if (ppi2) { ppi2.src = appState.planData; ppi2.style.display = 'block'; } if (pph2) pph2.style.display = 'none'; }
  else { if (ppi2) ppi2.style.display = 'none'; if (pph2) pph2.style.display = 'block'; }
  const poi2 = document.getElementById('prevObjInfo2');
  if (poi2) poi2.innerHTML = `<strong>Объект:</strong> ${esc(on)}<br><strong>Дата осмотра:</strong> ${dt}<br><strong>Заказчик:</strong> ${esc(client)}<br><strong>Исполнитель:</strong> ${esc(ex)}`;

  // Rooms table in plan page
  const rb2 = document.getElementById('prevRoomsBody2');
  if (rb2) {
    rb2.innerHTML = '';
    rooms.forEach(r => { rb2.innerHTML += `<tr><td style="border:1px solid #e0e0e0;padding:5px 7px">${esc(r.name)}</td><td style="border:1px solid #e0e0e0;padding:5px 7px;text-align:center">${r.floor}</td><td style="border:1px solid #e0e0e0;padding:5px 7px;text-align:center">${r.walls}</td><td style="border:1px solid #e0e0e0;padding:5px 7px;text-align:center">${r.perim}</td></tr>`; });
  }

  // SMR
  const sb2 = document.getElementById('prevSmrBody2'), se2 = document.getElementById('prevSmrEmpty2');
  if (sb2) {
    if (smrRows.length > 0) {
      if (se2) se2.style.display = 'none';
      sb2.innerHTML = smrRows.slice(0,25).map((r, i) => `<tr><td style="border:1px solid #e0e0e0;padding:5px 6px;text-align:center;font-size:10px">${i+1}</td><td style="border:1px solid #e0e0e0;padding:5px 6px;font-size:10px">${esc(r.name)}</td><td style="border:1px solid #e0e0e0;padding:5px 6px;text-align:center;font-size:10px">${esc(r.unit)}</td><td style="border:1px solid #e0e0e0;padding:5px 6px;text-align:center;font-size:10px">${r.qty}</td><td style="border:1px solid #e0e0e0;padding:5px 6px;text-align:right;font-size:10px;font-weight:500">${fmt(r.total)}</td></tr>`).join('') +
        `<tr><td colspan="4" style="border:1px solid #ccc;padding:6px;text-align:right;font-weight:700;background:#f5f5f2;font-size:10px">Итого:</td><td style="border:1px solid #ccc;padding:6px;text-align:right;font-weight:700;background:#f5f5f2;font-size:11px">${fmt(smrTot)}</td></tr>`;
    } else { if (se2) se2.style.display = 'flex'; sb2.innerHTML = ''; }
  }

  // Mat
  const mb2 = document.getElementById('prevMatBody2'), me2 = document.getElementById('prevMatEmpty2');
  if (mb2) {
    if (matRows.length > 0) {
      if (me2) me2.style.display = 'none';
      mb2.innerHTML = matRows.slice(0,25).map((r, i) => `<tr><td style="border:1px solid #e0e0e0;padding:5px 6px;text-align:center;font-size:10px">${i+1}</td><td style="border:1px solid #e0e0e0;padding:5px 6px;font-size:10px">${esc(r.name)}</td><td style="border:1px solid #e0e0e0;padding:5px 6px;text-align:center;font-size:10px">${esc(r.unit)}</td><td style="border:1px solid #e0e0e0;padding:5px 6px;text-align:center;font-size:10px">${r.qty}</td><td style="border:1px solid #e0e0e0;padding:5px 6px;text-align:right;font-size:10px;font-weight:500">${fmt(r.total)}</td></tr>`).join('') +
        `<tr><td colspan="4" style="border:1px solid #ccc;padding:6px;text-align:right;font-weight:700;background:#f5f5f2;font-size:10px">Итого:</td><td style="border:1px solid #ccc;padding:6px;text-align:right;font-weight:700;background:#f5f5f2;font-size:11px">${fmt(matTot)}</td></tr>`;
    } else { if (me2) me2.style.display = 'flex'; mb2.innerHTML = ''; }
  }

  // Final
  const smrV = getSmrTotal(), matV = getMatTotal();
  const pfb2 = document.getElementById('prevFinBody2'), pfv2 = document.getElementById('prevFinVal2');
  if (pfb2) {
    let rows2 = '', num2 = 0;
    if (smrV > 0) { num2++; rows2 += `<tr><td style="border:1px solid #e0e0e0;padding:7px 10px;text-align:center">${num2}</td><td style="border:1px solid #e0e0e0;padding:7px 10px">Строительно-монтажные работы</td><td style="border:1px solid #e0e0e0;padding:7px 10px;text-align:center">м²</td><td style="border:1px solid #e0e0e0;padding:7px 10px;text-align:center">${tf.toFixed(2)}</td><td style="border:1px solid #e0e0e0;padding:7px 10px;text-align:right">${tf>0?fmt(smrV/tf):'—'}</td><td style="border:1px solid #e0e0e0;padding:7px 10px;text-align:right;font-weight:600">${fmt(smrV)}</td><td style="border:1px solid #e0e0e0;padding:7px 10px"></td></tr>`; }
    if (matV > 0) { num2++; rows2 += `<tr><td style="border:1px solid #e0e0e0;padding:7px 10px;text-align:center">${num2}</td><td style="border:1px solid #e0e0e0;padding:7px 10px">Строительные и отделочные материалы</td><td style="border:1px solid #e0e0e0;padding:7px 10px;text-align:center">м²</td><td style="border:1px solid #e0e0e0;padding:7px 10px;text-align:center">${tf.toFixed(2)}</td><td style="border:1px solid #e0e0e0;padding:7px 10px;text-align:right">${tf>0?fmt(matV/tf):'—'}</td><td style="border:1px solid #e0e0e0;padding:7px 10px;text-align:right;font-weight:600">${fmt(matV)}</td><td style="border:1px solid #e0e0e0;padding:7px 10px"></td></tr>`; }
    pfb2.innerHTML = rows2;
  }
  if (pfv2) pfv2.textContent = fmt(smrV + matV);
}

// ── Preview modal ─────────────────────────────────────────────────

export function openPreview() {
  liveUpdate();
  document.getElementById('modalOverlay')?.classList.add('open');
  document.body.style.overflow = 'hidden';
  setTimeout(initEditor, 100);
}

export function closePreview() {
  document.getElementById('modalOverlay')?.classList.remove('open');
  document.body.style.overflow = '';
}

export function closePreviewOnBg(e) {
  if (e.target === document.getElementById('modalOverlay')) closePreview();
}

// ── PDF generation ────────────────────────────────────────────────

export function buildDocPages(rows, totalVal, titleText) {
  const PER = 26; let html = '';
  for (let s = 0; s < rows.length; s += PER) {
    const chunk = rows.slice(s, s + PER), isLast = s + PER >= rows.length;
    html += `<div class="a4"><div class="pg"><div class="smeta-ttl">${titleText}</div>
      <table class="sm-t"><thead><tr>
        <th style="width:24px">№<br>п/п</th><th>Наименование</th>
        <th style="width:46px">Ед.<br>изм.</th><th style="width:52px">Кол-во</th>
        <th style="width:90px">За ед. ₽</th><th style="width:100px">Всего ₽</th>
      </tr></thead><tbody>${chunk.map((r, i) => `<tr><td>${s + i + 1}</td><td>${esc(r.name)}</td>
        <td style="text-align:center">${esc(r.unit)}</td><td style="text-align:center">${r.qty}</td>
        <td style="text-align:right">—</td><td style="text-align:right;font-weight:500">${fmt(r.total)}</td></tr>`).join('')}
      </tbody>${isLast ? `<tfoot><tr class="tot-r"><td colspan="4" style="border:1px solid #e0e0e0"></td>
        <td style="text-align:right;font-weight:700;background:#f5f5f2;border:1px solid #ccc">Итого:</td>
        <td style="text-align:right;font-weight:700;background:#f5f5f2;border:1px solid #ccc">${fmt(totalVal)}</td></tr></tfoot>` : ''}
      </table><div class="pg-foot"><div class="pfc">${cLetter()}</div><div class="pfn">${esc(cName().toUpperCase())}</div></div>
    </div></div>`;
  }
  return html;
}

export async function generatePDF() {
  const cn = cName(), cl = cLetter();
  const sl = (document.getElementById('companySlogan')?.value || 'КАЧЕСТВО ПОД КЛЮЧ').toUpperCase();
  const on = document.getElementById('objectName')?.value || '—';
  const client = document.getElementById('clientName')?.value || '—';
  const ex = document.getElementById('executorName')?.value || '—';
  const dt = fmtDate(document.getElementById('inspDate')?.value);

  // Update print-doc elements
  const cli = document.getElementById('covLogoImg'), cc = document.getElementById('covCircle');
  if (appState.logoData) { if (cli) { cli.src = appState.logoData; cli.style.display = 'block'; } if (cc) cc.style.display = 'none'; }
  else { if (cli) cli.style.display = 'none'; if (cc) { cc.style.display = 'flex'; cc.textContent = cl; } }
  ['covName', 'covSlogan', 'covFtC', 'covFtN'].forEach((id, i) => {
    const el = document.getElementById(id); if (!el) return;
    el.textContent = i === 0 ? cn.toUpperCase() : i === 1 ? sl : i === 2 ? cl : cn.toUpperCase();
  });

  const pi = document.getElementById('docPlanImg'), ph = document.getElementById('docPlanPh');
  if (appState.planData) { if (pi) { pi.src = appState.planData; pi.style.display = 'block'; } if (ph) ph.style.display = 'none'; }
  else { if (pi) pi.style.display = 'none'; if (ph) ph.style.display = 'block'; }

  const doi = document.getElementById('docObjInfo');
  if (doi) doi.innerHTML = `<strong>Объект:</strong> ${esc(on)}<br><strong>Дата осмотра:</strong> ${dt}<br><strong>Заказчик:</strong> ${esc(client)}<br><strong>Исполнитель:</strong> ${esc(ex)}`;

  const rooms = getRooms(); let tf = 0, tw = 0, tp = 0;
  const docRb = document.getElementById('docRoomsBody');
  if (docRb) {
    docRb.innerHTML = '';
    rooms.forEach(r => {
      tf += parseFloat(r.floor) || 0; tw += parseFloat(r.walls) || 0; tp += parseFloat(r.perim) || 0;
      docRb.innerHTML += `<tr><td>${esc(r.name)}</td><td>${r.floor}</td><td>${r.walls}</td><td>${r.perim}</td></tr>`;
    });
  }
  ['dTotF', 'dTotW', 'dTotP'].forEach((id, i) => { const el = document.getElementById(id); if (el) el.textContent = [tf, tw, tp][i].toFixed(2); });
  ['pfC1', 'pfC2'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = cl; });
  ['pfN1', 'pfN2'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = cn.toUpperCase(); });

  const smrRows = collectSmrRows(), smrTot = getSmrTotal();
  const smrDp = document.getElementById('smrDocPages');
  if (smrDp) smrDp.innerHTML = smrRows.length > 0 ? buildDocPages(smrRows, smrTot, 'Смета строительно-монтажных работ') : '';

  const matRows = collectMatRows(), matTot = getMatTotal();
  const matDp = document.getElementById('matDocPages');
  if (matDp) matDp.innerHTML = matRows.length > 0 ? buildDocPages(matRows, matTot, 'Смета на строительные и отделочные материалы') : '';

  const fb = document.getElementById('finBody'); let num = 0;
  if (fb) {
    fb.innerHTML = '';
    if (smrRows.length > 0) { num++; fb.innerHTML += `<tr><td>${num}</td><td>Строительно-монтажные работы</td><td>м²</td><td>${tf.toFixed(2)}</td><td>${tf > 0 ? fmt(smrTot / tf) : '—'}</td><td>${fmt(smrTot)}</td><td></td></tr>`; }
    if (matRows.length > 0) { num++; fb.innerHTML += `<tr><td>${num}</td><td>Строительные и отделочные материалы</td><td>м²</td><td>${tf.toFixed(2)}</td><td>${tf > 0 ? fmt(matTot / tf) : '—'}</td><td>${fmt(matTot)}</td><td></td></tr>`; }
  }
  const ft = document.getElementById('finTotal'); if (ft) ft.textContent = fmt(smrTot + matTot);
  syncEditorToDoc();

  // Страница "Обмерный план" — полный чертёж со всеми размерами
  const fullPlanPage = document.getElementById('fullPlanPage');
  if (fullPlanPage) {
    const fullImg = appState.planDataFull || appState.planData;
    if (fullImg) {
      fullPlanPage.style.display = 'block';
      const fpi = document.getElementById('fullPlanImg');
      if (fpi) { fpi.src = fullImg; fpi.style.display = 'block'; }
    } else {
      fullPlanPage.style.display = 'none';
    }
  }

  const btns = document.querySelectorAll('.btn-generate');
  btns.forEach(b => { b.textContent = 'Генерация...'; b.disabled = true; });
  try {
    const css = Array.from(document.styleSheets).map(s => { try { return Array.from(s.cssRules).map(r => r.cssText).join('\n'); } catch { return ''; } }).join('\n');
    const resp = await fetch('https://assistcloudai.xyz/webhook/generate-pdf', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        html: Array.from(document.querySelectorAll('.preview-page'))
          .filter(p => p.style.display !== 'none')
          .map(p => { const cl2 = p.cloneNode(true); cl2.querySelectorAll('.ed-controls,.ed-resize').forEach(el => el.remove()); cl2.style.transform = 'none'; cl2.style.margin = '0'; return `<div class="a4">${cl2.innerHTML}</div>`; }).join(''),
        css,
      }),
    });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const blob = await resp.blob();
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `Смета_${on}.pdf`; a.click();
  } catch (e2) { alert('Ошибка генерации PDF: ' + e2.message); }
  finally { btns.forEach(b => { b.textContent = 'Сформировать PDF →'; b.disabled = false; }); }
}

// ── Preview editor ────────────────────────────────────────────────

const SCALE = 0.85;

function initEditor() {
  document.querySelectorAll('.ed-el').forEach(el => makeEditable(el));
}

function makeEditable(el) {
  if (el.dataset.edInit) return;
  el.dataset.edInit = '1'; el.classList.add('ed-ready');
  const wrap = document.createElement('div'); wrap.className = 'ed-controls';
  const btnDel = document.createElement('button'); btnDel.className = 'ed-btn-del'; btnDel.innerHTML = '✕';
  btnDel.onmousedown = e => e.stopPropagation();
  btnDel.onclick = e => { e.stopPropagation(); el.style.visibility = 'hidden'; el.dataset.hidden = '1'; };
  wrap.appendChild(btnDel); el.appendChild(wrap);
  const resizeHandle = document.createElement('div'); resizeHandle.className = 'ed-resize'; el.appendChild(resizeHandle);

  let isDragging = false, startX, startY, origLeft, origTop;
  el.addEventListener('mousedown', e => {
    if (e.target.closest('.ed-controls') || e.target === resizeHandle) return;
    isDragging = true; const page = el.closest('.preview-page'); const pageRect = page.getBoundingClientRect(); const elRect = el.getBoundingClientRect();
    if (!el.dataset.posInit) { el.dataset.posInit = '1'; el.style.transform = 'none'; el.style.left = ((elRect.left - pageRect.left) / SCALE) + 'px'; el.style.top = ((elRect.top - pageRect.top) / SCALE) + 'px'; }
    origLeft = parseFloat(el.style.left) || 0; origTop = parseFloat(el.style.top) || 0; startX = e.clientX; startY = e.clientY; e.preventDefault();
  });
  document.addEventListener('mousemove', e => { if (!isDragging) return; el.style.left = (origLeft + (e.clientX - startX) / SCALE) + 'px'; el.style.top = (origTop + (e.clientY - startY) / SCALE) + 'px'; });
  document.addEventListener('mouseup', () => { isDragging = false; });

  let isResizing = false, rsX, rsY, rsW, rsH, rsScale;
  resizeHandle.addEventListener('mousedown', e => {
    e.stopPropagation(); e.preventDefault(); isResizing = true; rsX = e.clientX; rsY = e.clientY;
    const rect = el.getBoundingClientRect(); rsW = rect.width / SCALE; rsH = rect.height / SCALE; rsScale = parseFloat(el.dataset.scale || '1');
  });
  document.addEventListener('mousemove', e => {
    if (!isResizing) return;
    const dx = (e.clientX - rsX) / SCALE, dy = (e.clientY - rsY) / SCALE;
    const delta = (Math.abs(dx) > Math.abs(dy) ? dx : dy);
    const ns = Math.max(0.3, rsScale + delta / 150); el.dataset.scale = ns; el.style.transform = `scale(${ns})`; el.style.transformOrigin = 'top left';
  });
  document.addEventListener('mouseup', () => { isResizing = false; });
}

export function syncEditorToDoc() {
  [['prevCovLogo', ['covLogoImg', 'covCircle']], ['prevCovName', ['covName']], ['prevCovSlogan', ['covSlogan']], ['prevCovType', ['covDtype']], ['prevCovFoot', ['covFtC', 'covFtN']]].forEach(([prevId, docIds]) => {
    const prevEl = document.getElementById(prevId); if (!prevEl) return;
    const hidden = prevEl.style.display === 'none';
    docIds.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = hidden ? 'none' : ''; });
  });
  const logoEl = document.getElementById('prevCovLogo');
  if (logoEl?.dataset.scale) { const sc = logoEl.dataset.scale; ['covLogoImg', 'covCircle'].forEach(id => { const el = document.getElementById(id); if (el) el.style.transform = `scale(${sc})`; }); }
  const nameEl = document.getElementById('prevCovName');
  if (nameEl?.dataset.scale) { const sc = nameEl.dataset.scale; const el = document.getElementById('covName'); if (el) el.style.transform = `scale(${sc})`; }
}

// ── Init smeta ────────────────────────────────────────────────────

export function initSmeta() {
  addRoom('Спальня', '12.92', '36.92', '14.13');
  addRoom('Кухня - гостиная', '14.69', '42.21', '14.72');
  addRoom('Прихожая', '3.30', '15.82', '5.03');
  addRoom('Сан. узел', '3.57', '19.86', '6.92');
  liveUpdate();
  // Init editor for right panel right away (not only in modal)
  setTimeout(initRightPanelEditor, 200);
}


// ══════════════════════════════════════════════════════════════════
// BLOCK EDITOR — universal drag/resize/edit for .spp-a4 pages
// ══════════════════════════════════════════════════════════════════
//
// ══════════════════════════════════════════════════════════════════
// BLOCK EDITOR v3 — drag-to-move, corner-resize, minimal toolbar
// ══════════════════════════════════════════════════════════════════
// UX:
//   • Click element → select (blue outline, show mini toolbar at bottom)
//   • Hold & drag element body → reposition
//   • Drag corner handle (bottom-right) → resize / scale
//   • Double-click text → inline edit (contenteditable)
//   • Toolbar: rotate ↺  |  hide ✕  (just two small buttons)
//   • Click outside → deselect

const BlockEditor = (() => {

  let _sel = null; // selected element

  // ── CSS ─────────────────────────────────────────────────────────
  const CSS = `
    .be-block {
      box-sizing: border-box;
      border-radius: 2px;
    }
    .be-block:hover {
      outline: 1.5px dashed rgba(74,159,255,0.32);
      outline-offset: 2px;
      cursor: grab;
    }
    .be-block.be-selected {
      outline: 2px solid #4a9eff !important;
      outline-offset: 2px;
      cursor: grab;
    }
    .be-block.be-editing {
      outline: 2px solid #2272e0 !important;
      cursor: text !important;
    }
    .be-block.be-dragging {
      cursor: grabbing !important;
      opacity: .92;
    }
    .be-block.be-hidden {
      opacity: .08;
    }

    /* ── Mini toolbar (bottom of selected block) ── */
    .be-toolbar {
      display: none;
      position: absolute;
      bottom: -30px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 9999;
      background: #1a1a2e;
      border-radius: 20px;
      padding: 4px 8px;
      gap: 4px;
      align-items: center;
      box-shadow: 0 3px 12px rgba(0,0,0,.32);
      user-select: none;
      pointer-events: all;
      white-space: nowrap;
    }
    .be-block.be-selected > .be-toolbar,
    .be-block.be-editing > .be-toolbar { display: flex; }

    .be-tbtn {
      background: rgba(255,255,255,.12);
      border: none;
      border-radius: 12px;
      color: #fff;
      font-size: 12px;
      padding: 3px 9px;
      cursor: pointer;
      font-family: 'Onest', sans-serif;
      line-height: 1.3;
      transition: background .12s;
    }
    .be-tbtn:hover { background: rgba(255,255,255,.28); }
    .be-tbtn-del { background: rgba(180,40,30,.55) !important; }
    .be-tbtn-del:hover { background: rgba(220,60,45,.85) !important; }

    /* ── Corner resize handle ── */
    .be-resize {
      display: none;
      position: absolute;
      bottom: -5px;
      right: -5px;
      width: 12px;
      height: 12px;
      background: #4a9eff;
      border-radius: 3px;
      cursor: se-resize;
      z-index: 9999;
    }
    .be-block.be-selected > .be-resize { display: block; }

    /* ── Margin guide ── */
    .be-margin-guide {
      position: absolute;
      pointer-events: none;
      z-index: 0;
      border: 1px dashed rgba(150,150,150,.28);
      box-sizing: border-box;
    }
  `;

  function injectStyle() {
    if (document.getElementById('be-style-v3')) return;
    const s = document.createElement('style');
    s.id = 'be-style-v3';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  // ── Helpers ──────────────────────────────────────────────────────
  function getScale(el) { return parseFloat(el.dataset.beScale || '1'); }
  function getRot(el)   { return parseFloat(el.dataset.beRot   || '0'); }

  function applyTransform(el) {
    el.style.transform = `rotate(${getRot(el)}deg) scale(${getScale(el)})`;
    el.style.transformOrigin = 'top left';
  }

  // Snapshot absolute position from current layout (call before first drag)
  function snapAbsolute(el, page) {
    if (el.dataset.bePosInit) return;
    el.dataset.bePosInit = '1';
    const pr = page.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    el.style.position = 'absolute';
    el.style.margin   = '0';
    // strip centering translate
    el.style.transform = (el.style.transform || '').replace(/translate\([^)]*\)/g, '').trim();
    el.style.left = (er.left - pr.left) + 'px';
    el.style.top  = (er.top  - pr.top)  + 'px';
  }

  // ── Selection ────────────────────────────────────────────────────
  function select(el) {
    if (_sel && _sel !== el) deselect(_sel);
    _sel = el;
    el.classList.add('be-selected');
  }
  function deselect(el) {
    if (!el) return;
    el.classList.remove('be-selected', 'be-editing', 'be-dragging');
    if (el.contentEditable === 'true') {
      el.contentEditable = 'false';
    }
    if (_sel === el) _sel = null;
  }

  // ── Drag-to-move ─────────────────────────────────────────────────
  function setupDragMove(el, page) {
    let active = false, moved = false, ox, oy, sx, sy;

    el.addEventListener('mousedown', e => {
      if (e.target.closest('.be-toolbar') || e.target.closest('.be-resize')) return;
      if (e.button !== 0) return;
      // If in text editing mode — don't start drag
      if (el.classList.contains('be-editing')) return;

      e.preventDefault();
      select(el);
      snapAbsolute(el, page);

      active = true;
      moved  = false;
      sx = e.clientX; sy = e.clientY;
      ox = parseFloat(el.style.left) || 0;
      oy = parseFloat(el.style.top)  || 0;

      const onMove = mv => {
        const dx = mv.clientX - sx, dy = mv.clientY - sy;
        if (!moved && Math.hypot(dx, dy) < 3) return;
        moved = true;
        el.classList.add('be-dragging');
        el.style.left = (ox + dx) + 'px';
        el.style.top  = (oy + dy) + 'px';
      };
      const onUp = () => {
        active = false;
        el.classList.remove('be-dragging');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup',   onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup',   onUp);
    });
  }

  // ── Corner resize ────────────────────────────────────────────────
  function setupResize(resizeHandle, el, page) {
    resizeHandle.addEventListener('mousedown', e => {
      e.preventDefault();
      e.stopPropagation();
      snapAbsolute(el, page);

      const startX = e.clientX, startY = e.clientY;
      const startScale = getScale(el);
      // Use larger dimension as reference
      const rect = el.getBoundingClientRect();
      const refSize = Math.max(rect.width, rect.height) / startScale;

      const onMove = mv => {
        const dx = mv.clientX - startX;
        const dy = mv.clientY - startY;
        const delta = (Math.abs(dx) > Math.abs(dy) ? dx : dy);
        const newScale = Math.max(0.15, Math.min(5, startScale + delta / refSize));
        el.dataset.beScale = newScale.toFixed(3);
        applyTransform(el);
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup',   onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup',   onUp);
    });
  }

  // ── Double-click to edit text ────────────────────────────────────
  function setupTextEdit(el) {
    el.addEventListener('dblclick', e => {
      if (e.target.closest('.be-toolbar') || e.target.closest('.be-resize')) return;
      select(el);
      el.contentEditable = 'true';
      el.spellcheck = false;
      el.classList.add('be-editing');
      el.focus();
      // Move cursor to click position
      try {
        const range = document.caretRangeFromPoint(e.clientX, e.clientY);
        if (range) {
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
        }
      } catch(_) {}
    });
    el.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        el.contentEditable = 'false';
        el.classList.remove('be-editing');
        el.blur();
      }
    });
    el.addEventListener('blur', () => {
      el.contentEditable = 'false';
      el.classList.remove('be-editing');
    }, true);
  }

  // ── Toolbar (rotate + hide) ──────────────────────────────────────
  function mkToolbar(el) {
    const t = document.createElement('div');
    t.className = 'be-toolbar';
    t.innerHTML = `
      <button class="be-tbtn be-tbtn-rot" title="Повернуть на 90°">↺</button>
      <button class="be-tbtn be-tbtn-del" title="Скрыть / показать">✕</button>`;

    t.addEventListener('mousedown', e => e.stopPropagation());

    t.querySelector('.be-tbtn-rot').onclick = e => {
      e.stopPropagation();
      el.dataset.beRot = (getRot(el) + 90) % 360;
      applyTransform(el);
    };
    t.querySelector('.be-tbtn-del').onclick = e => {
      e.stopPropagation();
      const hidden = el.classList.toggle('be-hidden');
      el.dataset.beHidden = hidden ? '1' : '0';
      e.target.textContent = hidden ? '👁' : '✕';
      e.target.title = hidden ? 'Показать' : 'Скрыть';
    };
    return t;
  }

  // ── Attach editor to one element ─────────────────────────────────
  function attach(el, page) {
    if (!el || el.dataset.beInit) return;
    el.dataset.beInit = '1';
    el.classList.add('be-block');
    el.style.position = el.style.position || 'relative';

    // Toolbar
    el.appendChild(mkToolbar(el));

    // Corner resize handle
    const rh = document.createElement('div');
    rh.className = 'be-resize';
    el.appendChild(rh);
    setupResize(rh, el, page);

    // Drag-to-move
    setupDragMove(el, page);

    // Text edit (for non-table, non-image blocks)
    const hasTable = !!el.querySelector('table');
    const hasImg   = !!el.querySelector('img:not(.be-resize)');
    if (!hasTable && !hasImg) {
      setupTextEdit(el);
    }
  }

  // ── Margin guide (2cm ≈ 38px at 96dpi / A4 794px wide) ──────────
  // Preview panel width ~680px → ratio 680/794 ≈ 0.856 → 2cm ≈ 64px
  function addMarginGuide(page) {
    if (page.querySelector('.be-margin-guide')) return;
    const g = document.createElement('div');
    g.className = 'be-margin-guide';
    // 2cm at 96dpi = 75.6px; preview scales A4 to ~680px (794*0.856)
    // So margin = 75.6 * 0.856 ≈ 65px
    const m = 65;
    g.style.cssText = `top:${m}px;left:${m}px;right:${m}px;bottom:${m}px;`;
    page.appendChild(g);
  }

  // ── Click outside → deselect ─────────────────────────────────────
  function setupDeselect(page) {
    if (page.dataset.beDeselect) return;
    page.dataset.beDeselect = '1';
    page.addEventListener('mousedown', e => {
      if (!e.target.closest('.be-block') && !e.target.closest('.be-toolbar')) {
        if (_sel) deselect(_sel);
      }
    });
  }

  // ── Init one .spp-a4 page ────────────────────────────────────────
  function initPage(page) {
    if (!page || page.dataset.bePageInit) return;
    page.dataset.bePageInit = '1';
    page.style.position = 'relative';

    addMarginGuide(page);
    setupDeselect(page);

    // Direct children (excluding guide/toolbar injected elements)
    Array.from(page.children).forEach(child => {
      const c = child.className || '';
      if (c.includes('be-margin') || c.includes('be-toolbar')) return;
      attach(child, page);
    });

    // Named inner elements that should be individually editable
    [
      '#prevCovLogo2','#prevCovName2','#prevCovSlogan2','#prevCovType2',
      '#prevObjInfo2','#prevPlanBox2','.be-editable-title',
      '.be-plan-docs',
    ].forEach(sel => page.querySelectorAll(sel).forEach(el => attach(el, page)));
  }

  // ── Public ───────────────────────────────────────────────────────
  function init() {
    injectStyle();
    document.querySelectorAll('.spp-a4').forEach(initPage);
  }

  return { init, initPage };

})();

function initRightPanelEditor() {
  BlockEditor.init();
  window.BlockEditor = BlockEditor;
}

export { BlockEditor };
