// ─── smeta-excel.js ────────────────────────────────────────────────
// Парсинг Excel и CSV. Зависит только от глобального XLSX (SheetJS).
// Экспортирует parseExcelFile(file, callback) — публичный API.

function _parseFile(file, cb) {
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

function _smartParse(json) {
  if (!json || json.length < 2) return [];

  // Найти строку-заголовок (первая строка с ≥3 непустых ячеек)
  let hi = 0;
  for (let i = 0; i < Math.min(json.length, 15); i++) {
    if (json[i].filter(c => String(c || '').trim()).length >= 3) { hi = i; break; }
  }
  const mergeRows = Math.min(hi + 2, json.length);

  // Собрать заголовок (возможно двустрочный)
  const h = json[hi].map((c, ci) => {
    let val = String(c || '').toLowerCase().trim();
    for (let r = hi + 1; r < mergeRows; r++) {
      const sub = String(json[r][ci] || '').toLowerCase().trim();
      if (sub) val = val ? val + ' ' + sub : sub;
    }
    return val;
  });

  const fi = (...kw) => {
    for (const k of kw) { const i = h.findIndex(x => x.includes(k)); if (i >= 0) return i; }
    return -1;
  };

  const cols = {
    name:  fi('наименование', 'вид работ', 'позиция', 'работ', 'материал', 'смр', 'name', 'description'),
    unit:  fi('ед. изм', 'ед.изм', 'единиц', 'ед ', 'unit', 'измер'),
    qty:   fi('кол-во', 'количество', 'объём', 'объем', 'кол ', 'qty', 'count'),
    price: fi('за ед', 'за единиц', 'цена за', 'расценка', 'тариф', 'rate', 'price'),
    total: fi('всего', 'итого', 'сумма', 'стоимость работ', 'amount', 'total'),
    note:  fi('примечание', 'коммент', 'note', 'comment', 'remarks'),
  };

  // Фолбэк если колонка «Наименование» не найдена
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
    const row  = json[i];
    const name = String(row[cols.name] || '').trim();
    if (!name) continue;
    if (/^итого|^всего|^total/i.test(name)) continue;

    const qty   = cols.qty   >= 0 ? n(row[cols.qty])   : 0;
    const price = cols.price >= 0 ? n(row[cols.price]) : 0;
    let   total = cols.total >= 0 ? n(row[cols.total]) : 0;
    if (!total && qty && price) total = qty * price;

    const note      = cols.note >= 0 ? String(row[cols.note] || '').trim() : '';
    const unit      = cols.unit >= 0 ? String(row[cols.unit] || '').trim() : '';
    const isSection = !unit && !qty && !price && !total;

    rows.push({ name, unit, qty: qty || '', price: price || '', total: total || 0, note, isSection });
  }
  return rows;
}

// ── Публичный API ──────────────────────────────────────────────────
// callback(rows: Array, error: Error|null)
export function parseExcelFile(file, callback) {
  _parseFile(file, (json, err) => {
    if (err) { callback(null, err); return; }
    callback(_smartParse(json), null);
  });
}
