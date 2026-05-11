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
  const logoWrap = el('prevLogoWrap2');

  if (nameEl)   nameEl.textContent   = company.name;
  if (sloganEl) sloganEl.textContent = company.slogan;

  if (company.logoBase64) {
    if (logoImg) {
      logoImg.src = company.logoBase64;
      logoImg.style.display = '';
      // Применяем сохранённый размер из профиля или appState
      const w = appState.coverLogoWidth;
const h = appState.coverLogoHeight;
if (w) logoImg.style.maxWidth  = w + 'px';
if (h) logoImg.style.maxHeight = h + 'px';
// Если размеры не заданы – оставляем без ограничений
    }
    if (logoWrap) logoWrap.style.display = '';
    if (circle)   circle.style.display = 'none';

    // Включаем ресайз для обложки
    initCoverLogoResize(logoImg, logoWrap);
  } else {
    if (logoImg)  logoImg.style.display = 'none';
    if (logoWrap) logoWrap.style.display = 'none';
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

function initCoverLogoResize(imgEl, wrapEl) {
  // single initialization guard
  if (wrapEl.dataset.resizerInit === '1') return;
  wrapEl.dataset.resizerInit = '1';

  const resizer = document.getElementById('prevLogoResizer2');
  if (!imgEl || !resizer) return;

  // Сбрасываем старые слушатели клонированием
  const freshResizer = resizer.cloneNode(true);
  resizer.parentNode.replaceChild(freshResizer, resizer);

  let startX, startY, startWidth, startHeight;

  wrapEl.addEventListener('mouseenter', () => { freshResizer.style.display = ''; });
  wrapEl.addEventListener('mouseleave', () => { freshResizer.style.display = 'none'; });

  freshResizer.addEventListener('mousedown', (e) => {
    e.preventDefault();
    startX      = e.clientX;
    startY      = e.clientY;
    startWidth  = imgEl.offsetWidth;
    startHeight = imgEl.offsetHeight;

    document.body.style.cursor     = 'nwse-resize';
    document.body.style.userSelect = 'none';

    function onMove(ev) {
      const newW = Math.max(20, startWidth  + ev.clientX - startX);
      const newH = Math.max(20, startHeight + ev.clientY - startY);
      imgEl.style.maxWidth  = newW + 'px';
      imgEl.style.maxHeight = newH + 'px';
    }

    function onUp() {
      document.body.style.cursor     = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);

      // Сохраняем в appState и профиль
      appState.coverLogoWidth  = imgEl.offsetWidth;
      appState.coverLogoHeight = imgEl.offsetHeight;
      saveLogoSizesToProfile();
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  });
}

// ─────────────────────────────────────────────────────────────────
// ЛИСТ 2 — Объект
// ─────────────────────────────────────────────────────────────────

function fillObject(company, address, images) {
  // Заголовок и адрес
  const titleEl = el('prevObjTitle2');
  const addrEl  = el('prevObjAddress2');
  if (titleEl) titleEl.textContent = 'Информация по объекту';
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

  // Редактируемые тексты приветствия
  const greetingEl = el('prevObjGreeting2');
  const intro1El   = el('prevObjIntro2');
  const intro2El   = el('prevObjIntro2b');

  if (greetingEl) {
    greetingEl.textContent = appState.kpGreeting || 'Уважаемый клиент!';
    makeEditable(greetingEl, 'kpGreeting', false);
  }
  if (intro1El) {
    intro1El.innerHTML = appState.kpIntro1 ||
      'На основании дизайн-проекта и проведённого осмотра подготовлена проектно-сметная документация.';
    makeEditable(intro1El, 'kpIntro1', true);
  }
  if (intro2El) {
    intro2El.innerHTML = appState.kpIntro2 ||
      'Ниже представлены состав работ, сроки, стоимость и график реализации проекта.';
    makeEditable(intro2El, 'kpIntro2', true);
  }
}

// Вспомогательная функция — делает элемент редактируемым и сохраняет в appState
function makeEditable(domEl, stateKey, useHtml = false) {
  if (domEl.dataset.editableInited === 'true') return; // не вешать дважды
  domEl.dataset.editableInited = 'true';
  domEl.setAttribute('contenteditable', 'true');
  domEl.style.outline = 'none';
  domEl.style.cursor  = 'text';
  domEl.addEventListener('input', () => {
    appState[stateKey] = useHtml ? domEl.innerHTML : domEl.textContent;
  });
  domEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !useHtml) { e.preventDefault(); } // plain text — без переноса
  });
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
    const borderColor = stage.color || '#888';
    return `<div class="kp-roadmap-item" data-color="${borderColor}">
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

// Шапка таблицы — выводится на каждой странице
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

// ── Пагинация: динамическое измерение высот внутри .spp-a4 ──────
//
// Probe-div создаётся ВНУТРИ реальной страницы .spp-a4, поэтому
// наследует font-size !important, transform scale и все CSS родителя.
// Это решает исходную проблему _paginateByDOM, где probe был в document.body
// и не получал правильный контекст стилей.
//
// Правила пагинации:
// 1. Заголовок этапа + минимум 1 строка — атомарный блок.
// 2. Если этап разрывается — на новом листе плашка «продолжение».
// 3. Потерь строк нет — каждая строка либо здесь, либо на следующем листе.

// ── Измерение реальных высот внутри страницы ─────────────────────
// pageEl — элемент .spp-a4 или .spp-page (родитель контента).
// Возвращает объект с реальными px-высотами всех элементов пагинации.
function _measurePaginationHeights(pageEl) {
  // Создаём скрытый probe внутри pageEl — он наследует все его стили
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;top:0;left:0;right:0;z-index:-1;';
  pageEl.appendChild(probe);

  function measure(html) {
    probe.innerHTML = html;
    // offsetHeight учитывает padding но не margin — для margin используем getBoundingClientRect
    const el = probe.firstElementChild;
    if (!el) return 0;
    const style = window.getComputedStyle(el);
    const marginTop    = parseFloat(style.marginTop)    || 0;
    const marginBottom = parseFloat(style.marginBottom) || 0;
    return el.offsetHeight + marginTop + marginBottom;
  }

  // Измеряем одну строку: рендерим таблицу с 2 строками и с 1, берём разницу.
  // Это исключает влияние margin-bottom самой таблицы и border-collapse.
  function measureRow(tag, cells2, cells1) {
    const h2 = measure(`<table class="kp-smr-table" style="width:100%"><${tag}>${cells2}</${tag}></table>`);
    const h1 = measure(`<table class="kp-smr-table" style="width:100%"><${tag}>${cells1}</${tag}></table>`);
    return Math.max(h2 - h1, 1);
  }

  const _tdRow = (n) => `<tr><td>${n}</td><td>Тестовая строка работы</td><td>шт</td><td>1</td><td>1 000</td><td>1 000</td></tr>`;
  const _thRow = `<tr><th>№</th><th>Наименование</th><th>Ед.</th><th>Кол-во</th><th>Цена, ₽</th><th>Сумма, ₽</th></tr>`;

  const ROW_H   = measureRow('tbody', _tdRow(1) + _tdRow(2), _tdRow(1));
  const THEAD_H = measureRow('thead', _thRow + '<tr><td colspan="6"></td></tr>', _thRow);

  // Высота заголовка этапа (без итога — итог теперь в футере)
  const STAGE_TITLE_H = measure(`<div class="kp-smr-stage-title">
    <span>Тестовый этап</span>
  </div>`);

  // Высота футера этапа «Итого по разделу»
  const STAGE_FOOTER_H = measure(`<div class="kp-smr-stage-footer">
    <span style="font-size:11px;color:#888;font-weight:400;font-style:italic">Итого по разделу: 0 ₽</span>
  </div>`);

  // Высота плашки «продолжение»
  const CONT_LABEL_H = measure(`<div class="kp-smr-stage-title kp-smr-stage-continuation">
    <span style="color:#aaa;font-style:italic">продолжение: Тестовый этап</span>
  </div>`);

  // Рабочая высота страницы — clientHeight враппера контента МИНУС его padding.
  // clientHeight включает padding (он внутри border-box), но контент рендерится
  // в padding-area, поэтому нужно вычесть paddingTop + paddingBottom.
  const wrapEl = pageEl.querySelector('[id*="SmrTableWrap"], [id*="MatTableWrap"], [id*="Content"]');
  let PAGE_H = 686; // fallback: 794 - 48top - 60bottom
  if (wrapEl) {
    const cs = window.getComputedStyle(wrapEl);
    const padTop    = parseFloat(cs.paddingTop)    || 0;
    const padBottom = parseFloat(cs.paddingBottom) || 0;
    PAGE_H = wrapEl.clientHeight - padTop - padBottom;
  }

  // PAGE_H_REST — рабочая высота для доп. страниц (без заголовка раздела).
  // PAGE_H_FIRST — рабочая высота для первого листа: вычитаем заголовок раздела,
  // который занимает место и сжимает flex-контейнер (но только если он видим).
  const PAGE_H_REST  = PAGE_H;
  let   PAGE_H_FIRST = PAGE_H;
  const sectionTitle = pageEl.querySelector('.kp-section-title');
  if (sectionTitle && sectionTitle.offsetParent !== null) {
    const csTitle = window.getComputedStyle(sectionTitle);
    const titleH  = sectionTitle.offsetHeight
                  + (parseFloat(csTitle.marginTop)    || 0)
                  + (parseFloat(csTitle.marginBottom) || 0);
    PAGE_H_FIRST -= titleH;
  }

  // Измеряем margin-bottom таблицы (класс kp-smr-table задаёт margin-bottom: 14px).
  // Этот отступ добавляется браузером после </table>, но не учитывается в used
  // при закрытии таблицы — _closeTable должен его прибавлять.
  const TABLE_MARGIN_BOTTOM = (() => {
    const tbl = document.createElement('table');
    tbl.className = 'kp-smr-table';
    tbl.style.width = '100%';
    probe.innerHTML = '';
    probe.appendChild(tbl);
    const mb = parseFloat(window.getComputedStyle(tbl).marginBottom) || 0;
    probe.innerHTML = '';
    return mb;
  })();

  pageEl.removeChild(probe);

  // Защита от нуля при вызове до рендера
  return {
    PAGE_H_FIRST:       PAGE_H_FIRST       || 686,
    PAGE_H_REST:        PAGE_H_REST        || 686,
    ROW_H:              ROW_H              || 29,
    THEAD_H:            THEAD_H            || 29,
    STAGE_TITLE_H:      STAGE_TITLE_H      || 35,
    STAGE_FOOTER_H:     STAGE_FOOTER_H     || 28,
    CONT_LABEL_H:       CONT_LABEL_H       || 35,
    TABLE_MARGIN_BOTTOM: TABLE_MARGIN_BOTTOM || 14,
  };
}

function _paginateByHeight(allItems, label, counterStart, P) {
  // P — объект высот, полученный из _measurePaginationHeights()
  if (!P) throw new Error('_paginateByHeight: передай объект P из _measurePaginationHeights()');

  // used — пикселей занято на ТЕКУЩЕМ листе.
  // Инвариант: used всегда отражает реально добавленный контент.
  // Ни одно место не прибавляет высоту дважды.
  //
  // Стартовое состояние первого листа: шапка таблицы уже в curHtml → used = THEAD_H.
  // После flushPage + startNewPage: used выставляется заново внутри startNewPage.

  const pages         = [];
  let curHtml         = '';
  let curContinuation = null;
  let activeStage     = null;   // имя текущего открытого этапа
  let pageHasRows     = false;  // были ли строки <tr> на текущем листе
  let globalCounter   = counterStart || 0;
  let openTable       = false;
  let used            = 0;
  let pageCount       = 0;      // номер текущей страницы (0 = первая)

  // Рабочая высота текущей страницы: первый лист меньше (есть заголовок раздела)
  function _curPageH() {
    return pageCount === 0 ? P.PAGE_H_FIRST : P.PAGE_H_REST;
  }

  // ── Вспомогательные генераторы HTML ────────────────────────────

  function _rowHtml(r, counter) {
    return `<tr>
      <td>${counter}</td>
      <td>${r.name || ''}</td>
      <td style="text-align:center">${r.unit || ''}</td>
      <td>${r.qty != null ? r.qty : ''}</td>
      <td>${r.price ? r.price.toLocaleString('ru-RU', { maximumFractionDigits: 0 }) : ''}</td>
      <td style="font-weight:500">${r.total ? r.total.toLocaleString('ru-RU', { maximumFractionDigits: 0 }) : ''}</td>
    </tr>`;
  }

  function _stageHtml(item) {
    return `<div class="kp-smr-stage-title" style="margin-top:4px">
      <span>${item.name}</span>
    </div>`;
  }

  function _stageFooterHtml(item) {
    return `<div class="kp-smr-stage-footer" style="display:flex;justify-content:flex-end;padding:2px 0 2px 0;margin-top:-10px">
      <span style="font-size:11px;color:#888;font-weight:400">Итого по разделу: ${fmtMoney(item.total)}</span>
    </div>`;
  }

  function _contHtml(name) {
    return `<div class="kp-smr-stage-title kp-smr-stage-continuation">
      <span style="color:#aaa;font-style:italic">продолжение: ${name}</span>
    </div>`;
  }

  // ── Управление страницами ───────────────────────────────────────

  function flushPage() {
    const html = curHtml + (openTable ? '</tbody></table>' : '');
    pages.push({ html, continuationOf: curContinuation });
    curHtml         = '';
    curContinuation = null;
    openTable       = false;
    pageHasRows     = false;
    used            = 0;
    pageCount++;
  }

  // Начать новый лист.
  // asContinuation=true  → плашка «продолжение» + шапка (этап продолжается).
  // asContinuation=false → пустой лист, первый _openStage сам добавит шапку.
  function startNewPage(asContinuation) {
    if (asContinuation && activeStage) {
      curContinuation = activeStage;
      curHtml   = _contHtml(activeStage) + _smrTableHeader(label);
      used      = P.CONT_LABEL_H + P.THEAD_H;
      openTable = true;
    } else {
      curContinuation = null;
      curHtml   = '';
      used      = 0;
      openTable = false;
    }
    pageHasRows = false;
  }

  // Закрыть текущую таблицу (если открыта) без flush — перед вставкой заголовка этапа.
  // Добавляем TABLE_MARGIN_BOTTOM: браузер применяет margin-bottom таблицы как
  // отступ между ней и следующим элементом, но offsetHeight его не включает.
  // Без учёта этого отступа каждый новый этап сдвигается вниз на ~14px
  // относительно расчётного, и строки вылезают за overflow:hidden.
  function _closeTable() {
    if (openTable) {
      curHtml  += '</tbody></table>';
      openTable  = false;
      used      += P.TABLE_MARGIN_BOTTOM;   // учитываем margin-bottom таблицы
    }
  }

  // Открыть заголовок этапа + шапку таблицы на ТЕКУЩЕМ листе.
  function _openStage(item) {
    _closeTable();
    curHtml   += _stageHtml(item) + _smrTableHeader(label);
    openTable  = true;
    used      += P.STAGE_TITLE_H + P.THEAD_H;
  }

  // ── Инициализация первого листа ─────────────────────────────────
  startNewPage(false);

  // ── Главный цикл ────────────────────────────────────────────────
  for (let i = 0; i < allItems.length; i++) {
    const item = allItems[i];

    if (item.type === 'stage') {
      activeStage = item.name;

      // Сохраняем состояние перед открытием этапа.
      // Если после заголовка+шапки не влезает даже одна строка —
      // откатываем и переносим весь этап на следующий лист.
      const savedHtml      = curHtml;
      const savedUsed      = used;
      const savedOpenTable = openTable;
      _openStage(item);

      if (used + P.ROW_H > _curPageH()) {
        // Откат: восстанавливаем состояние до _openStage
        curHtml   = savedHtml;
        used      = savedUsed;
        openTable = savedOpenTable;
        // Сбрасываем текущий лист и открываем этап на новом
        _closeTable();
        flushPage();
        startNewPage(false);
        _openStage(item);
      }

    } else if (item.type === 'stage_footer') {
      // Футер этапа — «Итого по разделу» после последней строки.
      // _closeTable() добавил TABLE_MARGIN_BOTTOM в used, но футер имеет
      // margin-top:-10px и визуально перекрывает этот отступ.
      // При проверке вместимости вычитаем TABLE_MARGIN_BOTTOM чтобы
      // футер не улетал на следующую страницу когда места фактически хватает.
      _closeTable();
      const footerH   = P.STAGE_FOOTER_H || 28;
      const effectiveUsed = used - (P.TABLE_MARGIN_BOTTOM || 0);
      if (effectiveUsed + footerH > _curPageH()) {
        flushPage();
        startNewPage(false);
      }
      curHtml += _stageFooterHtml(item);
      used    += footerH;

    } else {
      // Обычная строка данных.
      if (used + P.ROW_H > _curPageH()) {
        // Строка не влезает → сбрасываем лист, новый с continuation.
        _closeTable();
        flushPage();
        startNewPage(true);   // всегда continuation: этап уже открыт
      }

      globalCounter++;
      curHtml    += _rowHtml(item.data, globalCounter);
      used       += P.ROW_H;
      pageHasRows = true;
    }
  }

  // Последняя страница
  const finalHtml = curHtml + (openTable ? '</tbody></table>' : '');
  if (finalHtml.trim()) {
    pages.push({ html: finalHtml, continuationOf: curContinuation });
  }

  return { pages, finalCounter: globalCounter };
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
    const originalPage = el('prevSmr2')?.closest('.spp-page');
    if (originalPage) {
      originalPage.parentNode.querySelectorAll('.spp-page--smr-extra').forEach(n => n.remove());
    }
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';

  // ── Собираем плоский список напрямую из smrRows ─────────────
  // Не через getStagesWithTotals() — матчинг по имени может терять строки.
  // Проходим smrRows в оригинальном порядке: isSection → заголовок, строка → данные.
  const grandTotal = dataRows.reduce((s, r) => s + (r.total || 0), 0);

  // Считаем итог каждой секции заранее
  const _secTotals = {};
  let _curSec = null;
  for (const r of (appState.smrRows || [])) {
    if (r.isSection) { _curSec = r.name?.trim(); _secTotals[_curSec] = 0; continue; }
    if (_curSec && r.name) _secTotals[_curSec] = (_secTotals[_curSec] || 0) + (r.total || 0);
  }

  const allItems = [];
  _curSec = null;
  let _pendingStage = null;  // { name, total } — текущий открытый этап
  for (const r of (appState.smrRows || [])) {
    if (r.isSection) {
      // Перед новым этапом закрываем предыдущий футером
      if (_pendingStage) {
        allItems.push({ type: 'stage_footer', name: _pendingStage.name, total: _pendingStage.total });
      }
      _curSec = r.name?.trim();
      _pendingStage = { name: _curSec, total: _secTotals[_curSec] || 0 };
      allItems.push({ type: 'stage', name: _curSec, total: _secTotals[_curSec] || 0 });
      continue;
    }
    if (r.name) allItems.push({ type: 'row', data: r });
  }
  // Закрываем последний этап
  if (_pendingStage) {
    allItems.push({ type: 'stage_footer', name: _pendingStage.name, total: _pendingStage.total });
  }

  // ── Ссылки на DOM ────────────────────────────────────────────
  const originalPage   = el('prevSmr2')?.closest('.spp-page');
  const pagesContainer = originalPage?.parentNode;
  if (!originalPage || !pagesContainer) {
    _renderSmrFlat(content, allItems, grandTotal, company, true);
    return;
  }

  // Скрываем подзаголовок на первом листе
  const smrPage = el('prevSmr2')?.closest('.spp-page');
  if (smrPage) smrPage.querySelectorAll('.kp-subtitle').forEach(n => n.style.display = 'none');

  // Удаляем ранее добавленные дополнительные страницы
  pagesContainer.querySelectorAll('.spp-page--smr-extra').forEach(n => n.remove());

  // ── Измеряем реальные высоты внутри страницы и запускаем пагинацию ─
  const _smrA4 = originalPage.querySelector('.spp-a4') || originalPage;
  const _smrP  = _measurePaginationHeights(_smrA4);
  const { pages, finalCounter } = _paginateByHeight(allItems, 'Наименование работ', 0, _smrP);

  // ── Рендерим страницы ────────────────────────────────────────
  let lastInsertedPage = originalPage;

  pages.forEach((page, pageIdx) => {
    const isFirst = pageIdx === 0;
    const isLast  = pageIdx === pages.length - 1;

    let html = page.html;

    // Итог — только на последней странице
    if (isLast) {
      html += `<div style="display:flex;justify-content:space-between;align-items:baseline;border-top:2px solid #1c1c1c;padding-top:10px;margin-top:4px">
        <span style="font-size:12px;font-weight:500;color:#888;text-transform:uppercase;letter-spacing:.5px">итого по работам</span>
        <span style="font-size:18px;font-weight:700;color:#1c1c1c">${fmtMoney(grandTotal)}</span>
      </div>`;
    }

    if (isFirst) {
      content.innerHTML = html;
      _fillFooter('prevSmrFtLogoImg2', 'prevSmrFtC2', 'prevSmrFtN2', company);
    } else {
      const newPage = originalPage.cloneNode(true);
      newPage.classList.add('spp-page--smr-extra');
      newPage.dataset.page = originalPage.dataset.page;
      newPage.querySelectorAll('.kp-section-title, .kp-subtitle').forEach(n => n.style.display = 'none');

      const extraEmpty = newPage.querySelector('[id*="SmrEmpty"]');
      if (extraEmpty) extraEmpty.style.display = 'none';

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

// ЛИСТ 6 — Смета материалов (пагинация по страницам А4)
// ─────────────────────────────────────────────────────────────────

function fillMatPage(company) {
  const content  = el('prevMatContent2');
  const emptyEl  = el('prevMatEmpty2');
  const pageEl   = el('prevMat2')?.closest('.spp-page');
  if (!content) return;

  const stages   = getStagesWithTotals();
  const dataRows = (appState.matRows || []).filter(r => !r.isSection);

  // Удаляем ранее добавленные дополнительные страницы
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

  if (!originalPage || !pagesContainer) {
    _renderMatFlat(content, allItems, grandTotal, company);
    return;
  }

  // Скрываем подзаголовок
  const matPage = el('prevMat2')?.closest('.spp-page');
  if (matPage) matPage.querySelectorAll('.kp-subtitle').forEach(n => n.style.display = 'none');

  // ── Измеряем реальные высоты внутри страницы и запускаем пагинацию ─
  const _matA4 = originalPage.querySelector('.spp-a4') || originalPage;
  const _matP  = _measurePaginationHeights(_matA4);
  const { pages } = _paginateByHeight(allItems, 'Наименование материала', 0, _matP);

  // ── Рендерим страницы ────────────────────────────────────────
  let lastInsertedPage = originalPage;

  pages.forEach((page, pageIdx) => {
    const isFirst = pageIdx === 0;
    const isLast  = pageIdx === pages.length - 1;

    let html = page.html;

    if (isLast) {
      html += `<div style="display:flex;justify-content:space-between;align-items:baseline;border-top:2px solid #1c1c1c;padding-top:10px;margin-top:4px">
        <span style="font-size:12px;font-weight:500;color:#888;text-transform:uppercase;letter-spacing:.5px">итого по материалам</span>
        <span style="font-size:18px;font-weight:700;color:#1c1c1c">${fmtMoney(grandTotal)}</span>
      </div>`;
    }

    if (isFirst) {
      content.innerHTML = html;
      _fillFooter('prevMatFtLogoImg2', 'prevMatFtC2', 'prevMatFtN2', company);
    } else {
      const newPage = originalPage.cloneNode(true);
      newPage.classList.add('spp-page--mat-extra');
      newPage.dataset.page = originalPage.dataset.page;
      newPage.querySelectorAll('.kp-section-title, .kp-subtitle').forEach(n => n.style.display = 'none');

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

// ЛИСТ 7 — График платежей
// ─────────────────────────────────────────────────────────────────

function fillPayments(company) {
  const cardsWrap = el('prevPayCards2');
  const totalWrap = el('prevPayTotal2');
  if (!cardsWrap) return;

  const payments   = appState.payments  || [];
  const stages     = appState.stages    || [];
  const defaultPct = appState.defaultAdvancePct ?? 30;

  const fmt = n => (n || 0).toLocaleString('ru-RU', { maximumFractionDigits: 0 });

  // ── Хелпер: сумма СМР по имени этапа ────────────────────────────
  function _getStageAmount(stageName) {
    let total = 0, inside = false;
    for (const r of appState.smrRows || []) {
      if (r.isSection) { inside = (r.name?.trim() === stageName); continue; }
      if (inside) total += r.total || 0;
    }
    return total;
  }

  // ── Рендер одной карточки ─────────────────────────────────────────
  function _renderCard(idx, payName, stageObjs, amount, pct, adv, pay, grandTotal) {
    const remPct   = 100 - pct;
    const sharePct = grandTotal > 0 ? Math.round(amount / grandTotal * 100) : 0;

    const tagsHtml = stageObjs.map(st =>
      `<span style="
        display:inline-flex;align-items:center;gap:4px;
        border:1px solid ${st.color || '#ddd'};color:${st.color || '#888'};
        border-radius:20px;padding:2px 8px 2px 6px;
        font-size:10px;line-height:1.5;white-space:nowrap
      "><span style="width:5px;height:5px;border-radius:50%;background:${st.color || '#ccc'};flex-shrink:0"></span>${st.name}</span>`
    ).join('');

    return `<div style="
      border:1px solid #ebebeb;border-radius:6px;
      padding:11px 14px;margin-bottom:7px;
      display:flex;align-items:center;gap:12px;
    ">
      <div style="font-size:11px;font-weight:600;color:#ccc;min-width:22px;text-align:center;flex-shrink:0;letter-spacing:.3px">${String(idx).padStart(2,'0')}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:600;color:#1c1c1c;margin-bottom:5px">${payName}</div>
        <div style="display:flex;flex-wrap:wrap;gap:4px">${tagsHtml}</div>
      </div>
      <div style="text-align:right;flex-shrink:0;min-width:80px">
        <div style="font-size:10px;color:#bbb;margin-bottom:1px">${sharePct}% от проекта</div>
        <div style="font-size:14px;font-weight:700;color:#1c1c1c">${fmt(amount)} ₽</div>
      </div>
      <div style="width:1px;height:32px;background:#ebebeb;flex-shrink:0"></div>
      <div style="flex-shrink:0;min-width:128px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
          <span style="font-size:10px;color:#aaa">Аванс ${pct}%</span>
          <span style="font-size:11px;font-weight:700;color:#2d7ff9">${fmt(adv)} ₽</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:10px;color:#aaa">Остаток ${remPct}%</span>
          <span style="font-size:11px;font-weight:500;color:#555">${fmt(pay)} ₽</span>
        </div>
      </div>
    </div>`;
  }

  // ── Собираем данные платежей ──────────────────────────────────────
  let sourceData;

  if (payments.length > 0) {
    // Основной режим: из редактора платежей
    sourceData = payments.map((payment, i) => {
      const stageObjs = (payment.stageIds || [])
        .map(sid => stages.find(s => s.id === sid))
        .filter(Boolean);
      const amount = stageObjs.reduce((sum, st) => sum + _getStageAmount(st.name), 0);
      const pct    = (payment.advancePct != null && payment.advancePct >= 0 && payment.advancePct <= 100)
        ? payment.advancePct : defaultPct;
      const adv = Math.round(amount * pct / 100);
      const pay = amount - adv;
      // Нумерация с 1
      return { idx: i + 1, payName: payment.name || `Платёж ${i + 1}`, stageObjs, amount, pct, adv, pay };
    }).filter(r => r.amount > 0);
  } else {
    // Фолбэк: по этапам
    sourceData = getStagesWithTotals()
      .filter(s => s.smrTotal > 0)
      .map((s, i) => {
        const pct = defaultPct;
        const adv = Math.round(s.smrTotal * pct / 100);
        return {
          idx: i + 1,
          payName: s.name,
          stageObjs: [{ name: s.name, color: s.color }],
          amount: s.smrTotal, pct, adv, pay: s.smrTotal - adv,
        };
      });
  }

  const grandTotal = sourceData.reduce((s, r) => s + r.amount, 0);
  const grandAdv   = sourceData.reduce((s, r) => s + r.adv,    0);
  const grandPay   = sourceData.reduce((s, r) => s + r.pay,    0);

  // ── Рендер карточек ───────────────────────────────────────────────
  cardsWrap.innerHTML = sourceData
    .map(r => _renderCard(r.idx, r.payName, r.stageObjs, r.amount, r.pct, r.adv, r.pay, grandTotal))
    .join('');

  // ── Итог ──────────────────────────────────────────────────────────
  if (totalWrap) {
    totalWrap.innerHTML = `<div style="
      display:flex;justify-content:space-between;align-items:center;
      border-top:1.5px solid #1c1c1c;padding-top:10px
    ">
      <span style="font-size:11px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:.5px">Итого</span>
      <div style="display:flex;gap:28px;align-items:center">
        <div style="text-align:right">
          <div style="font-size:10px;color:#bbb;margin-bottom:1px">Аванс</div>
          <div style="font-size:13px;font-weight:700;color:#2d7ff9">${fmt(grandAdv)} ₽</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:10px;color:#bbb;margin-bottom:1px">Остаток</div>
          <div style="font-size:13px;font-weight:600;color:#555">${fmt(grandPay)} ₽</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:10px;color:#bbb;margin-bottom:1px">Всего</div>
          <div style="font-size:16px;font-weight:700;color:#1c1c1c">${fmt(grandTotal)} ₽</div>
        </div>
      </div>
    </div>`;
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
    const items = (appState.excludeItems && appState.excludeItems.length)
      ? appState.excludeItems
      : EXCLUDE_ITEMS;

    listEl.innerHTML = items.map(item =>
      `<li class="kp-exclude-item">${item}</li>`
    ).join('');

    if (listEl.dataset.editableInited !== 'true') {
      listEl.dataset.editableInited = 'true';
      listEl.setAttribute('contenteditable', 'true');
      listEl.style.outline = 'none';
      listEl.style.cursor  = 'text';
      listEl.addEventListener('input', () => {
        const liEls    = listEl.querySelectorAll('li');
        const newItems = Array.from(liEls).map(li => li.textContent.trim()).filter(Boolean);
        appState.excludeItems = newItems.length ? newItems : null; // null → дефолт
      });
    }
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
// Футер-логотип — синхронизация размера по всем листам
// ─────────────────────────────────────────────────────────────────

function applyFooterLogoSize(company) {
  const h = appState.footerLogoHeight;
  const hasLogo = !!(company && company.logoBase64);

  // все футеры на разных листах
  document.querySelectorAll('[id$="FtLogoImg2"]').forEach(img => {
    if (h != null) {
      img.style.maxHeight = h + 'px';
      img.style.maxWidth  = 'none';
    }
    img.style.display = hasLogo ? '' : 'none';
  });

  document.querySelectorAll('[id$="FootLogoWrap2"]').forEach(wrap => {
    wrap.style.display = hasLogo ? '' : 'none';
  });

  // Кружки и имена — скрываем всегда
  document.querySelectorAll('[id$="FtCircle2"]').forEach(c => {
    c.style.display = 'none';
  });
  document.querySelectorAll('[id$="FtName2"]').forEach(n => {
    n.style.display = 'none';
  });
}

function initFooterLogoResize(company) {
  const resizers = document.querySelectorAll('[id$="FootResizer2"]');
  resizers.forEach(resizer => {
    if (resizer.dataset.init === '1') return;
    resizer.dataset.init = '1';

    const wrap = resizer.parentElement; // FootLogoWrap
    const img  = wrap.querySelector('img');

    let startY, startHeight;

    wrap.addEventListener('mouseenter', () => { resizer.style.display = ''; });
    wrap.addEventListener('mouseleave', () => { resizer.style.display = 'none'; });

    resizer.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startY      = e.clientY;
      startHeight = img.offsetHeight;
      document.body.style.cursor     = 'nwse-resize';
      document.body.style.userSelect = 'none';

      function onMove(ev) {
        const newH = Math.max(10, startHeight + ev.clientY - startY);
        // Обновляем все футеры через общее состояние
        appState.footerLogoHeight = newH;
        applyFooterLogoSize(company);
      }

      function onUp() {
        document.body.style.cursor     = '';
        document.body.style.userSelect = '';
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup',   onUp);
        // Сохраняем в профиль
        saveLogoSizesToProfile();
      }

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup',   onUp);
    });
  });
}

function saveLogoSizesToProfile() {
  const profile = window._auth?._currentProfile || {};
  profile.coverLogoWidth   = appState.coverLogoWidth;
  profile.coverLogoHeight  = appState.coverLogoHeight;
  profile.footerLogoHeight = appState.footerLogoHeight;
  // Сохраняем в localStorage немедленно
  const sizes = {
    coverLogoWidth:   appState.coverLogoWidth,
    coverLogoHeight:  appState.coverLogoHeight,
    footerLogoHeight: appState.footerLogoHeight,
  };
  localStorage.setItem('remb_logo_sizes', JSON.stringify(sizes));
  // Если пользователь авторизован, отправляем на сервер
  if (window._auth?.saveProfile) {
    window._auth.saveProfile();
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

  // Восстанавливаем размеры логотипов из localStorage, если в appState они ещё не заданы
  const cachedSizes = JSON.parse(localStorage.getItem('remb_logo_sizes') || '{}');
  if (appState.coverLogoWidth == null && cachedSizes.coverLogoWidth != null) {
    appState.coverLogoWidth = cachedSizes.coverLogoWidth;
  }
  if (appState.coverLogoHeight == null && cachedSizes.coverLogoHeight != null) {
    appState.coverLogoHeight = cachedSizes.coverLogoHeight;
  }
  if (appState.footerLogoHeight == null && cachedSizes.footerLogoHeight != null) {
    appState.footerLogoHeight = cachedSizes.footerLogoHeight;
  }

  fillCover(company);
  fillObject(company, address, images);
  fillBlueprint(company, images);
  fillRoadmap();
  fillSmrPage(company);
  fillMatPage(company);
  fillPayments(company);
  fillContacts(company);

  // Синхронизируем размер логотипа в футерах и инициализируем ресайзеры
  applyFooterLogoSize(company);
  initFooterLogoResize(company);

// Экспорт в window
if (typeof window !== 'undefined') {
  window._kpPreview = {
    liveUpdateKP,
    generateRoadmapText,
  };
}
