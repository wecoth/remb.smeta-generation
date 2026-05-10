// ─── js/smeta/kp-preview.js ────────────────────────────────────────
// Заполняет все страницы КП актуальными данными из appState.
// Вызывать: liveUpdateKP() — при каждом переходе на вкладку КП.
// Версия 2.0 — 8 листов по новому макету.

import { appState } from '../state.js';
import { renderToImage } from '../render.js';

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

function today() {
  return new Date().toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtDate(val) {
  if (!val) return '—';
  return new Date(val).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ── Профиль компании ───────────────────────────────────────────────

function getCompany() {
  const profile = window._auth?._currentProfile || {};
  const name =
    el('profileCompanyName')?.value ||
    profile.companyName ||
    'КОМПАНИЯ';
  return {
    name,
    slogan:     el('profileSlogan')?.value    || profile.slogan    || 'КАЧЕСТВО ПОД КЛЮЧ',
    ownerName:  el('profileOwnerName')?.value || profile.ownerName || '',
    phone:      el('profilePhone')?.value     || profile.phone     || '',
    email:      profile.email  || '',
    site:       profile.site   || '',
    logoBase64: profile.logoBase64 || appState.logoData || null,
    letter:     (name || 'К')[0].toUpperCase(),
  };
}

// ── Адрес объекта ──────────────────────────────────────────────────

function getAddress() {
  const street = el('hdrStreet')?.value?.trim() || '';
  const house  = el('hdrHouse')?.value?.trim()  || '';
  const flat   = el('hdrFlat')?.value?.trim()   || '';
  const parts  = [street, house, flat ? 'кв. ' + flat : ''].filter(Boolean);
  return parts.join(', ') || '—';
}

// ── Изображения планов ─────────────────────────────────────────────
// Автоматически рендерит чертёж из текущего состояния стен.
// Если стен нет — возвращает null (показывается плейсхолдер).

function generateImages() {
  if (!appState.walls || appState.walls.length === 0) {
    return { clean: null, measured: null };
  }
  try {
    const clean    = renderToImage(1600, 1200, false);   // чистый план
    const measured = renderToImage(2480, 1754, true);    // обмерный план A4 landscape
    // Сохраняем в appState на случай использования в других местах
    appState.planData     = clean;
    appState.planDataFull = measured;
    return { clean, measured };
  } catch (e) {
    console.error('[KP] Ошибка авторендера плана:', e);
    // Фолбэк: вернуть то, что было захвачено вручную ранее
    return {
      clean:    appState.planData     || null,
      measured: appState.planDataFull || null,
    };
  }
}

// ── Этапы с суммами ────────────────────────────────────────────────
// Возвращает массив { name, color, days, smrTotal, matTotal, smrRows, matRows }

function getStagesWithTotals() {
  const stages  = appState.stages || [];
  const smrRows = appState.smrRows || [];
  const matRows = appState.matRows || [];

  return stages.map(stage => {
    const stageName = stage.name?.trim();

    // Собираем строки СМР внутри секции с именем этапа
    // (независимо от позиции секции в массиве)
    let inside = false;
    const stageSmr = [];
    for (const r of smrRows) {
      if (r.isSection) {
        inside = (r.name?.trim() === stageName);
        continue;              // ← убрали break, просто переключаем флаг
      }
      if (inside && r.name) stageSmr.push(r);
    }

    // Аналогично для материалов
    inside = false;
    const stageMat = [];
    for (const r of matRows) {
      if (r.isSection) {
        inside = (r.name?.trim() === stageName);
        continue;              // ← убрали break
      }
      if (inside && r.name) stageMat.push(r);
    }

    const days = (stage.daysOverride != null ? stage.daysOverride : stage.daysAuto) || 0;

    return {
      name:     stage.name,
      color:    stage.color || '#888',
      days,
      smrTotal: stageSmr.reduce((s, r) => s + (r.total || 0), 0),
      matTotal: stageMat.reduce((s, r) => s + (r.total || 0), 0),
      smrRows:  stageSmr,
      matRows:  stageMat,
    };
  });
}

// ─────────────────────────────────────────────────────────────────
// ЛИСТ 1 — Обложка
// ─────────────────────────────────────────────────────────────────

function fillCover(company) {
  const nameEl   = el('prevCovName2');
  const sloganEl = el('prevCovSlogan2');
  const circle   = el('prevCircle2');
  const logoImg  = el('prevLogoImg2');

  if (nameEl)   nameEl.textContent   = company.name;
  if (sloganEl) sloganEl.textContent = company.slogan;

  if (company.logoBase64) {
    if (logoImg)  { logoImg.src = company.logoBase64; logoImg.style.display = ''; }
    if (circle)   circle.style.display = 'none';
  } else {
    if (logoImg)  logoImg.style.display = 'none';
    if (circle) { circle.style.display = ''; circle.textContent = company.letter; }
  }

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

  const siteEl = el('prevCovSite2');
  if (siteEl) siteEl.textContent = company.site || '';
}

// ─────────────────────────────────────────────────────────────────
// ЛИСТ 2 — Объект
// ─────────────────────────────────────────────────────────────────

function fillObject(company, address, images) {
  // Заголовок и адрес
  const titleEl = el('prevObjTitle2');
  const addrEl  = el('prevObjAddress2');
  if (titleEl) titleEl.textContent = 'Объект';
  if (addrEl)  addrEl.textContent  = address;

  // Чертёж
  const img = el('prevObjPlanImg2');
  const ph  = el('prevObjPlanPh2');
  if (images.clean) {
    if (img) { img.src = images.clean; img.style.display = ''; }
    if (ph)  ph.style.display = 'none';
  } else {
    if (img) img.style.display = 'none';
    if (ph)  ph.style.display = '';
  }

  // Экспликация
  const tbody = el('prevObjRoomsBody2');
  const tfoot = el('prevObjRoomsFoot2');
  if (tbody) {
    const rooms = appState.rooms || [];
    let totalFloor = 0, totalPerim = 0, totalWalls = 0;

    // Обновляем заголовки таблицы до 5 колонок
    const table = tbody.closest('table');
    if (table) {
      let thead = table.querySelector('thead');
      if (!thead) {
        thead = document.createElement('thead');
        table.insertBefore(thead, tbody);
      }
      const headerRow = thead.querySelector('tr') || document.createElement('tr');
      if (!thead.contains(headerRow)) thead.appendChild(headerRow);
      while (headerRow.children.length < 5) {
        const th = document.createElement('th');
        headerRow.appendChild(th);
      }
      headerRow.children[0].textContent = '№';
      headerRow.children[1].textContent = 'Помещение';
      headerRow.children[2].textContent = 'Пол, м²';
      headerRow.children[3].textContent = 'Периметр, м';
      headerRow.children[4].textContent = 'Стены, м²';
      for (const th of headerRow.children) {
        th.style.cssText = 'padding:5px 4px;font-size:10px;font-weight:600;color:#888;text-align:right;border-bottom:1px solid #ccc;';
      }
      headerRow.children[0].style.textAlign = 'center';
      headerRow.children[1].style.textAlign = 'left';
    }

    tbody.innerHTML = rooms.map((room, i) => {
      const floor = room.area ?? room.floorArea ?? 0;
      const perim = room.perimeter ?? room.metrics?.perimeterFloorM ?? 0;
      const walls = room.wallArea ?? room.metrics?.wallAreaCleanM2 ?? 0;
      totalFloor += floor;
      totalPerim += perim;
      totalWalls += walls;
      const name = room.name || room.id || 'Помещение';
      return `<tr style="border-bottom:1px solid #f0f0f0">
        <td style="padding:5px 0;font-size:11px;color:#bbb;text-align:center">${i + 1}</td>
        <td style="padding:5px 8px;font-size:12px;color:#333">${name}</td>
        <td style="padding:5px 4px;font-size:12px;text-align:right;color:#333">${fmtNum(floor)}</td>
        <td style="padding:5px 4px;font-size:12px;text-align:right;color:#333">${fmtNum(perim)}</td>
        <td style="padding:5px 4px;font-size:12px;text-align:right;color:#333">${fmtNum(walls)}</td>
      </tr>`;
    }).join('');

    if (tfoot && rooms.length) {
      tfoot.innerHTML = `<tr style="border-top:1px solid #1c1c1c">
        <td colspan="2" style="padding:6px 0;font-size:12px;font-weight:600;color:#1c1c1c">итого</td>
        <td style="padding:6px 4px;font-size:12px;font-weight:600;text-align:right;color:#1c1c1c">${fmtNum(totalFloor)} м²</td>
        <td style="padding:6px 4px;font-size:12px;font-weight:600;text-align:right;color:#1c1c1c">${fmtNum(totalPerim)} м</td>
        <td style="padding:6px 4px;font-size:12px;font-weight:600;text-align:right;color:#1c1c1c">${fmtNum(totalWalls)} м²</td>
      </tr>`;
    }
  }

  // Параметры
  const inspDate = el('smetaDate')?.value || '';
  const smrT  = sumRows(appState.smrRows);
  const matT  = sumRows(appState.matRows);
  const days  = appState.totalDaysOverride || appState.totalDays || 0;

  const set = (id, val) => { const e = el(id); if (e) e.textContent = val; };
  set('prevObjInspDate2', fmtDate(inspDate));
  set('prevObjCompDate2', today());
  set('prevObjDays2',     days ? days + ' рабочих дней' : '—');
  set('prevObjSmrCost2',  smrT > 0 ? fmtMoney(smrT) : '—');
  set('prevObjMatCost2',  matT > 0 ? fmtMoney(matT) : '0 ₽');
  set('prevObjTotal2',    fmtMoney(smrT + matT));

  // Адрес на странице контактов (дублируем)
  set('prevCtAddress2', address);
  set('prevCtDate2',    fmtDate(inspDate));
  set('prevCtDays2',    days ? days + ' рабочих дней' : '—');
  set('prevCtSmr2',     smrT > 0 ? fmtMoney(smrT) : '—');
  set('prevCtMat2',     matT > 0 ? fmtMoney(matT) : '0 ₽');
  set('prevCtTotal2',   fmtMoney(smrT + matT));
}

// ─────────────────────────────────────────────────────────────────
// ЛИСТ 3 — Обмерный план
// ─────────────────────────────────────────────────────────────────

function fillBlueprint(company, images) {
  const bpImg = el('prevBpImg2');
  const bpPh  = el('prevBpPh2');

  const src = images.measured || images.clean;
  if (src) {
    if (bpImg) { bpImg.src = src; bpImg.style.display = ''; }
    if (bpPh)  bpPh.style.display = 'none';
  } else {
    if (bpImg) bpImg.style.display = 'none';
    if (bpPh)  bpPh.style.display = '';
  }

  _fillFooter('prevBpFtLogoImg2', 'prevBpFtC2', 'prevBpFtN2', company);
}

// ─────────────────────────────────────────────────────────────────
// ЛИСТ 4 — Карта ремонта
// ─────────────────────────────────────────────────────────────────

const GAS_PROXY_URL = 'https://script.google.com/macros/s/AKfycbzOORdjpCpP8i1wHovBJ1qxxgvFCg72_bDxbKwRPUyOUgZ8eM7uYPabjPrafKhTx4Osdg/exec';

// Нарратив — связный текст от GPT
let _roadmapNarrative = '';

function fillRoadmap() {
  const container   = el('prevRoadmapStages2');
  const narrativeEl = el('prevRoadmapNarrative2');

  // Нарратив (сгенерированный текст)
  if (narrativeEl) {
    if (_roadmapNarrative) {
      narrativeEl.innerHTML = _roadmapNarrative
        .split('\n\n')
        .filter(p => p.trim())
        .map(p => `<p style="margin:0 0 10px 0">${p.trim()}</p>`)
        .join('');
    } else {
      narrativeEl.innerHTML = '';
    }
  }

  // Список этапов с количеством дней
  if (!container) return;
  const stages = getStagesWithTotals();
  if (!stages.length) {
    container.innerHTML = '<div style="color:#ccc;font-size:13px;padding:40px 0;text-align:center">Добавьте этапы в смету</div>';
    return;
  }

  container.innerHTML = stages.map((stage, i) => {
    const num = String(i + 1).padStart(2, '0');
    return `<div class="kp-roadmap-item">
      <div class="kp-roadmap-num">${num}</div>
      <div class="kp-roadmap-body">
        <div class="kp-roadmap-title">${stage.name}</div>
      </div>
      <div>
        <div class="kp-roadmap-days">${stage.days || '—'}</div>
        <div class="kp-roadmap-days-label">${stage.days ? 'дней' : ''}</div>
      </div>
    </div>`;
  }).join('');
}

// Генерация нарратива через GPT (GAS-прокси)
// Генерация нарратива — финальная версия
// gpt-4o, все работы в порядке, 1000 токенов
// Заменяет generateRoadmapText() целиком.

async function generateRoadmapText() {
  const stages = getStagesWithTotals();
  if (!stages.length) return;
 
  const statusEl = el('prevRoadmapGenStatus');
  const btnEl    = el('btnGenerateRoadmap');
  if (statusEl) statusEl.textContent = 'Генерирую...';
  if (btnEl)    btnEl.disabled = true;
 
  // ── Контекст объекта ──────────────────────────────────────────
  const smrRows   = appState.smrRows  || [];
  const openings  = appState.openings || [];
  const totalDays = appState.totalDaysOverride || appState.totalDays || 0;
 
  const doors    = openings.filter(o => o.type === 'door').length;
  const windows  = openings.filter(o => o.type === 'window').length;
  const cleanRow = smrRows.find(r => r.name && r.name.includes('Генеральная уборка'));
  const area     = cleanRow ? cleanRow.qty : null;
 
  const objectContext = [
    area               ? `Площадь: около ${Math.round(area)} м²`         : null,
    (doors || windows) ? `Дверных проёмов: ${doors}, оконных: ${windows}` : null,
    totalDays          ? `Срок: ${totalDays} рабочих дней`                : null,
  ].filter(Boolean).join('. ');
 
  // ── Сигналы качества ──────────────────────────────────────────
  const allWorkNames = smrRows
    .filter(r => !r.isSection && r.name)
    .map(r => r.name.toLowerCase());
 
  const checks = [
    [n => n.includes('заусовка') && n.includes('45'),             'заусовка керамогранита под 45°'],
    [n => n.includes('эпоксидной затиркой'),                      'эпоксидная затирка швов'],
    [n => n.includes('скрытого монтажа'),                         'двери скрытого монтажа'],
    [n => n.includes('стеклохолст'),                              'армирование стен стеклохолстом'],
    [n => n.includes('наливной пол'),                             'наливной пол'],
    [n => n.includes('сшитый полиэтилен'),                        'водопровод из сшитого полиэтилена'],
    [n => n.includes('узла ввода') || n.includes('протечек'),     'узел ввода с защитой от протечек'],
    [n => n.includes('теплого пола') || n.includes('теплый пол'), 'тёплый пол'],
    [n => n.includes('обмазочной гидроизоляции'),                 'двухслойная гидроизоляция'],
    [n => n.includes('перегородок из газоблока'),                 'перегородки из газоблока'],
  ];
  const qualitySignals = checks
    .filter(([fn]) => allWorkNames.some(fn))
    .map(([, label]) => label)
    .join(', ');
 
  // ── Все работы в порядке выполнения ──────────────────────────
  const stagesContext = stages
    .filter(s => s.smrRows.length > 0)
    .map((s, i) => {
      const works = s.smrRows
        .filter(r => {
          const n = (r.name || '').toLowerCase();
          return !n.includes('вывоз') && !n.includes('мусор') && !n.includes('уборк');
        })
        .map(r => r.name.trim())
        .filter(Boolean);
      return `Этап ${i + 1} — ${s.name}:\n${works.map(w => `• ${w}`).join('\n')}`;
    })
    .join('\n\n');
 
  // ── Промт ─────────────────────────────────────────────────────
  const prompt = `Тебе переданы этапы ремонта квартиры. Напиши описание хода ремонта для коммерческого предложения.
 
ДАННЫЕ ОБ ОБЪЕКТЕ
${objectContext || 'не указаны'}
${qualitySignals ? `\nОСОБЕННОСТИ ПРОЕКТА: ${qualitySignals}` : ''}
 
ЭТАПЫ РЕМОНТА
${stagesContext}
 
ЭТАЛОН — пиши точно в таком стиле, это образец тона и структуры:
 
«Перед началом работ производится подготовка объекта — мойка и защита окон, входной двери и существующих элементов плёнкой ПВХ, организация временного освещения, розеток, а также временных выводов ХВС, ГВС и канализации для проведения работ.
 
Далее выполняется демонтаж существующих перегородок, перенос дверных проёмов, подготовка помещений под новую планировку и поэтапный вывоз строительного мусора.
 
В процессе ремонта будут возведены новые перегородки из газоблока, выполнено выравнивание и оштукатуривание стен, подготовка оснований под дальнейшую отделку, а также полный комплекс сантехнических и электромонтажных работ согласно проекту, включая разводку водоснабжения, канализации и электрики, монтаж электрощита, выводов под освещение, технику, тёплый пол и декоративную подсветку.
 
В санузле предусмотрены гидроизоляция, монтаж тёплого пола, облицовка стен и пола керамогранитом с заусовкой углов под 45° и эпоксидной затиркой, а также установка скрытых дверей и технических коробов из ГКЛ.
 
Предчистовая отделка включает армирование поверхностей, многослойное шпаклевание, оклейку стеклохолстом, шлифовку, грунтование и устройство наливного пола для получения ровных стен и основания.
 
На финальном этапе выполняются окраска стен, укладка кварцвинила, монтаж и окраска плинтусов, установка и подключение сантехники, освещения, розеток, выключателей, вентиляции и другого оборудования, предусмотренного проектом, после чего производится генеральная уборка и подготовка квартиры к сдаче.»
 
ПРАВИЛА
— Точно такой же тон: деловой, сухой, без лирики
— Не начинай каждый абзац с названия этапа из сметы — группируй работы по смыслу, как в эталоне
— Охвати все этапы, объединяй родственные в один абзац
— 5–7 абзацев, каждый 1–3 предложения
— Без заголовков, без списков, без нумерации
— Строительные термины используй как есть, без пояснений
— Не более 200 слов суммарно
 
Верни только готовый текст. Ничего больше.`.trim();
 
  // ── Запрос к GAS-прокси ───────────────────────────────────────
  try {
    const res = await fetch(GAS_PROXY_URL, {
      method:   'POST',
      redirect: 'follow',
      body:     JSON.stringify({
        prompt,
        model:     'gpt-4o',
        maxTokens: 350,
      }),
    });
 
    const text = await res.text();
    if (!text || text.startsWith('<')) throw new Error('Неверный ответ от прокси');
 
    _roadmapNarrative = text.trim();
    fillRoadmap();
 
    if (statusEl) statusEl.textContent = '✓ Готово';
    setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 3000);
 
  } catch (e) {
    console.error('[Roadmap] Ошибка генерации:', e);
    if (statusEl) statusEl.textContent = '✗ Ошибка: ' + e.message;
  }
 
  if (btnEl) btnEl.disabled = false;
}

// ─────────────────────────────────────────────────────────────────
// ЛИСТ 5 — Смета работ (пагинация по страницам А4)
// ─────────────────────────────────────────────────────────────────

// Сколько строк таблицы помещается на один лист.
// Подберите под реальную высоту строк и масштаб вашего .spp-page.
// Заголовок этапа считается за 1 строку, строка данных — за 1.
const SMR_ROWS_PER_PAGE = 22;

// Общий заголовок таблицы (шапка колонок) — выводится на каждой странице
function _smrTableHeader(label) {
  return `<table class="kp-smr-table">
    <thead><tr>
      <th style="width:20px">№</th>
      <th>${label}</th>
      <th style="width:52px">Ед.</th>
      <th style="width:52px">Кол-во</th>
      <th style="width:80px">Цена, ₽</th>
      <th style="width:80px">Сумма, ₽</th>
    </tr></thead>
    <tbody>`;
}

function fillSmrPage(company) {
  const content  = el('prevSmrContent2');
  const emptyEl  = el('prevSmrEmpty2');
  if (!content) return;

  const stages   = getStagesWithTotals();
  const dataRows = (appState.smrRows || []).filter(r => !r.isSection);

  // ── Пустое состояние ─────────────────────────────────────────
  if (!dataRows.length) {
    if (emptyEl) emptyEl.style.display = '';
    content.innerHTML = '';
    _fillFooter('prevSmrFtLogoImg2', 'prevSmrFtC2', 'prevSmrFtN2', company);
    // Удаляем ранее добавленные дополнительные страницы
    const originalPage = el('prevSmr2')?.closest('.spp-page');
    if (originalPage) {
      originalPage.parentNode.querySelectorAll('.spp-page--smr-extra').forEach(n => n.remove());
    }
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';

  // ── Собираем плоский список «элементов» ──────────────────────
  // Каждый элемент — либо заголовок этапа, либо строка данных.
  const allItems = [];
  const grandTotal = dataRows.reduce((s, r) => s + (r.total || 0), 0);

  if (stages.length) {
    stages.forEach(stage => {
      if (!stage.smrRows.length) return;
      allItems.push({ type: 'stage', name: stage.name, total: stage.smrTotal });
      stage.smrRows.forEach(r => allItems.push({ type: 'row', data: r }));
    });
  } else {
    dataRows.forEach(r => allItems.push({ type: 'row', data: r }));
  }

  // ── Разбиваем на страницы ────────────────────────────────────
  const pages = [];
  let cur = { items: [], count: 0 };
  for (const item of allItems) {
    if (cur.count >= SMR_ROWS_PER_PAGE && cur.items.length > 0) {
      pages.push(cur);
      cur = { items: [], count: 0 };
    }
    cur.items.push(item);
    cur.count++;
  }
  if (cur.items.length) pages.push(cur);

  // ── Ссылки на DOM ────────────────────────────────────────────
  const originalPage   = el('prevSmr2')?.closest('.spp-page');
  const pagesContainer = originalPage?.parentNode;
  if (!originalPage || !pagesContainer) {
    // Фолбэк: просто рендерим в content без пагинации
    _renderSmrFlat(content, allItems, grandTotal, company, true);
    return;
  }

  // Удаляем ранее добавленные дополнительные страницы
  pagesContainer.querySelectorAll('.spp-page--smr-extra').forEach(n => n.remove());

  // ── Рендерим каждую страницу ─────────────────────────────────
  let globalCounter = 0;
  let lastInsertedPage = originalPage;

  pages.forEach((page, pageIdx) => {
    const isFirst = pageIdx === 0;
    const isLast  = pageIdx === pages.length - 1;
    let html = '';
    let openTable = false;

    page.items.forEach(item => {
      if (item.type === 'stage') {
        // Закрываем предыдущую таблицу, если была открыта
        if (openTable) { html += '</tbody></table>'; openTable = false; }
        html += `<div class="kp-smr-stage-title">
          <span>${item.name}</span>
          <span style="font-size:11px;color:#888;font-weight:400">Итого по разделу: ${fmtMoney(item.total)}</span>
        </div>`;
        html += _smrTableHeader('Наименование работ');
        openTable = true;
      } else {
        // Если строки без этапа — открываем таблицу сами
        if (!openTable) {
          html += _smrTableHeader('Наименование работ');
          openTable = true;
        }
        globalCounter++;
        const r = item.data;
        html += `<tr>
          <td>${globalCounter}</td>
          <td>${r.name || ''}</td>
          <td style="text-align:center">${r.unit || ''}</td>
          <td>${r.qty != null ? r.qty : ''}</td>
          <td>${r.price ? r.price.toLocaleString('ru-RU', { maximumFractionDigits: 0 }) : ''}</td>
          <td style="font-weight:500">${r.total ? r.total.toLocaleString('ru-RU', { maximumFractionDigits: 0 }) : ''}</td>
        </tr>`;
      }
    });

    if (openTable) html += '</tbody></table>';

    // Итог — только на последней странице
    if (isLast) {
      html += `<div style="display:flex;justify-content:space-between;align-items:baseline;border-top:2px solid #1c1c1c;padding-top:10px;margin-top:4px">
        <span style="font-size:12px;font-weight:500;color:#888;text-transform:uppercase;letter-spacing:.5px">итого по работам</span>
        <span style="font-size:18px;font-weight:700;color:#1c1c1c">${fmtMoney(grandTotal)}</span>
      </div>`;
    }

    if (isFirst) {
      // Первая страница — заполняем оригинальный контейнер
      content.innerHTML = html;
      _fillFooter('prevSmrFtLogoImg2', 'prevSmrFtC2', 'prevSmrFtN2', company);
      // Убираем «ПЕРЕЧЕНЬ ПОЗИЦИЙ» на первой странице
      _hideSubtitle(originalPage);
    } else {
      // Дополнительные страницы — клонируем оригинал
      const newPage = originalPage.cloneNode(true);
      newPage.classList.add('spp-page--smr-extra');
      newPage.dataset.page = originalPage.dataset.page;

      // Скрываем блок «Смета строительно-монтажных работ» + «ПЕРЕЧЕНЬ ПОЗИЦИЙ»
      _hideSmrPageHeader(newPage);

      // Убираем empty-плейсхолдер
      const extraEmpty = newPage.querySelector('[id*="SmrEmpty"]');
      if (extraEmpty) extraEmpty.style.display = 'none';

      // Вставляем контент
      const extraContent = newPage.querySelector('[id*="SmrContent"]');
      if (extraContent) {
        extraContent.style.display = '';
        extraContent.innerHTML = html;
      }

      const ftLogo = newPage.querySelector('[id*="SmrFtLogoImg"]');
      const ftC    = newPage.querySelector('[id*="SmrFtC"]');
      const ftN    = newPage.querySelector('[id*="SmrFtN"]');
      _fillFooterEl(ftLogo, ftC, ftN, company);

      lastInsertedPage.after(newPage);
      lastInsertedPage = newPage;
    }
  });
}

// ─────────────────────────────────────────────────────────────────
// ЛИСТ 6 — Смета материалов (пагинация по страницам А4)
// ─────────────────────────────────────────────────────────────────

const MAT_ROWS_PER_PAGE = 22;

function fillMatPage(company) {
  const content  = el('prevMatContent2');
  const emptyEl  = el('prevMatEmpty2');
  const pageEl   = el('prevMat2')?.closest('.spp-page');
  if (!content) return;

  const stages   = getStagesWithTotals();
  const dataRows = (appState.matRows || []).filter(r => !r.isSection);

  // ── Удаляем ранее добавленные дополнительные страницы ────────
  const originalPage   = el('prevMat2')?.closest('.spp-page');
  const pagesContainer = originalPage?.parentNode;
  if (pagesContainer) {
    pagesContainer.querySelectorAll('.spp-page--mat-extra').forEach(n => n.remove());
  }

  // ── Пустое состояние ─────────────────────────────────────────
  if (!dataRows.length) {
    if (emptyEl) emptyEl.style.display = '';
    content.innerHTML = '';
    if (pageEl) pageEl.dataset.matEmpty = 'true';
    _fillFooter('prevMatFtLogoImg2', 'prevMatFtC2', 'prevMatFtN2', company);
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';
  if (pageEl)  delete pageEl.dataset.matEmpty;

  const grandTotal = dataRows.reduce((s, r) => s + (r.total || 0), 0);

  // ── Собираем плоский список ───────────────────────────────────
  const allItems = [];
  if (stages.length) {
    stages.forEach(stage => {
      if (!stage.matRows.length) return;
      allItems.push({ type: 'stage', name: stage.name, total: stage.matTotal });
      stage.matRows.forEach(r => allItems.push({ type: 'row', data: r }));
    });
  } else {
    dataRows.forEach(r => allItems.push({ type: 'row', data: r }));
  }

  // ── Разбиваем на страницы ────────────────────────────────────
  const pages = [];
  let cur = { items: [], count: 0 };
  for (const item of allItems) {
    if (cur.count >= MAT_ROWS_PER_PAGE && cur.items.length > 0) {
      pages.push(cur);
      cur = { items: [], count: 0 };
    }
    cur.items.push(item);
    cur.count++;
  }
  if (cur.items.length) pages.push(cur);

  if (!originalPage || !pagesContainer) {
    _renderMatFlat(content, allItems, grandTotal, company);
    return;
  }

  // ── Рендерим каждую страницу ─────────────────────────────────
  let globalCounter = 0;
  let lastInsertedPage = originalPage;

  pages.forEach((page, pageIdx) => {
    const isFirst = pageIdx === 0;
    const isLast  = pageIdx === pages.length - 1;
    let html = '';
    let openTable = false;

    page.items.forEach(item => {
      if (item.type === 'stage') {
        if (openTable) { html += '</tbody></table>'; openTable = false; }
        html += `<div class="kp-smr-stage-title">
          <span>${item.name}</span>
          <span style="font-size:11px;color:#888;font-weight:400">Итого по разделу: ${fmtMoney(item.total)}</span>
        </div>`;
        html += _smrTableHeader('Наименование материала');
        openTable = true;
      } else {
        if (!openTable) {
          html += _smrTableHeader('Наименование материала');
          openTable = true;
        }
        globalCounter++;
        const r = item.data;
        html += `<tr>
          <td>${globalCounter}</td>
          <td>${r.name || ''}</td>
          <td style="text-align:center">${r.unit || ''}</td>
          <td>${r.qty != null ? r.qty : ''}</td>
          <td>${r.price ? r.price.toLocaleString('ru-RU', { maximumFractionDigits: 0 }) : ''}</td>
          <td style="font-weight:500">${r.total ? r.total.toLocaleString('ru-RU', { maximumFractionDigits: 0 }) : ''}</td>
        </tr>`;
      }
    });

    if (openTable) html += '</tbody></table>';

    if (isLast) {
      html += `<div style="display:flex;justify-content:space-between;align-items:baseline;border-top:2px solid #1c1c1c;padding-top:10px;margin-top:4px">
        <span style="font-size:12px;font-weight:500;color:#888;text-transform:uppercase;letter-spacing:.5px">итого по материалам</span>
        <span style="font-size:18px;font-weight:700;color:#1c1c1c">${fmtMoney(grandTotal)}</span>
      </div>`;
    }

    if (isFirst) {
      content.innerHTML = html;
      _fillFooter('prevMatFtLogoImg2', 'prevMatFtC2', 'prevMatFtN2', company);
      // Убираем «ПЕРЕЧЕНЬ ПОЗИЦИЙ» на первой странице
      _hideSubtitle(originalPage);
    } else {
      const newPage = originalPage.cloneNode(true);
      newPage.classList.add('spp-page--mat-extra');
      newPage.dataset.page = originalPage.dataset.page;

      // Скрываем блок «Смета материалов» + «ПЕРЕЧЕНЬ ПОЗИЦИЙ»
      _hideSmrPageHeader(newPage);

      const extraEmpty = newPage.querySelector('[id*="MatEmpty"]');
      if (extraEmpty) extraEmpty.style.display = 'none';

      const extraContent = newPage.querySelector('[id*="MatContent"]');
      if (extraContent) {
        extraContent.style.display = '';
        extraContent.innerHTML = html;
      }

      const ftLogo = newPage.querySelector('[id*="MatFtLogoImg"]');
      const ftC    = newPage.querySelector('[id*="MatFtC"]');
      const ftN    = newPage.querySelector('[id*="MatFtN"]');
      _fillFooterEl(ftLogo, ftC, ftN, company);

      lastInsertedPage.after(newPage);
      lastInsertedPage = newPage;
    }
  });
}

// ─────────────────────────────────────────────────────────────────
// ЛИСТ 7 — График платежей
// ─────────────────────────────────────────────────────────────────

function fillPayments(company) {
  const tbody = el('prevPayBody2');
  const tfoot = el('prevPayFoot2');
  if (!tbody) return;

  const stages = getStagesWithTotals();
  const smrT   = sumRows(appState.smrRows);

  // Доля аванса — 30% по умолчанию
  const ADVANCE_PCT = 30;

  let grandSmr = 0, grandAdv = 0, grandPay = 0;

  tbody.innerHTML = stages.map((stage, i) => {
    const cost    = stage.smrTotal;
    if (!cost) return '';
    grandSmr += cost;
    const adv = Math.round(cost * ADVANCE_PCT / 100);
    const pay = cost - adv;
    grandAdv += adv;
    grandPay += pay;
    return `<tr style="border-bottom:1px solid #f0f0f0">
      <td style="padding:7px 0;font-size:12px;color:#bbb">${String(i + 1).padStart(2, '0')}</td>
      <td style="padding:7px 8px;font-size:12px;color:#333">${stage.name}</td>
      <td style="padding:7px 8px;font-size:12px;text-align:right;color:#333">${cost.toLocaleString('ru-RU', { maximumFractionDigits: 0 })}</td>
      <td style="padding:7px 8px;font-size:12px;text-align:center;color:#888">${ADVANCE_PCT}%</td>
      <td style="padding:7px 8px;font-size:12px;text-align:right;color:#333">${adv.toLocaleString('ru-RU', { maximumFractionDigits: 0 })}</td>
      <td style="padding:7px 8px;font-size:12px;text-align:right;color:#333">${pay.toLocaleString('ru-RU', { maximumFractionDigits: 0 })}</td>
    </tr>`;
  }).join('');

  if (tfoot) {
    tfoot.innerHTML = `<tr style="border-top:2px solid #1c1c1c">
      <td colspan="2" style="padding:8px 0;font-size:12px;font-weight:600;color:#1c1c1c">итого:</td>
      <td style="padding:8px 8px;font-size:12px;font-weight:600;text-align:right;color:#1c1c1c">${grandSmr.toLocaleString('ru-RU', { maximumFractionDigits: 0 })}</td>
      <td style="padding:8px 8px;font-size:11px;text-align:center;color:#888">${ADVANCE_PCT}%</td>
      <td style="padding:8px 8px;font-size:12px;font-weight:600;text-align:right;color:#1c1c1c">${grandAdv.toLocaleString('ru-RU', { maximumFractionDigits: 0 })}</td>
      <td style="padding:8px 8px;font-size:12px;font-weight:600;text-align:right;color:#1c1c1c">${grandPay.toLocaleString('ru-RU', { maximumFractionDigits: 0 })}</td>
    </tr>`;
  }

  const ownerEl = el('prevPayOwner2');
  if (ownerEl) ownerEl.textContent = company.ownerName || '';
}

// ─────────────────────────────────────────────────────────────────
// ЛИСТ 8 — Что не входит + Контакты
// ─────────────────────────────────────────────────────────────────

const EXCLUDE_ITEMS = [
  'Дизайн-проект и авторский надзор',
  'Мебель и предметы интерьера',
  'Бытовая техника',
  'Осветительные приборы (люстры, бра и т.п.)',
  'Текстиль (шторы, ковры и т.п.)',
  'Уличные работы и остекление балкона',
  'Работы смежных подрядчиков (натяжные потолки, кондиционирование, кухня)',
  'Погрузо-разгрузочные работы и подъём материалов',
  'Дополнительные работы, выявленные после демонтажа',
  'Услуги управляющей компании',
];

function fillContacts(company) {
  // Логотип/буква на тёмном фоне
  const ctLogo   = el('prevCtLogoImg2');
  const ctCircle = el('prevCtCircle2');
  const ctName   = el('prevCtName2');
  const ctSlogan = el('prevCtSlogan2');

  if (company.logoBase64) {
    if (ctLogo)   { ctLogo.src = company.logoBase64; ctLogo.style.display = ''; }
    if (ctCircle) ctCircle.style.display = 'none';
  } else {
    if (ctLogo)   ctLogo.style.display = 'none';
    if (ctCircle) { ctCircle.style.display = ''; ctCircle.textContent = company.letter; }
  }
  if (ctName)   ctName.textContent   = company.name;
  if (ctSlogan) ctSlogan.textContent = company.slogan;

  const siteEl = el('prevCtSite2');
  if (siteEl) siteEl.textContent = company.site || '';

  // Список «что не входит»
  const listEl = el('prevExcludeList2');
  if (listEl) {
    listEl.innerHTML = EXCLUDE_ITEMS.map(item =>
      `<li class="kp-exclude-item">${item}</li>`
    ).join('');
  }

  // Контакты
  const contactsEl = el('prevCtContacts2');
  if (contactsEl) {
    const rows = [];
    if (company.ownerName) rows.push({ icon: '👤', text: 'Руководитель проекта<br><strong style="color:#fff;font-size:13px">' + company.ownerName + '</strong>' });
    if (company.phone)     rows.push({ icon: '📞', text: company.phone });
    if (company.email)     rows.push({ icon: '✉️',  text: company.email });
    if (company.site)      rows.push({ icon: '🌐', text: company.site });

    contactsEl.innerHTML = rows.map(r =>
      `<div class="kp-contact-row">
        <span style="font-size:14px">${r.icon}</span>
        <span>${r.text}</span>
      </div>`
    ).join('');
  }
}

// ─────────────────────────────────────────────────────────────────
// Футер (логотип/буква) — общий хелпер
// ─────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────
// Хелперы скрытия заголовков на клонированных страницах
// ─────────────────────────────────────────────────────────────────

// Скрывает «ПЕРЕЧЕНЬ ПОЗИЦИЙ» (subtitle) внутри переданного контейнера
function _hideSubtitle(container) {
  if (!container) return;
  // Пробуем по классам
  const byClass = container.querySelectorAll(
    '.kp-smr-subtitle, .kp-page-subtitle, .kp-subtitle, [class*="subtitle"]'
  );
  byClass.forEach(n => { n.style.display = 'none'; });

  // Фолбэк: ищем любой элемент с текстом «ПЕРЕЧЕНЬ ПОЗИЦИЙ»
  if (!byClass.length) {
    container.querySelectorAll('*').forEach(n => {
      if (n.children.length === 0 && n.textContent.trim().toUpperCase() === 'ПЕРЕЧЕНЬ ПОЗИЦИЙ') {
        n.style.display = 'none';
      }
    });
  }
}

// Скрывает весь блок-заголовок страницы («Смета СМР / материалов» + subtitle)
// на клонированных дополнительных листах
function _hideSmrPageHeader(pageEl) {
  if (!pageEl) return;

  // Пробуем по распространённым классам
  const headerSelectors = [
    '.kp-smr-header',
    '.kp-mat-header',
    '.kp-page-header',
    '.kp-section-header',
    '.spp-page-header',
    '.kp-title-block',
    '[class*="smr-header"]',
    '[class*="mat-header"]',
    '[class*="page-header"]',
    '[class*="title-block"]',
    '[class*="kp-header"]',
  ];
  const found = pageEl.querySelectorAll(headerSelectors.join(', '));
  found.forEach(n => { n.style.display = 'none'; });

  // Фолбэк по тексту: скрываем первый блок, содержащий заголовок сметы
  if (!found.length) {
    const allBlocks = pageEl.querySelectorAll('div, section, header, article');
    for (const block of allBlocks) {
      if (
        block.children.length < 6 &&
        (
          block.textContent.includes('Смета строительно-монтажных работ') ||
          block.textContent.includes('Смета материалов')
        )
      ) {
        block.style.display = 'none';
        break;
      }
    }
  }

  // В любом случае убираем subtitle
  _hideSubtitle(pageEl);
}

// Версия для клонированных страниц (элементы уже найдены, не по id)
function _fillFooterEl(logoImg, circle, nameEl, company) {
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
// ГЛАВНАЯ ФУНКЦИЯ
// ─────────────────────────────────────────────────────────────────

export function liveUpdateKP() {
  if (!el('prevCover2') && !el('prevObject2')) return;

  const company = getCompany();
  const address = getAddress();
  const images  = generateImages();

  fillCover(company);
  fillObject(company, address, images);
  fillBlueprint(company, images);
  fillRoadmap();
  fillSmrPage(company);
  fillMatPage(company);
  fillPayments(company);
  fillContacts(company);
}

// Экспорт в window
if (typeof window !== 'undefined') {
  window._kpPreview = {
    liveUpdateKP,
    generateRoadmapText,
  };
}
