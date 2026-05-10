// ─── js/smeta/kp-preview.js ────────────────────────────────────────
// Заполняет все страницы КП (kp.html) актуальными данными из appState.
// Вызывать: liveUpdateKP() — при каждом переходе на вкладку КП,
// а также после любых изменений данных (СМР, материалы, комнаты).

import { appState } from '../state.js';

// ── Утилиты ────────────────────────────────────────────────────────

const el = id => document.getElementById(id);

function fmtMoney(n) {
  return (n || 0).toLocaleString('ru-RU', { maximumFractionDigits: 0 }) + ' ₽';
}

function fmtNum(n, digits = 2) {
  if (n == null || n === '') return '—';
  return parseFloat(n).toFixed(digits);
}

function sumRows(rows) {
  return (rows || []).filter(r => !r.isSection).reduce((s, r) => s + (r.total || 0), 0);
}

// ── Получить профиль компании ──────────────────────────────────────

function getCompany() {
  const profile = window._auth?._currentProfile || {};
  const name =
    el('profileCompanyName')?.value ||
    profile.companyName ||
    'КОМПАНИЯ';
  return {
    name,
    slogan:    el('profileSlogan')?.value    || profile.slogan    || 'КАЧЕСТВО ПОД КЛЮЧ',
    ownerName: el('profileOwnerName')?.value || profile.ownerName || '',
    phone:     el('profilePhone')?.value     || profile.phone     || '',
    email:     profile.email  || '',
    site:      profile.site   || '',
    logoBase64: profile.logoBase64 || appState.logoData || null,
    letter:    (name || 'К')[0].toUpperCase(),
  };
}

// ── Получить адрес объекта ─────────────────────────────────────────

function getAddress() {
  const street = el('hdrStreet')?.value?.trim() || '';
  const house  = el('hdrHouse')?.value?.trim()  || '';
  const flat   = el('hdrFlat')?.value?.trim()   || '';
  const parts  = [street, house, flat ? 'кв. ' + flat : ''].filter(Boolean);
  return parts.join(', ') || '—';
}

// ── Обмерный план / чертёж ─────────────────────────────────────────

function getPlanImages() {
  return {
    clean:    appState.planData     || null,
    measured: appState.planDataFull || null,
  };
}

// ─────────────────────────────────────────────────────────────────
// ЛИСТ 1 — Обложка
// ─────────────────────────────────────────────────────────────────

function fillCover(company) {
  // Центральный блок
  const nameEl   = el('prevCovName2');
  const sloganEl = el('prevCovSlogan2');
  const circle   = el('prevCircle2');
  const logoImg  = el('prevLogoImg2');

  if (nameEl)   nameEl.textContent   = company.name;
  if (sloganEl) sloganEl.textContent = company.slogan;

  // Логотип vs буква
  if (company.logoBase64) {
    if (logoImg)  { logoImg.src = company.logoBase64; logoImg.style.display = ''; }
    if (circle)   circle.style.display = 'none';
  } else {
    if (logoImg)  logoImg.style.display = 'none';
    if (circle) {
      circle.style.display = '';
      circle.textContent = company.letter;
    }
  }

  // Футер обложки
  const footCircle = el('prevFootCircle2');
  const footName   = el('prevFootName2');
  const footLogo   = el('prevFootLogoImg2');

  if (company.logoBase64) {
    if (footLogo)   { footLogo.src = company.logoBase64; footLogo.style.display = ''; }
    if (footCircle) footCircle.style.display = 'none';
    if (footName)   footName.style.display = 'none';
  } else {
    if (footLogo)   footLogo.style.display = 'none';
    if (footCircle) { footCircle.style.display = ''; footCircle.textContent = company.letter; }
    if (footName)   { footName.style.display = ''; footName.textContent = company.name; }
  }
}

// ─────────────────────────────────────────────────────────────────
// ЛИСТ 2 — Планирование работ
// ─────────────────────────────────────────────────────────────────

function fillPlanning(company, address, images) {
  // Информация об объекте (правая колонка, верх)
  const infoEl = el('prevObjInfo2');
  if (infoEl) {
    const inspDate = el('smetaDate')?.value || '';
    const dateStr  = inspDate
      ? new Date(inspDate).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : '—';
    infoEl.innerHTML =
      `<div><span style="color:#888">Объект:&nbsp;</span>${address}</div>` +
      `<div><span style="color:#888">Дата осмотра:&nbsp;</span>${dateStr}</div>`;
  }

  // Итоги (центр правой колонки)
  const smrT   = sumRows(appState.smrRows);
  const matT   = sumRows(appState.matRows);
  const total  = smrT + matT;
  const days   = appState.totalDaysOverride || appState.totalDays || 0;

  const totalsEl = el('prevPlanTotals2');
  if (totalsEl) {
    totalsEl.style.display = (smrT > 0 || matT > 0) ? '' : 'none';
  }
  const smrTotEl   = el('prevPlanSmrTot2');
  const matTotEl   = el('prevPlanMatTot2');
  const totalTotEl = el('prevPlanTotalTot2');
  const daysEl     = el('prevPlanDays2');

  if (smrTotEl)   smrTotEl.textContent   = fmtMoney(smrT);
  if (matTotEl)   matTotEl.textContent   = fmtMoney(matT);
  if (totalTotEl) totalTotEl.textContent = fmtMoney(total);
  if (daysEl)     daysEl.textContent     = days ? days + ' дн.' : '—';

  // Изображение плана (левая колонка)
  const planImg = el('prevPlanImg2');
  const planPh  = el('prevPlanPh2');
  if (images.clean) {
    if (planImg) { planImg.src = images.clean; planImg.style.display = ''; }
    if (planPh)  planPh.style.display = 'none';
  } else {
    if (planImg) planImg.style.display = 'none';
    if (planPh)  planPh.style.display = '';
  }

  // Экспликация помещений
  fillRoomsTable();

  // Футер
  _fillFooter('prevPlanFootLogoImg2', 'prevPlanFootCircle2', 'prevPlanFootName2', company);
}

// Экспликация помещений
function fillRoomsTable() {
  const tbody = el('prevRoomsBody2');
  const tfoot = el('prevRoomsFoot2');
  if (!tbody) return;

  const rooms = appState.rooms || [];
  tbody.innerHTML = '';

  let totalFloor = 0, totalWall = 0, totalPerim = 0;

  rooms.forEach(room => {
    const floor = room.area           ?? room.floorArea ?? 0;
    const wall  = room.metrics?.wallAreaCleanM2 ?? room.wallArea  ?? 0;
    const perim = room.metrics?.perimeterFloorM ?? room.perimeter ?? 0;

    totalFloor += floor;
    totalWall  += wall;
    totalPerim += perim;

    const name = room.name || room.id || 'Помещение';
    const tr = document.createElement('tr');
    tr.innerHTML =
      `<td style="border:1px solid #bbb;padding:4px 7px;font-size:14px">${name}</td>` +
      `<td style="border:1px solid #bbb;padding:4px 7px;text-align:center;font-size:14px">${fmtNum(floor)}</td>` +
      `<td style="border:1px solid #bbb;padding:4px 7px;text-align:center;font-size:14px">${fmtNum(wall)}</td>` +
      `<td style="border:1px solid #bbb;padding:4px 7px;text-align:center;font-size:14px">${fmtNum(perim)}</td>`;
    tbody.appendChild(tr);
  });

  if (tfoot) {
    tfoot.innerHTML = rooms.length
      ? `<tr style="font-weight:600;background:#f5f5f2">
          <td style="border:1px solid #bbb;padding:4px 7px;font-size:14px">ИТОГО</td>
          <td style="border:1px solid #bbb;padding:4px 7px;text-align:center;font-size:14px">${fmtNum(totalFloor)}</td>
          <td style="border:1px solid #bbb;padding:4px 7px;text-align:center;font-size:14px">${fmtNum(totalWall)}</td>
          <td style="border:1px solid #bbb;padding:4px 7px;text-align:center;font-size:14px">${fmtNum(totalPerim)}</td>
         </tr>`
      : '';
  }
}

// ─────────────────────────────────────────────────────────────────
// ЛИСТ 3 — Обмерный план
// ─────────────────────────────────────────────────────────────────

function fillBlueprint(company, images) {
  const bpImg = el('prevBpImg2');
  const bpPh  = el('prevBpPh2');

  if (images.measured) {
    if (bpImg) { bpImg.src = images.measured; bpImg.style.display = ''; }
    if (bpPh)  bpPh.style.display = 'none';
  } else if (images.clean) {
    // Запасной вариант — чистый план если обмерного нет
    if (bpImg) { bpImg.src = images.clean; bpImg.style.display = ''; }
    if (bpPh)  bpPh.style.display = 'none';
  } else {
    if (bpImg) bpImg.style.display = 'none';
    if (bpPh)  bpPh.style.display = '';
  }

  _fillFooter('prevBpFtLogoImg2', 'prevBpFtC2', 'prevBpFtN2', company);
}

// ─────────────────────────────────────────────────────────────────
// ЛИСТ 4 — Смета СМР
// ─────────────────────────────────────────────────────────────────

function fillSmrPage(company) {
  const tbody   = el('prevSmrBody2');
  const emptyEl = el('prevSmrEmpty2');
  if (!tbody) return;

  const rows = appState.smrRows || [];
  const dataRows = rows.filter(r => !r.isSection);

  tbody.innerHTML = '';

  if (dataRows.length === 0) {
    if (emptyEl) emptyEl.style.display = '';
    _fillFooter('prevSmrFtLogoImg2', 'prevSmrFtC2', 'prevSmrFtN2', company);
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';

  let counter = 0;
  let total   = 0;

  rows.forEach(r => {
    const tr = document.createElement('tr');

    if (r.isSection) {
      // Строка-раздел
      tr.style.background = '#fcebb0';
      tr.innerHTML =
        `<td colspan="7" style="border:1px solid #c9b86a;padding:3px 8px;font-weight:600;font-size:14px;color:#5a4000">` +
        `${r.name || 'Раздел'}</td>`;
    } else {
      counter++;
      const rowTotal = r.total || 0;
      total += rowTotal;
      tr.innerHTML =
        `<td style="border:1px solid #ddd;padding:3px 8px;text-align:center;font-size:14px">${counter}</td>` +
        `<td style="border:1px solid #ddd;padding:3px 8px;font-size:14px">${r.name || ''}</td>` +
        `<td style="border:1px solid #ddd;padding:3px 8px;text-align:center;font-size:14px">${r.unit || ''}</td>` +
        `<td style="border:1px solid #ddd;padding:3px 8px;text-align:center;font-size:14px">${r.qty != null ? r.qty : ''}</td>` +
        `<td style="border:1px solid #ddd;padding:3px 8px;text-align:right;font-size:14px">${r.price ? fmtMoney(r.price).replace(' ₽','') : ''}</td>` +
        `<td style="border:1px solid #ddd;padding:3px 8px;text-align:right;font-size:14px;font-weight:500">${rowTotal ? fmtMoney(rowTotal) : ''}</td>` +
        `<td style="border:1px solid #ddd;padding:3px 8px;font-size:13px;color:#888">${r.note || ''}</td>`;
    }

    tbody.appendChild(tr);
  });

  // Итоговая строка
  const tfootTr = document.createElement('tr');
  tfootTr.style.background = '#fcebb0';
  tfootTr.style.fontWeight = '600';
  tfootTr.innerHTML =
    `<td colspan="5" style="border:1px solid #c9b86a;padding:5px 8px;font-size:14px">ИТОГО по работам</td>` +
    `<td style="border:1px solid #c9b86a;padding:5px 8px;text-align:right;font-size:14px">${fmtMoney(total)}</td>` +
    `<td style="border:1px solid #c9b86a"></td>`;
  tbody.appendChild(tfootTr);

  _fillFooter('prevSmrFtLogoImg2', 'prevSmrFtC2', 'prevSmrFtN2', company);
}

// ─────────────────────────────────────────────────────────────────
// ЛИСТ 5 — Смета материалов
// ─────────────────────────────────────────────────────────────────

function fillMatPage(company) {
  const tbody   = el('prevMatBody2');
  const emptyEl = el('prevMatEmpty2');
  if (!tbody) return;

  const rows = appState.matRows || [];
  const dataRows = rows.filter(r => !r.isSection);

  tbody.innerHTML = '';

  if (dataRows.length === 0) {
    if (emptyEl) emptyEl.style.display = '';
    _fillFooter('prevMatFtLogoImg2', 'prevMatFtC2', 'prevMatFtN2', company);
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';

  let counter = 0;
  let total   = 0;

  rows.forEach(r => {
    const tr = document.createElement('tr');

    if (r.isSection) {
      tr.style.background = '#d8e4f2';
      tr.innerHTML =
        `<td colspan="7" style="border:1px solid #9fb8d9;padding:3px 8px;font-weight:600;font-size:14px;color:#1a3a5c">` +
        `${r.name || 'Раздел'}</td>`;
    } else {
      counter++;
      const rowTotal = r.total || 0;
      total += rowTotal;
      tr.innerHTML =
        `<td style="border:1px solid #ddd;padding:3px 8px;text-align:center;font-size:14px">${counter}</td>` +
        `<td style="border:1px solid #ddd;padding:3px 8px;font-size:14px">${r.name || ''}</td>` +
        `<td style="border:1px solid #ddd;padding:3px 8px;text-align:center;font-size:14px">${r.unit || ''}</td>` +
        `<td style="border:1px solid #ddd;padding:3px 8px;text-align:center;font-size:14px">${r.qty != null ? r.qty : ''}</td>` +
        `<td style="border:1px solid #ddd;padding:3px 8px;text-align:right;font-size:14px">${r.price ? fmtMoney(r.price).replace(' ₽','') : ''}</td>` +
        `<td style="border:1px solid #ddd;padding:3px 8px;text-align:right;font-size:14px;font-weight:500">${rowTotal ? fmtMoney(rowTotal) : ''}</td>` +
        `<td style="border:1px solid #ddd;padding:3px 8px;font-size:13px;color:#888">${r.note || ''}</td>`;
    }

    tbody.appendChild(tr);
  });

  // Итоговая строка
  const tfootTr = document.createElement('tr');
  tfootTr.style.background = '#d8e4f2';
  tfootTr.style.fontWeight = '600';
  tfootTr.innerHTML =
    `<td colspan="5" style="border:1px solid #9fb8d9;padding:5px 8px;font-size:14px">ИТОГО по материалам</td>` +
    `<td style="border:1px solid #9fb8d9;padding:5px 8px;text-align:right;font-size:14px">${fmtMoney(total)}</td>` +
    `<td style="border:1px solid #9fb8d9"></td>`;
  tbody.appendChild(tfootTr);

  _fillFooter('prevMatFtLogoImg2', 'prevMatFtC2', 'prevMatFtN2', company);
}

// ─────────────────────────────────────────────────────────────────
// Футер (логотип/буква компании) — общий хелпер
// ─────────────────────────────────────────────────────────────────

function _fillFooter(logoImgId, circleId, nameId, company) {
  const logoImg = el(logoImgId);
  const circle  = el(circleId);
  const nameEl  = el(nameId);

  if (company.logoBase64) {
    if (logoImg) { logoImg.src = company.logoBase64; logoImg.style.display = ''; }
    if (circle)  circle.style.display = 'none';
    if (nameEl)  nameEl.style.display = 'none';
  } else {
    if (logoImg) logoImg.style.display = 'none';
    if (circle)  { circle.style.display = ''; circle.textContent = company.letter; }
    if (nameEl)  { nameEl.style.display = ''; nameEl.textContent = company.name; }
  }
}

// ─────────────────────────────────────────────────────────────────
// ГЛАВНАЯ ФУНКЦИЯ — вызывать при открытии вкладки КП
// и после любых изменений данных
// ─────────────────────────────────────────────────────────────────

export function liveUpdateKP() {
  // Проверяем что страницы КП вообще есть в DOM
  if (!el('prevCover2') && !el('prevSmrBody2')) return;

  const company = getCompany();
  const address = getAddress();
  const images  = getPlanImages();

  fillCover(company);
  fillPlanning(company, address, images);
  fillBlueprint(company, images);
  fillSmrPage(company);
  fillMatPage(company);
}

// Экспортируем в window чтобы можно было вызывать из других мест
if (typeof window !== 'undefined') {
  window._kpPreview = { liveUpdateKP };
}
