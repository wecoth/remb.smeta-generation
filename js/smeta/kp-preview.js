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
    // Собираем строки СМР внутри этапа
    let inside = false;
    const stageSmr = [];
    for (const r of smrRows) {
      if (r.isSection) {
        if (inside) break;
        inside = (r.name?.trim() === stage.name);
        continue;
      }
      if (inside && r.name) stageSmr.push(r);
    }

    // Аналогично для материалов
    inside = false;
    const stageMat = [];
    for (const r of matRows) {
      if (r.isSection) {
        if (inside) break;
        inside = (r.name?.trim() === stage.name);
        continue;
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
async function generateRoadmapText() {
  const stages = getStagesWithTotals();
  if (!stages.length) return;

  const statusEl = el('prevRoadmapGenStatus');
  const btnEl    = el('btnGenerateRoadmap');
  if (statusEl) statusEl.textContent = 'Генерирую...';
  if (btnEl)    btnEl.disabled = true;

  // ── Контекст объекта ──────────────────────────────────────────
  const smrRows   = appState.smrRows   || [];
  const openings  = appState.openings  || [];
  const totalDays = appState.totalDaysOverride || appState.totalDays || 0;

  const doors   = openings.filter(o => o.type === 'door').length;
  const windows = openings.filter(o => o.type === 'window').length;
  const cleanRow = smrRows.find(r => r.name && r.name.includes('Генеральная уборка'));
  const area = cleanRow ? cleanRow.qty : null;

  const objectContext = [
    area      ? `Площадь объекта: около ${Math.round(area)} м²` : null,
    (doors || windows) ? `Дверных проёмов: ${doors}, оконных: ${windows}` : null,
    totalDays ? `Плановый срок работ: ${totalDays} рабочих дней` : null,
  ].filter(Boolean).join('. ');

  // ── Сигналы качества ─────────────────────────────────────────
  const allWorkNames = smrRows
    .filter(r => !r.isSection && r.name)
    .map(r => r.name.toLowerCase());

  const checks = [
    [n => n.includes('заусовка') && n.includes('45'),             'заусовка керамогранита под 45°'],
    [n => n.includes('эпоксидной затиркой'),                      'эпоксидная затирка швов'],
    [n => n.includes('скрытого монтажа'),                         'двери скрытого монтажа'],
    [n => n.includes('стеклохолст'),                              'армирование стен стеклохолстом под покраску'],
    [n => n.includes('наливной пол'),                             'наливной пол под финишное покрытие'],
    [n => n.includes('сшитый полиэтилен'),                        'водопровод из сшитого полиэтилена с гидроиспытанием'],
    [n => n.includes('узла ввода') || n.includes('протечек'),     'узел ввода с защитой от протечек'],
    [n => n.includes('теплого пола') || n.includes('теплый пол'), 'электрический тёплый пол'],
    [n => n.includes('обмазочной гидроизоляции'),                 'двухслойная обмазочная гидроизоляция'],
    [n => n.includes('перегородок из газоблока'),                 'перегородки из газоблока с перевязкой швов'],
  ];
  const qualitySignals = checks
    .filter(([fn]) => allWorkNames.some(fn))
    .map(([, label]) => label)
    .join(', ');

  // ── Этапы с работами из сметы ────────────────────────────────
  const stagesContext = stages
    .filter(s => s.smrRows.length > 0)
    .map((s, i) => {
      const works = s.smrRows
        .filter(r => {
          const n = (r.name || '').toLowerCase();
          return !n.includes('вывоз') && !n.includes('мусор');
        })
        .map(r => `  - ${r.name}${r.qty ? ' (' + r.qty + ' ' + (r.unit || '') + ')' : ''}`)
        .join('\n');
      return `${i + 1}. ${s.name}:\n${works}`;
    })
    .join('\n\n');

  // ── Промт ────────────────────────────────────────────────────
  const prompt = `Ты — прораб, который объясняет заказчику-неспециалисту что и зачем будет происходить у него в квартире. Заказчик не разбирается в ремонте и не знает строительных терминов. Твоя задача — провести его по всему ходу работ так, чтобы он понял логику этапов и почувствовал что мы знаем что делаем. Без рекламы, без пафоса, спокойно и по-человечески.

ИСХОДНЫЕ ДАННЫЕ ОБЪЕКТА

${objectContext || 'данные не указаны'}

ЭТАПЫ РАБОТ С КОНКРЕТНЫМИ ПОЗИЦИЯМИ ИЗ СМЕТЫ

${stagesContext}

КЛЮЧЕВЫЕ ТЕХНИЧЕСКИЕ РЕШЕНИЯ ПРОЕКТА

${qualitySignals || 'стандартный ремонт под чистовую отделку'}

ГЛАВНЫЙ ПРИНЦИП

Текст пишется ДЛЯ КЛИЕНТА, а не О РАБОТАХ. Это не пересказ сметы прозой. Каждое предложение должно отвечать на один из вопросов: что мы делаем, зачем это нужно, что от этого зависит, что клиент получит в итоге. Если предложение не отвечает ни на один из этих вопросов — выкини его.

ФОРМАТ ВЫВОДА

4-5 ёмких абзацев свободной прозой. Каждый абзац 3-5 предложений. Без заголовков, без меток типа "Подготовка квартиры:" или "Этап 1:", без буллетов, без списков, без JSON. Текст начинается сразу с первого предложения по существу — без разогрева. Между абзацами — пустая строка.

СТРУКТУРА И ПЕРЕХОДЫ

Абзацы идут в логическом порядке выполнения работ и охватывают ВСЕ этапы из сметы — ничего не пропускай. Если этапов больше чем абзацев, объединяй родственные. Переходы между абзацами — через действие или причину, а не через шаблон. Не начинай каждый абзац с "Далее", "После этого", "В процессе" — варьируй: "Когда черновое готово...", "Пока стены сохнут...", "Параллельно идёт...", "К моменту чистовой...".

ПЕРВОЕ ПРЕДЛОЖЕНИЕ

Текст начинается свободно, с действия и его смысла. Никаких "Перед началом работ выполняется подготовка объекта". Лучше так: "До того как начнётся шум и пыль, защищаем то, что должно остаться целым — окна, входную дверь, существующее покрытие — и подводим временный свет и воду, без которых дальше никак."

ЯЗЫК

Технические термины — только если рядом есть пояснение в скобках или замена бытовым словом. "Штробление" → "прорезаем в стенах канавки под провода". "Маячковый профиль" → "металлические направляющие, по которым ровняется штукатурка". "Инсталляция" → "скрытая рама в стене, на которую подвешивается унитаз". "Стяжка" → "выравнивающий слой пола". Если без термина никак — оставь, но один раз в скобках поясни.

ЧТО ДОЛЖНО ЧУВСТВОВАТЬСЯ В КАЖДОМ АБЗАЦЕ

— Что именно происходит (без перечисления всех работ — 2-3 ключевые + обобщение остального)
— Зачем это нужно (какую задачу решаем, что было бы без этого)
— Что клиент получит на выходе этапа (видимый результат, ощущение)

В 1-2 абзацах добавь акцент на критичности этапа — гидроизоляция, разводка коммуникаций под штукатуркой, подготовка основания. Не лозунгом, а через причину: "если здесь схалтурить, через год потечёт к соседям", "переделать это после отделки невозможно — поэтому проверяем дважды".

ЗАПРЕТЫ

Запрещены слова: качественно, профессионально, надёжный, современный, под ключ, наша команда, наши специалисты, опытные мастера, лучшие материалы, идеальный, премиум, гарантируем, обеспечивает, осуществляется, производится, выполняется (как пустой глагол-связка).
Запрещены восклицательные знаки.
Запрещены заголовки, метки этапов, нумерация, буллеты.
Запрещены цены, сроки в днях, метражи в цифрах.
Запрещено перечислять работы списком через запятую длиннее 4 пунктов — это превращает текст в смету.
Запрещено начинать абзац с "Далее" или "После этого" больше одного раза за весь текст.

ПРИМЕР ТОНА (НЕ КОПИРУЙ ДОСЛОВНО, ТОЛЬКО ОРИЕНТИРУЙСЯ НА СТИЛЬ)

"До того как начнётся шум и пыль, защищаем то, что должно остаться целым — окна, входную дверь, существующее покрытие — и подводим временный свет и воду. На этом же этапе сносим старые перегородки и расширяем дверной проём, освобождая место под новую планировку. К концу первого этапа квартира — пустая бетонная коробка, готовая принять новую геометрию.

Дальше собираем новые перегородки из газоблока с перевязкой швов — это даёт стене жёсткость и защищает от трещин по углам в будущем. Стены грунтуем и выставляем металлические маячки, по которым потом ровняется штукатурка. Этот этап определяет геометрию квартиры на всю жизнь ремонта: если стены ушли по уровню, дальше криво ляжет и плитка, и обои, и плинтус — поэтому здесь не торопимся."

Верни только готовый текст обзора. Ничего больше — ни вступлений, ни комментариев, ни заголовков.`;

  // ── Запрос к GAS-прокси ──────────────────────────────────────
  try {
    const res = await fetch(GAS_PROXY_URL, {
      method: 'POST',
      redirect: 'follow',
      body: JSON.stringify({ prompt })
    });

    const text = await res.text();
    if (!text || text.startsWith('<')) throw new Error('Неверный ответ от прокси');

    _roadmapNarrative = text.trim();
    fillRoadmap();

    if (statusEl) statusEl.textContent = '✓ Готово';
    setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 3000);

  } catch (e) {
    console.error('Roadmap gen error:', e);
    if (statusEl) statusEl.textContent = '✗ Ошибка: ' + e.message;
  }

  if (btnEl) btnEl.disabled = false;
}

// ─────────────────────────────────────────────────────────────────
// ЛИСТ 5 — Смета работ (по этапам, новый дизайн)
// ─────────────────────────────────────────────────────────────────

function fillSmrPage(company) {
  const content  = el('prevSmrContent2');
  const emptyEl  = el('prevSmrEmpty2');
  if (!content) return;

  const stages   = getStagesWithTotals();
  const dataRows = (appState.smrRows || []).filter(r => !r.isSection);

  if (!dataRows.length) {
    if (emptyEl)  emptyEl.style.display = '';
    content.innerHTML = '';
    _fillFooter('prevSmrFtLogoImg2', 'prevSmrFtC2', 'prevSmrFtN2', company);
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';

  let html = '';
  let grandTotal = 0;
  let counter = 0;

  if (stages.length) {
    // Группировка по этапам
    stages.forEach(stage => {
      if (!stage.smrRows.length) return;
      grandTotal += stage.smrTotal;

      html += `<div class="kp-smr-stage-title">
        <span>${stage.name}</span>
        <span style="font-size:11px;color:#888;font-weight:400">Итого по разделу: ${fmtMoney(stage.smrTotal)}</span>
      </div>`;

      html += `<table class="kp-smr-table">
        <thead><tr>
          <th style="width:20px">№</th>
          <th>Наименование работ</th>
          <th style="width:52px">Ед.</th>
          <th style="width:52px">Кол-во</th>
          <th style="width:80px">Цена, ₽</th>
          <th style="width:80px">Сумма, ₽</th>
        </tr></thead>
        <tbody>`;

      stage.smrRows.forEach(r => {
        counter++;
        html += `<tr>
          <td>${counter}</td>
          <td>${r.name || ''}</td>
          <td style="text-align:center">${r.unit || ''}</td>
          <td>${r.qty != null ? r.qty : ''}</td>
          <td>${r.price ? r.price.toLocaleString('ru-RU', { maximumFractionDigits: 0 }) : ''}</td>
          <td style="font-weight:500">${r.total ? r.total.toLocaleString('ru-RU', { maximumFractionDigits: 0 }) : ''}</td>
        </tr>`;
      });

      html += `</tbody></table>`;
    });
  } else {
    // Плоский список без этапов
    html += `<table class="kp-smr-table">
      <thead><tr>
        <th style="width:20px">№</th>
        <th>Наименование работ</th>
        <th style="width:52px">Ед.</th>
        <th style="width:52px">Кол-во</th>
        <th style="width:80px">Цена, ₽</th>
        <th style="width:80px">Сумма, ₽</th>
      </tr></thead>
      <tbody>`;
    dataRows.forEach(r => {
      counter++;
      grandTotal += r.total || 0;
      html += `<tr>
        <td>${counter}</td>
        <td>${r.name || ''}</td>
        <td style="text-align:center">${r.unit || ''}</td>
        <td>${r.qty != null ? r.qty : ''}</td>
        <td>${r.price ? r.price.toLocaleString('ru-RU', { maximumFractionDigits: 0 }) : ''}</td>
        <td style="font-weight:500">${r.total ? r.total.toLocaleString('ru-RU', { maximumFractionDigits: 0 }) : ''}</td>
      </tr>`;
    });
    html += `</tbody></table>`;
  }

  // Итог
  html += `<div style="display:flex;justify-content:space-between;align-items:baseline;border-top:2px solid #1c1c1c;padding-top:10px;margin-top:4px">
    <span style="font-size:12px;font-weight:500;color:#888;text-transform:uppercase;letter-spacing:.5px">итого по работам</span>
    <span style="font-size:18px;font-weight:700;color:#1c1c1c">${fmtMoney(grandTotal)}</span>
  </div>`;

  content.innerHTML = html;
  _fillFooter('prevSmrFtLogoImg2', 'prevSmrFtC2', 'prevSmrFtN2', company);
}

// ─────────────────────────────────────────────────────────────────
// ЛИСТ 6 — Смета материалов (по этапам, новый дизайн)
// ─────────────────────────────────────────────────────────────────

function fillMatPage(company) {
  const content  = el('prevMatContent2');
  const emptyEl  = el('prevMatEmpty2');
  const pageEl   = el('prevMat2')?.closest('.spp-page');
  if (!content) return;

  const stages   = getStagesWithTotals();
  const dataRows = (appState.matRows || []).filter(r => !r.isSection);

  // Если материалов нет — скрываем весь лист из PDF
  if (!dataRows.length) {
    if (emptyEl)  emptyEl.style.display = '';
    content.innerHTML = '';
    if (pageEl) pageEl.dataset.matEmpty = 'true';
    _fillFooter('prevMatFtLogoImg2', 'prevMatFtC2', 'prevMatFtN2', company);
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';
  if (pageEl)  delete pageEl.dataset.matEmpty;

  let html = '';
  let grandTotal = 0;
  let counter = 0;

  if (stages.length) {
    stages.forEach(stage => {
      if (!stage.matRows.length) return;
      grandTotal += stage.matTotal;

      html += `<div class="kp-smr-stage-title">
        <span>${stage.name}</span>
        <span style="font-size:11px;color:#888;font-weight:400">Итого по разделу: ${fmtMoney(stage.matTotal)}</span>
      </div>`;

      html += `<table class="kp-smr-table">
        <thead><tr>
          <th style="width:20px">№</th>
          <th>Наименование материала</th>
          <th style="width:52px">Ед.</th>
          <th style="width:52px">Кол-во</th>
          <th style="width:80px">Цена, ₽</th>
          <th style="width:80px">Сумма, ₽</th>
        </tr></thead>
        <tbody>`;

      stage.matRows.forEach(r => {
        counter++;
        html += `<tr>
          <td>${counter}</td>
          <td>${r.name || ''}</td>
          <td style="text-align:center">${r.unit || ''}</td>
          <td>${r.qty != null ? r.qty : ''}</td>
          <td>${r.price ? r.price.toLocaleString('ru-RU', { maximumFractionDigits: 0 }) : ''}</td>
          <td style="font-weight:500">${r.total ? r.total.toLocaleString('ru-RU', { maximumFractionDigits: 0 }) : ''}</td>
        </tr>`;
      });

      html += `</tbody></table>`;
    });
  } else {
    html += `<table class="kp-smr-table">
      <thead><tr>
        <th style="width:20px">№</th>
        <th>Наименование материала</th>
        <th style="width:52px">Ед.</th>
        <th style="width:52px">Кол-во</th>
        <th style="width:80px">Цена, ₽</th>
        <th style="width:80px">Сумма, ₽</th>
      </tr></thead>
      <tbody>`;
    dataRows.forEach(r => {
      counter++;
      grandTotal += r.total || 0;
      html += `<tr>
        <td>${counter}</td>
        <td>${r.name || ''}</td>
        <td style="text-align:center">${r.unit || ''}</td>
        <td>${r.qty != null ? r.qty : ''}</td>
        <td>${r.price ? r.price.toLocaleString('ru-RU', { maximumFractionDigits: 0 }) : ''}</td>
        <td style="font-weight:500">${r.total ? r.total.toLocaleString('ru-RU', { maximumFractionDigits: 0 }) : ''}</td>
      </tr>`;
    });
    html += `</tbody></table>`;
  }

  html += `<div style="display:flex;justify-content:space-between;align-items:baseline;border-top:2px solid #1c1c1c;padding-top:10px;margin-top:4px">
    <span style="font-size:12px;font-weight:500;color:#888;text-transform:uppercase;letter-spacing:.5px">итого по материалам</span>
    <span style="font-size:18px;font-weight:700;color:#1c1c1c">${fmtMoney(grandTotal)}</span>
  </div>`;

  content.innerHTML = html;
  _fillFooter('prevMatFtLogoImg2', 'prevMatFtC2', 'prevMatFtN2', company);
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
