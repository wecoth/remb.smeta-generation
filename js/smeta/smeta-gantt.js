// ─── smeta-gantt.js ────────────────────────────────────────────────
// Блок 4: График производства работ (Гантт).
// Режимы: 'stages' (по этапам) | 'works' (по работам).
//
// Изменения v7:
//  1. «По работам» → «По этапам»: daysAuto считается через реальные
//     workStart+workDays (span этапа), а не просто сумму дней.
//  2. Поле «Общий срок»: автозаполняется из работ; ручное изменение
//     становится источником истины; буфер пропорционально на этапы;
//     кнопка сброса к авто.
//  3. В режиме «По работам» рядом с именем показывается ед.изм. + объём.
//  4. UX: инпут дней вынесен влево от трека, полоса — только drag/resize.

import { appState }          from '../state.js';
import { STAGE_COLORS, esc } from './smeta-utils.js';

// Колбэки из smeta-init (избегаем кругового импорта)
let _onDurationChanged  = () => {};
let _onStageRenamed     = () => {};

// Состояние drag'а Гантт-баров (режим «по этапам»)
let _dragging = null;

// ── Инициализация ──────────────────────────────────────────────────

export function initGantt({ onDurationChanged, onStageRenamed }) {
  _onDurationChanged = onDurationChanged || (() => {});
  _onStageRenamed    = onStageRenamed    || (() => {});

  // Дефолт 14 дней — сразу пишем и в state, и в поле
  if (!appState.totalDaysSet) {
    appState.totalDays = 14;
    const sliderEl = document.getElementById('totalDaysSlider');
    if (sliderEl && !sliderEl.value) sliderEl.value = 14;
    const valEl = document.getElementById('totalDaysVal');
    if (valEl && !valEl.textContent) valEl.textContent = 14;
  }

  _initGanttDrag();
  _initTotalDaysInput();
}

// ── Поле «Общий срок» ─────────────────────────────────────────────
// totalDaysSlider — на самом деле уже <input type="number"> в HTML.
// Логика:
//   • Автозначение = worksRealEnd (конец последней работы в режиме «по работам»)
//   • Если пользователь изменил вручную → appState.totalDaysOverride = N
//   • Кнопка сброса снимает override
//   • При наличии override буфер = override - autoVal, распределяется
//     пропорционально daysAuto по этапам через daysOverride

function _initTotalDaysInput() {
  const inp = document.getElementById('totalDaysSlider');
  if (!inp) return;

  // Добавляем кнопку сброса рядом с полем (если ещё нет)
  if (!document.getElementById('ganttDaysResetBtn')) {
    const resetBtn = document.createElement('button');
    resetBtn.id = 'ganttDaysResetBtn';
    resetBtn.title = 'Сбросить к автоматическому значению';
    resetBtn.textContent = '↺';
    resetBtn.style.cssText = `
      display:none; margin-left:2px; padding:3px 8px;
      border-radius:6px; border:1px solid var(--border-1);
      background:var(--bg-card); color:var(--text-2);
      font-size:13px; cursor:pointer; line-height:1;`;
    inp.parentElement.insertBefore(resetBtn, inp.nextSibling);

    resetBtn.addEventListener('click', () => {
      appState.totalDaysOverride = null;
      // Снимаем daysOverride со всех этапов
      (appState.stages || []).forEach(s => { s.daysOverride = null; });
      _applyAutoTotalDays();
      renderGantt();
      _onDurationChanged();
      resetBtn.style.display = 'none';
      inp.style.fontWeight = '';
    });
  }

  inp.addEventListener('input', () => {
    const val = parseInt(inp.value) || 0;
    if (!val) {
      appState.totalDaysOverride = null;
      _showResetBtn(false, inp);
      return;
    }

    // Текущее авто-значение
    const autoVal = appState.worksRealEnd || _calcStagesAutoTotal();
    if (autoVal > 0 && val !== autoVal) {
      appState.totalDaysOverride = val;
      _distributeBuffer(val, autoVal);
      _showResetBtn(true, inp);
    } else {
      appState.totalDaysOverride = null;
      (appState.stages || []).forEach(s => { s.daysOverride = null; });
      _showResetBtn(false, inp);
    }

    appState.totalDays = Math.max(val, 14);
    renderGantt();
    renderPayments_safe();
    if (typeof window._calcFinish === 'function') window._calcFinish();
    _onDurationChanged();
  });
}

function _showResetBtn(show, inp) {
  const btn = document.getElementById('ganttDaysResetBtn');
  if (btn) btn.style.display = show ? '' : 'none';
  if (inp) inp.style.fontWeight = show ? '700' : '';
}

// Считает суммарный авто-срок по этапам (без override)
function _calcStagesAutoTotal() {
  if (!appState.stages?.length) return 0;
  let cursor = 0, maxEnd = 0;
  appState.stages.forEach((s, i) => {
    const dur   = s.daysAuto || 0;
    const start = (s.parallelWithPrev && i > 0) ? (appState.stages[i - 1]._startDay || 0) : cursor;
    s._startDay = start;
    if (!s.parallelWithPrev) cursor = start + dur;
    if (start + dur > maxEnd) maxEnd = start + dur;
  });
  return maxEnd;
}

// Применяет авто-значение в поле «Общий срок»
function _applyAutoTotalDays() {
  const autoVal = appState.worksRealEnd || _calcStagesAutoTotal();
  const inp = document.getElementById('totalDaysSlider');
  const valEl = document.getElementById('totalDaysVal');
  if (inp) inp.value = autoVal > 0 ? autoVal : '';
  if (valEl) valEl.textContent = autoVal > 0 ? autoVal : '';
  if (autoVal > 0) appState.totalDays = Math.max(autoVal, 14);
  if (typeof window._calcFinish === 'function') window._calcFinish();
}

// Пропорционально распределяет буфер (разницу override - auto) по этапам
function _distributeBuffer(overrideVal, autoVal) {
  if (!appState.stages?.length || !autoVal) return;
  const totalAuto = appState.stages.reduce((sum, s) => sum + (s.daysAuto || 0), 0);
  if (!totalAuto) return;

  const k = overrideVal / autoVal; // коэффициент масштабирования
  appState.stages.forEach(s => {
    const base = s.daysAuto || 0;
    if (base > 0) {
      s.daysOverride = Math.max(1, Math.round(base * k));
    }
  });
}

// ── Stage helpers ──────────────────────────────────────────────────

function _newStageId()  { return 's' + (++appState.stageCounter); }
function _nextColor()   { return STAGE_COLORS[(appState.stageCounter - 1) % STAGE_COLORS.length]; }

export function ensureStage(name) {
  const existing = appState.stages.find(s => s.name === name);
  if (existing) return existing.id;
  const id    = _newStageId();
  const color = _nextColor();
  const lastEnd = appState.stages.reduce((m, s) => Math.max(m, s.pct + s.w), 0);
  appState.stages.push({
    id, name, color,
    pct: Math.min(lastEnd, 90), w: 10,
    daysAuto: 0, daysOverride: null, parallelWithPrev: false
  });
  renderGantt();
  return id;
}

// ── Section → Gantt sync ───────────────────────────────────────────

function _cleanupOrphanWorkData() {
  const liveUids = new Set(
    appState.smrRows.filter(r => !r.isSection && r.name).map(r => String(r._uid))
  );
  if (!appState.workDays)          appState.workDays          = {};
  if (!appState.workStart)         appState.workStart         = {};
  if (!appState.workMovedManually) appState.workMovedManually = {};
  if (!appState.workParallel)      appState.workParallel      = {};

  for (const uid of Object.keys(appState.workDays)) {
    if (!liveUids.has(uid)) {
      delete appState.workDays[uid];
      delete appState.workStart[uid];
      delete appState.workMovedManually[uid];
      delete appState.workParallel[uid];
    }
  }
  for (const uid of liveUids) {
    if (!(uid in appState.workDays)) appState.workDays[uid] = 0;
  }
}

export function syncSectionsToGantt() {
  _cleanupOrphanWorkData();

  const sections = appState.smrRows.filter(r => r.isSection && r.name?.trim());
  const nameSet  = new Set(sections.map(s => s.name.trim()));

  appState.stages = appState.stages.filter(s => nameSet.has(s.name));

  sections.forEach(sec => {
    const name = sec.name.trim();
    if (!name) return;
    if (!appState.stages.find(s => s.name === name)) {
      const id    = _newStageId();
      const color = _nextColor();
      const lastEnd = appState.stages.reduce((m, s) => Math.max(m, s.pct + s.w), 0);
      appState.stages.push({
        id, name, color,
        pct: Math.min(lastEnd, 90), w: 10,
        daysAuto: 0, daysOverride: null, parallelWithPrev: false
      });
    }
  });

  renderGantt();
  _onDurationChanged();
}

// ── Days auto-calc (ИСПРАВЛЕНО) ────────────────────────────────────
// Теперь считаем span этапа через реальные workStart + workDays,
// а не просто сумму дней (это корректно учитывает параллельность
// и ручное позиционирование баров).

function _calcStageDaysAuto(stageName) {
  // Собираем все работы этапа
  let inside = false;
  const stageRows = [];
  for (const r of appState.smrRows) {
    if (r.isSection) {
      if (inside) break;
      inside = (r.name?.trim() === stageName);
      continue;
    }
    if (inside && r.name) stageRows.push(r);
  }
  if (!stageRows.length) return 0;

  // Если хотя бы одна работа позиционирована вручную — берём span
  const hasPlaced = stageRows.some(r => appState.workMovedManually?.[r._uid]);
  if (hasPlaced) {
    let minStart = Infinity, maxEnd = 0;
    stageRows.forEach(r => {
      const uid   = String(r._uid);
      const days  = appState.workDays?.[uid] || 0;
      const start = appState.workStart?.[uid] || 0;
      if (days > 0) {
        if (start < minStart) minStart = start;
        if (start + days > maxEnd) maxEnd = start + days;
      }
    });
    return maxEnd > 0 ? (maxEnd - (minStart === Infinity ? 0 : minStart)) : 0;
  }

  // Если никто не позиционирован — считаем последовательно с учётом workParallel
  let auto = 0, prevDays = 0;
  stageRows.forEach(r => {
    const uid      = String(r._uid);
    const d        = appState.workDays?.[uid] || 0;
    const parallel = appState.workParallel?.[uid] || false;
    if (parallel && prevDays > 0) {
      auto = auto - prevDays + Math.max(prevDays, d);
    } else {
      auto += d;
    }
    prevDays = d;
  });
  return auto;
}

export function recalcAllStageDaysAuto() {
  if (!appState.stages) return;
  appState.stages.forEach(s => { s.daysAuto = _calcStageDaysAuto(s.name); });
  recalcTotalDaysAuto();
}

export function recalcTotalDaysAuto() {
  if (!appState.stages?.length) return;
  let cursor = 0, maxEnd = 0;
  appState.stages.forEach((s, i) => {
    const dur   = (s.daysOverride != null ? s.daysOverride : s.daysAuto) || 0;
    const start = (s.parallelWithPrev && i > 0) ? (appState.stages[i - 1]._startDay || 0) : cursor;
    s._startDay = start;
    const end   = start + dur;
    if (!s.parallelWithPrev) cursor = end;
    if (end > maxEnd) maxEnd = end;
  });

  // Обновляем поле только если нет ручного override
  if (!appState.totalDaysOverride) {
    const worksEnd      = appState.worksRealEnd || 0;
    const effectiveEnd  = worksEnd > 0 ? worksEnd : maxEnd;
    _setTotalDaysDisplay(effectiveEnd);
    if (effectiveEnd > 0) appState.totalDays = Math.max(effectiveEnd, 14);
  }
}

function _setTotalDaysDisplay(val) {
  const inp   = document.getElementById('totalDaysSlider');
  const valEl = document.getElementById('totalDaysVal');
  if (inp)   inp.value        = val > 0 ? val : '';
  if (valEl) valEl.textContent = val > 0 ? val : '';
  if (typeof window._calcFinish === 'function') window._calcFinish();
}

// ── Переключатель режимов ─────────────────────────────────────────

export function setGanttMode(mode) {
  appState.ganttMode = mode;
  document.getElementById('ganttBtnStages')?.classList.toggle('active', mode === 'stages');
  document.getElementById('ganttBtnWorks')?.classList.toggle('active',  mode === 'works');
  const clearBtn = document.getElementById('ganttClearBtn');
  if (clearBtn) clearBtn.style.display = mode === 'works' ? '' : 'none';
  // Прячем верхнюю шкалу в режиме «По работам»
  const rulerWrap = document.getElementById('ganttRulerTopWrap');
  if (rulerWrap) {
    rulerWrap.classList.toggle('works-mode', mode === 'works');
    rulerWrap.style.display = (mode === 'works') ? 'none' : '';
  }

  if (mode === 'stages') recalcAllStageDaysAuto();
  renderGantt();
}

// ── Очистка «По работам» ──────────────────────────────────────────

export function clearWorksGantt() {
  appState.workDays          = {};
  appState.workStart         = {};
  appState.workMovedManually = {};
  appState.workParallel      = {};
  appState.worksRealEnd      = 0;
  appState.totalDaysOverride = null;
  _showResetBtn(false, document.getElementById('totalDaysSlider'));

  appState.smrRows.filter(r => !r.isSection && r.name).forEach(r => {
    appState.workDays[String(r._uid)] = 0;
  });
  recalcAllStageDaysAuto();
  renderGantt();
  _renderGanttRuler();
  _onDurationChanged();
}

// ── Главный рендер ────────────────────────────────────────────────

export function renderGantt() {
  const wrap = document.getElementById('ganttBars');
  if (!wrap) return;
  const mode = appState.ganttMode || 'stages';

  const clearBtn = document.getElementById('ganttClearBtn');
  if (clearBtn) clearBtn.style.display = mode === 'works' ? '' : 'none';

  // Верхняя шкала — только в режиме «По этапам»
  const rulerWrap = document.getElementById('ganttRulerTopWrap');
  if (rulerWrap) {
    rulerWrap.classList.toggle('works-mode', mode === 'works');
    rulerWrap.style.display = (mode === 'works') ? 'none' : '';
  }

  if (mode === 'works') {
    _renderGanttWorks(wrap);
    _renderGanttRuler();
    return;
  }
  _renderGanttStages(wrap);
  _renderGanttRuler();
}

// ── Режим «По этапам» ────────────────────────────────────────────

function _renderGanttStages(wrap) {
  if (!appState.stages.length) {
    wrap.innerHTML = '<div style="padding:20px 0;text-align:center;font-size:12px;color:#bbb">Этапы появятся когда вы добавите строки в смету и укажете им разделы</div>';
    return;
  }

  recalcAllStageDaysAuto();

  appState.stages.forEach(s => {
    s._dur = s.daysOverride != null ? s.daysOverride : (s.daysAuto || 0);
  });

  // Позиционирование
  let cursor = 0;
  appState.stages.forEach((s, i) => {
    const start = (s.parallelWithPrev && i > 0) ? (appState.stages[i - 1]._startDay || 0) : cursor;
    s._startDay = start;
    if (!s.parallelWithPrev) cursor = start + s._dur;
  });

  const stagesEnd = appState.stages.reduce((m, s) => Math.max(m, s._startDay + s._dur), 0);

  // Обновляем поле «Общий срок» только если нет ручного override
  if (!appState.totalDaysOverride) {
    _setTotalDaysDisplay(stagesEnd > 0 ? stagesEnd : (appState.worksRealEnd || 0));
  }

  const totalDays = Math.max(
    appState.totalDaysOverride || stagesEnd,
    appState.worksRealEnd || 0,
    14
  );
  appState.totalDays = totalDays;

  wrap.innerHTML = '';

  appState.stages.forEach((s, idx) => {
    const dur      = s._dur;
    const startDay = s._startDay || 0;
    const pct      = totalDays > 0 ? (startDay / totalDays * 100) : 0;
    const wPct     = totalDays > 0 && dur > 0 ? (dur / totalDays * 100) : 0;
    s.pct = pct;
    s.w   = wPct;

    const isParallel = s.parallelWithPrev && idx > 0;
    const row = document.createElement('div');
    row.className = 'gantt-row';

    const ticksHtml = dur > 0 ? Array.from({length: dur + 1}, (_, ti) =>
      `<div class="gantt-tick-mark" style="left:${(ti / dur * 100).toFixed(2)}%"></div>`
    ).join('') : '';

    // daysOverride отображается жирным если задан вручную
    const inpVal   = s.daysOverride != null ? s.daysOverride : '';
    const inpBold  = s.daysOverride != null ? 'font-weight:700;' : '';
    const autoHint = s.daysAuto || 0;

    row.innerHTML = `
      <div class="gantt-row-label">
        ${idx > 0
          ? `<button class="gantt-parallel-btn${isParallel ? ' active' : ''}" data-sidx="${idx}" title="Параллельно с предыдущим этапом" style="font-size:13px">⇉</button>`
          : '<span style="width:22px;display:inline-block"></span>'}
        <span class="gantt-stage-dot" style="background:${s.color}"></span>
        <span class="gantt-stage-name" contenteditable="true" data-idx="${idx}">${esc(s.name)}</span>
        <input type="number" min="1" max="999" class="gantt-stage-days-inp" data-sidx="${idx}"
               value="${inpVal}" placeholder="${autoHint}"
               title="Авто: ${autoHint} дн. Оставьте пустым для авторасчёта"
               style="width:42px;padding:2px 4px;border-radius:4px;border:1px solid var(--border-1);
                      font-size:11px;text-align:center;background:var(--bg-card);color:var(--text-1);
                      font-family:var(--font-mono);-moz-appearance:textfield;appearance:textfield;
                      outline:none;${inpBold}">
        <span style="font-size:10px;color:var(--text-3)">дн.</span>
      </div>
      <div class="gantt-track-wrap">
        <div class="gantt-track">
          ${wPct > 0 ? `<div class="gantt-bar" data-idx="${idx}" style="left:${pct.toFixed(2)}%;width:${wPct.toFixed(2)}%;background:${s.color}">
            <div class="gantt-ticks">${ticksHtml}</div>
            <span class="gantt-bar-label">${dur} дн.</span>
          </div>` : ''}
        </div>
      </div>`;
    wrap.appendChild(row);

    // Редактирование названия этапа
    row.querySelector('.gantt-stage-name').addEventListener('blur', () => {
      appState.stages[idx].name = row.querySelector('.gantt-stage-name').textContent.trim();
      _onStageRenamed();
    });

    // Параллельность
    row.querySelector('.gantt-parallel-btn[data-sidx]')?.addEventListener('click', () => {
      appState.stages[idx].parallelWithPrev = !appState.stages[idx].parallelWithPrev;
      renderGantt();
      _onDurationChanged();
    });

    // Ручной ввод дней этапа — перерендер только после завершения ввода
    const stageInp = row.querySelector('.gantt-stage-days-inp');
    function _commitStageInp() {
      const val = parseInt(stageInp.value) || 0;
      appState.stages[idx].daysOverride = val > 0 ? val : null;
      stageInp.style.fontWeight = val > 0 ? '700' : '';
      renderGantt();
      _renderGanttRuler();
      _onDurationChanged();
    }
    stageInp.addEventListener('input', e => {
      // Только обновляем данные, DOM не трогаем
      const val = parseInt(e.target.value) || 0;
      appState.stages[idx].daysOverride = val > 0 ? val : null;
      e.target.style.fontWeight = val > 0 ? '700' : '';
    });
    stageInp.addEventListener('blur', _commitStageInp);
    stageInp.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); stageInp.blur(); }
    });
  });
}

// ── Режим «По работам» — пиксельная шкала со скроллом ──────────
//
// Архитектура:
//   • Левая колонка (sticky): название, объём, инпут дней — НЕ скроллится
//   • Правая область (scroll): шкала + треки с барами — скроллится горизонтально
//   • PX_PER_DAY = 38px на день, шкала = CANVAS_DAYS * 38px широкая (~30 дней в видимой области)
//   • Вертикальная сетка (серые линии каждые N дней) на шкале и треках
//   • Auto-scroll при drag к правому краю видимой области
//   • Snap к целым дням (абсолютные пиксели, не проценты)

const PX_PER_DAY = 38;            // пикселей на один день (увеличено: ~30 дней в видимой области)
const CANVAS_DAYS = 365;          // полотно всегда 365 дней
const VISIBLE_DAYS_DEFAULT = 30;  // сколько дней видно по умолчанию
const RULER_H    = 28;            // высота шкалы (px)
const TRACK_ROW_H = 36;           // высота строки трека (px) — увеличена для читаемости текста

function _ganttScrollContainer() {
  return document.getElementById('ganttScrollArea');
}

function _renderGanttWorks(wrap) {
  if (!appState.workDays)  appState.workDays  = {};
  if (!appState.workStart) appState.workStart = {};

  _cleanupOrphanWorkData();

  // Группируем по разделам
  const groups = [];
  let curGroup = null;
  appState.smrRows.forEach(r => {
    if (r.isSection) {
      const stageName = r.name?.trim() || '';
      const stage     = appState.stages.find(s => s.name === stageName);
      const color     = stage ? stage.color : '#9b9b9b';
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
    appState.totalDays = Math.max(appState.totalDays || 0, VISIBLE_DAYS_DEFAULT);
    wrap.innerHTML = '<div style="padding:20px 0;text-align:center;font-size:12px;color:#bbb">Добавьте работы в смету — они появятся здесь</div>';
    return;
  }

  if (!appState.workMovedManually) appState.workMovedManually = {};

  // Авто-позиция для не перемещённых вручную
  {
    let seqCursor = 0;
    allWorkRows.forEach(r => {
      const uid = String(r._uid);
      if (appState.workMovedManually[uid]) {
        const end = (appState.workStart[uid] || 0) + (appState.workDays[uid] || 0);
        if (end > seqCursor) seqCursor = end;
      } else {
        appState.workStart[uid] = seqCursor;
        seqCursor += appState.workDays[uid] || 0;
      }
    });
  }

  // realEnd — реальный конец последнего расставленного бара
  let realEnd = 0;
  allWorkRows.forEach(r => {
    const uid = String(r._uid);
    const d   = appState.workDays[uid] || 0;
    if (d > 0) realEnd = Math.max(realEnd, (appState.workStart[uid] || 0) + d);
  });

  // totalDays для логики (конец баров + буфер), полотно всегда CANVAS_DAYS
  const totalDays = Math.max(realEnd > 0 ? realEnd + 5 : 0, VISIBLE_DAYS_DEFAULT);
  appState.totalDays    = totalDays;
  appState.worksRealEnd = realEnd;

  if (!appState.totalDaysOverride) {
    _setTotalDaysDisplay(realEnd > 0 ? realEnd : 0);
  }

  // Полная ширина полотна в пикселях — всегда 365 дней
  const canvasW = CANVAS_DAYS * PX_PER_DAY;

  // ── Строим DOM ───────────────────────────────────────────────
  wrap.innerHTML = '';
  const uidToColor = {};
  groups.forEach(g => g.rows.forEach(r => { uidToColor[String(r._uid)] = g.color; }));

  // Внешний контейнер: левая колонка + скролл-область
  const outer = document.createElement('div');
  outer.className = 'gantt-works-outer';
  outer.style.display = 'flex';
  outer.style.alignItems = 'stretch';
  outer.style.width = '100%';
  outer.style.position = 'relative';

  // ── Левая sticky-колонка ─────────────────────────────────────
  const leftCol = document.createElement('div');
  leftCol.className = 'gantt-works-left';
  leftCol.style.display = 'flex';
  leftCol.style.flexDirection = 'column';
  leftCol.style.flex = '0 0 auto';
  leftCol.style.background = 'var(--bg-card, #fff)';
  leftCol.style.zIndex = '2';
  leftCol.style.borderRight = '1px solid var(--border-1, #d8d8d8)';

  // Пустой заголовок (высота = ruler)
  const leftHeader = document.createElement('div');
  leftHeader.className = 'gantt-works-left-header';
  leftHeader.style.setProperty('height', RULER_H + 'px', 'important');
  leftHeader.style.setProperty('min-height', RULER_H + 'px', 'important');
  leftHeader.style.setProperty('max-height', RULER_H + 'px', 'important');
  leftHeader.style.setProperty('padding', '0', 'important');
  leftHeader.style.setProperty('margin',  '0', 'important');
  leftHeader.style.setProperty('box-sizing', 'border-box', 'important');
  leftHeader.style.flex         = '0 0 auto';
  leftHeader.style.borderBottom = '1px solid var(--border-1, #d8d8d8)';
  leftCol.appendChild(leftHeader);

  // ── Правая scroll-область ────────────────────────────────────
  const scrollArea = document.createElement('div');
  scrollArea.className = 'gantt-works-scroll';
  scrollArea.id = 'ganttScrollArea';
  scrollArea.style.flex          = '1 1 auto';
  scrollArea.style.overflowX     = 'auto';
  scrollArea.style.overflowY     = 'hidden';
  scrollArea.style.display       = 'flex';
  scrollArea.style.flexDirection = 'column';
  scrollArea.style.minWidth      = '0';

  // Шкала (ruler) внутри scroll
  const ruler = document.createElement('div');
  ruler.className = 'gantt-works-ruler';
  ruler.style.width    = canvasW + 'px';
  ruler.style.setProperty('height',     RULER_H + 'px', 'important');
  ruler.style.setProperty('min-height', RULER_H + 'px', 'important');
  ruler.style.setProperty('max-height', RULER_H + 'px', 'important');
  ruler.style.setProperty('padding', '0', 'important');
  ruler.style.setProperty('margin',  '0', 'important');
  ruler.style.setProperty('box-sizing', 'border-box', 'important');
  ruler.style.position = 'relative';
  ruler.style.flex     = '0 0 auto';
  ruler.style.borderBottom = '1px solid var(--border-1, #d8d8d8)';
  _buildRulerTicks(ruler, CANVAS_DAYS);
  scrollArea.appendChild(ruler);

  // ── Строки ───────────────────────────────────────────────────
  groups.forEach(g => {
    if (!g.rows.length) return;

    // Заголовок группы — слева
    const leftGroupHead = document.createElement('div');
    leftGroupHead.className = 'gantt-works-group-head gantt-works-group-head-left';
    leftGroupHead.style.setProperty('height',     TRACK_ROW_H + 'px', 'important');
    leftGroupHead.style.setProperty('min-height', TRACK_ROW_H + 'px', 'important');
    leftGroupHead.style.setProperty('max-height', TRACK_ROW_H + 'px', 'important');
    leftGroupHead.style.setProperty('padding', '0 8px', 'important');
    leftGroupHead.style.setProperty('margin',  '0', 'important');
    leftGroupHead.style.setProperty('box-sizing', 'border-box', 'important');
    leftGroupHead.style.flex         = '0 0 auto';
    leftGroupHead.style.display      = 'flex';
    leftGroupHead.style.alignItems   = 'center';
    leftGroupHead.style.gap          = '6px';
    leftGroupHead.style.background   = 'var(--bg-2, #fafafa)';
    leftGroupHead.innerHTML = `
      <span class="gantt-stage-dot" style="background:${g.color}"></span>
      <span style="font-size:11px;font-weight:600;color:var(--text-1);flex:1">${esc(g.stageName || 'Без этапа')}</span>`;
    leftCol.appendChild(leftGroupHead);

    // Заголовок группы — справа (пустой спейсер той же высоты)
    const rightGroupHead = document.createElement('div');
    rightGroupHead.className = 'gantt-works-group-head gantt-works-group-head-right';
    rightGroupHead.style.width  = canvasW + 'px';
    rightGroupHead.style.setProperty('height',     TRACK_ROW_H + 'px', 'important');
    rightGroupHead.style.setProperty('min-height', TRACK_ROW_H + 'px', 'important');
    rightGroupHead.style.setProperty('max-height', TRACK_ROW_H + 'px', 'important');
    rightGroupHead.style.setProperty('padding', '0', 'important');
    rightGroupHead.style.setProperty('margin',  '0', 'important');
    rightGroupHead.style.setProperty('box-sizing', 'border-box', 'important');
    rightGroupHead.style.flex       = '0 0 auto';
    rightGroupHead.style.background = 'var(--bg-2, #fafafa)';
    scrollArea.appendChild(rightGroupHead);

    g.rows.forEach(r => {
      const uid   = String(r._uid);
      const days  = appState.workDays[uid]  || 0;
      const start = appState.workStart[uid] || 0;

      // Объём
      const unitStr = r.unit ? esc(r.unit) : '';
      const qtyStr  = r.qty  ? esc(String(r.qty)) : '';
      const volBadge = (unitStr || qtyStr)
        ? `<span class="gantt-work-vol">${qtyStr}${qtyStr && unitStr ? '\u00a0' : ''}${unitStr}</span>`
        : '';

      // ── Левая ячейка строки ──────────────────────────────────
      const leftRow = document.createElement('div');
      leftRow.className = 'gantt-works-left-row';
      leftRow.style.setProperty('height',     TRACK_ROW_H + 'px', 'important');
      leftRow.style.setProperty('min-height', TRACK_ROW_H + 'px', 'important');
      leftRow.style.setProperty('max-height', TRACK_ROW_H + 'px', 'important');
      leftRow.style.setProperty('padding', '0 8px', 'important');
      leftRow.style.setProperty('margin',  '0', 'important');
      leftRow.style.setProperty('box-sizing', 'border-box', 'important');
      leftRow.style.flex         = '0 0 auto';
      leftRow.style.display      = 'flex';
      leftRow.style.alignItems   = 'center';
      leftRow.style.gap          = '4px';
      leftRow.style.borderBottom = '1px solid var(--border-2, #f1f1f1)';

      const labelDiv = document.createElement('div');
      labelDiv.className = 'gantt-row-label gantt-works-label-draggable';
      labelDiv.dataset.uid = uid;
      labelDiv.innerHTML = `
        <span class="gantt-work-drag-handle" title="Перетащите на шкалу">⠿</span>
        <span class="gantt-work-name" title="${esc(r.name)}">${esc(r.name)}</span>
        ${volBadge}`;

      const daysInp = document.createElement('input');
      daysInp.type = 'number'; daysInp.min = 0; daysInp.max = 999;
      daysInp.value = days > 0 ? days : '';
      daysInp.placeholder = '—';
      daysInp.dataset.uid = uid;
      daysInp.className = 'gantt-work-days-inp';
      daysInp.title = 'Количество рабочих дней';
      daysInp.style.cssText = `
        width:38px;padding:2px 4px;border-radius:4px;border:1px solid var(--border-1);
        font-size:11px;font-weight:${days > 0 ? '600' : '400'};text-align:center;
        background:var(--bg-card);color:var(--text-1);font-family:var(--font-mono);
        -moz-appearance:textfield;appearance:textfield;outline:none;flex-shrink:0;`;

      const daysLbl = document.createElement('span');
      daysLbl.textContent = 'дн.';
      daysLbl.style.cssText = 'font-size:10px;color:var(--text-3);flex-shrink:0;';

      leftRow.appendChild(labelDiv);
      leftRow.appendChild(daysInp);
      leftRow.appendChild(daysLbl);
      leftCol.appendChild(leftRow);

      // ── Правая ячейка (трек) ─────────────────────────────────
      const trackRow = document.createElement('div');
      trackRow.className = 'gantt-works-track-row';
      trackRow.style.width = canvasW + 'px';
      trackRow.style.setProperty('height',     TRACK_ROW_H + 'px', 'important');
      trackRow.style.setProperty('min-height', TRACK_ROW_H + 'px', 'important');
      trackRow.style.setProperty('max-height', TRACK_ROW_H + 'px', 'important');
      trackRow.style.setProperty('padding', '0', 'important');
      trackRow.style.setProperty('margin',  '0', 'important');
      trackRow.style.setProperty('box-sizing', 'border-box', 'important');
      trackRow.style.flex         = '0 0 auto';
      trackRow.style.position     = 'relative';
      trackRow.style.borderBottom = '1px solid var(--border-2, #f1f1f1)';

      // Вертикальная сетка на треке
      const grid = document.createElement('div');
      grid.className = 'gantt-track-grid';
      grid.style.position = 'absolute';
      grid.style.inset    = '0';
      grid.style.width    = canvasW + 'px';
      _buildTrackGrid(grid, CANVAS_DAYS);
      trackRow.appendChild(grid);

      // Трек
      const track = document.createElement('div');
      track.className = 'gantt-track';
      track.dataset.uid = uid;
      track.style.position = 'absolute';
      track.style.inset    = '0';
      track.style.width    = canvasW + 'px';

      if (days > 0) {
        const bar = document.createElement('div');
        bar.className = 'gantt-bar gantt-work-bar gantt-work-bar-placed';
        bar.dataset.uid = uid;
        const BAR_H = TRACK_ROW_H - 8; // 8px суммарного зазора сверху+снизу
        bar.style.position   = 'absolute';
        bar.style.top        = '4px';
        bar.style.height     = BAR_H + 'px';
        bar.style.left       = (start * PX_PER_DAY) + 'px';
        bar.style.width      = Math.max(days * PX_PER_DAY, 16) + 'px';
        bar.style.background = g.color;
        bar.style.cursor     = 'grab';
        bar.style.borderRadius = '4px';
        bar.style.display      = 'flex';
        bar.style.alignItems   = 'center';
        bar.style.padding      = '0 6px';
        bar.style.fontSize     = '10px';
        bar.style.color        = '#fff';
        bar.style.fontWeight   = '600';
        bar.innerHTML = `
          <span class="gantt-bar-label">${days} дн.</span>
          <div class="gantt-handle gantt-handle-r gantt-work-handle" data-uid="${uid}" data-edge="right"></div>`;
        track.appendChild(bar);
      }

      trackRow.appendChild(track);
      scrollArea.appendChild(trackRow);
    });
  });

  outer.appendChild(leftCol);
  outer.appendChild(scrollArea);
  wrap.appendChild(outer);

  // ── Инпуты дней ──────────────────────────────────────────────
  wrap.querySelectorAll('.gantt-work-days-inp').forEach(inp => {
    inp.addEventListener('mousedown', e => e.stopPropagation());
    inp.addEventListener('input', () => {
      const uid = inp.dataset.uid;
      const val = Math.max(0, parseInt(inp.value) || 0);
      appState.workDays[uid] = val;
      inp.style.fontWeight = val > 0 ? '600' : '400';
      if (!appState.workMovedManually) appState.workMovedManually = {};
      if (val > 0) appState.workMovedManually[uid] = true;
    });
    function _commitWorkInp() {
      recalcAllStageDaysAuto();
      _renderGanttWorks(wrap);
      _renderGanttRuler();
      _onDurationChanged();
    }
    inp.addEventListener('blur', _commitWorkInp);
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } });
  });

  // ── Drag с лейбла на трек ────────────────────────────────────
  wrap.querySelectorAll('.gantt-works-label-draggable').forEach(labelEl => {
    labelEl.addEventListener('mousedown', e => {
      if (e.target.tagName === 'INPUT') return;
      if (e.detail >= 2) return;
      e.preventDefault(); e.stopPropagation();
      const uid      = labelEl.dataset.uid;
      const color    = uidToColor[uid] || '#9b9b9b';
      const origDays = appState.workDays[uid] || 1;

      const ghost = document.createElement('div');
      ghost.className = 'gantt-work-ghost';
      ghost.style.cssText = `background:${color};width:${origDays * PX_PER_DAY}px;`;
      ghost.style.top  = (e.clientY - 11) + 'px';
      ghost.style.left = e.clientX + 'px';
      ghost.textContent = origDays + ' дн.';
      document.body.appendChild(ghost);
      document.body.style.cursor = 'grabbing';
      document.body.style.userSelect = 'none';

      // Подсвечиваем треки
      wrap.querySelectorAll('.gantt-track[data-uid]').forEach(t => {
        t.style.outline = '1.5px dashed var(--border-1)';
        t.style.outlineOffset = '-1px';
      });

      let autoScrollTimer = null;

      function _autoScroll(ev) {
        const sc = scrollArea;
        if (!sc) return;
        const rect = sc.getBoundingClientRect();
        const ZONE = 60;
        const SPEED = 8;
        clearInterval(autoScrollTimer);
        if (ev.clientX > rect.right - ZONE) {
          autoScrollTimer = setInterval(() => { sc.scrollLeft += SPEED; }, 16);
        } else if (ev.clientX < rect.left + ZONE) {
          autoScrollTimer = setInterval(() => { sc.scrollLeft -= SPEED; }, 16);
        }
      }

      function onMove(ev) {
        ghost.style.top  = (ev.clientY - 11) + 'px';
        ghost.style.left = ev.clientX + 'px';
        _autoScroll(ev);
        ghost.style.display = 'none';
        const el2 = document.elementFromPoint(ev.clientX, ev.clientY);
        ghost.style.display = '';
        const trk = el2 && (el2.classList.contains('gantt-track') ? el2 : el2.closest('.gantt-track[data-uid]'));
        wrap.querySelectorAll('.gantt-track[data-uid]').forEach(t => {
          t.style.outline = '1.5px dashed var(--border-1)';
        });
        if (trk && trk.dataset.uid) {
          trk.style.outline = '1.5px dashed ' + color;
        }
      }

      function onUp(ev) {
        clearInterval(autoScrollTimer);
        document.body.removeChild(ghost);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        wrap.querySelectorAll('.gantt-track[data-uid]').forEach(t => {
          t.style.outline = ''; t.style.outlineOffset = '';
        });

        // Находим трек под курсором
        ghost.style.display = 'none';
        const el2 = document.elementFromPoint(ev.clientX, ev.clientY);
        ghost.style.display = '';
        let trk = el2 && (
          el2.classList.contains('gantt-track') ? el2
          : el2.closest('.gantt-track[data-uid]')
          || el2.closest('.gantt-works-track-row')?.querySelector('.gantt-track[data-uid]')
        );
        // Запасной: по Y
        if (!trk) {
          let best = null, bestDist = Infinity;
          wrap.querySelectorAll('.gantt-track[data-uid]').forEach(t => {
            const r = t.getBoundingClientRect();
            const d = Math.abs(ev.clientY - (r.top + r.bottom) / 2);
            if (d < bestDist && d < 80) { bestDist = d; best = t; }
          });
          trk = best;
        }

        if (trk && trk.dataset.uid) {
          const trkUid = String(trk.dataset.uid);
          const rect   = trk.getBoundingClientRect();
          const sc     = scrollArea;
          // Позиция в пикселях на полотне (с учётом скролла)
          const pxOnCanvas = (ev.clientX - rect.left) + (sc ? sc.scrollLeft : 0);
          const dayPos = Math.max(0, Math.min(Math.round(pxOnCanvas / PX_PER_DAY), CANVAS_DAYS - 1));
          if (!appState.workDays[trkUid] || appState.workDays[trkUid] === 0) {
            appState.workDays[trkUid] = origDays || 1;
          }
          appState.workStart[trkUid] = dayPos;
          if (!appState.workMovedManually) appState.workMovedManually = {};
          appState.workMovedManually[trkUid] = true;
        }
        recalcAllStageDaysAuto();
        _renderGanttWorks(wrap);
        _renderGanttRuler();
        _onDurationChanged();
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      }

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  });

  // ── Обновить бар в px без перерендера ────────────────────────
  function _updateBarDOM(uid) {
    const barEl = wrap.querySelector(`.gantt-work-bar[data-uid="${uid}"]`);
    if (!barEl) return;
    const start = appState.workStart[uid] || 0;
    const days  = appState.workDays[uid]  || 1;
    barEl.style.left  = (start * PX_PER_DAY) + 'px';
    barEl.style.width = Math.max(days * PX_PER_DAY, 16) + 'px';
    const lbl = barEl.querySelector('.gantt-bar-label');
    if (lbl) lbl.textContent = days + ' дн.';
  }

  // Обновить appState.totalDays если бар ушёл вправо (полотно 365 — не меняем)
  function _updateTotalDays(barEnd) {
    if (barEnd > appState.totalDays) {
      appState.totalDays = Math.min(barEnd + 5, CANVAS_DAYS);
    }
  }

  // ── Drag бара ─────────────────────────────────────────────────
  wrap.querySelectorAll('.gantt-work-bar').forEach(bar => {
    const uid = bar.dataset.uid;
    bar.addEventListener('mousedown', e => {
      if (e.target.classList.contains('gantt-handle')) return;
      e.preventDefault(); e.stopPropagation();
      const startX    = e.clientX;
      const origStart = appState.workStart[uid] || 0;
      const origDays  = appState.workDays[uid]  || 1;
      document.body.style.cursor = 'grabbing';
      document.body.style.userSelect = 'none';

      let autoScrollTimer = null;
      function _autoScroll(ev) {
        const sc = scrollArea;
        if (!sc) return;
        const rect = sc.getBoundingClientRect();
        const ZONE = 60; const SPEED = 8;
        clearInterval(autoScrollTimer);
        if (ev.clientX > rect.right - ZONE) {
          autoScrollTimer = setInterval(() => { sc.scrollLeft += SPEED; }, 16);
        } else if (ev.clientX < rect.left + ZONE) {
          autoScrollTimer = setInterval(() => { sc.scrollLeft -= SPEED; }, 16);
        }
      }

      function onMove(ev) {
        _autoScroll(ev);
        const delta    = Math.round((ev.clientX - startX) / PX_PER_DAY);
        const newStart = Math.max(0, Math.min(origStart + delta, CANVAS_DAYS - origDays));
        appState.workStart[uid] = newStart;
        if (!appState.workMovedManually) appState.workMovedManually = {};
        appState.workMovedManually[uid] = true;
        _updateTotalDays(newStart + origDays);
        _updateBarDOM(uid);
      }
      function onUp() {
        clearInterval(autoScrollTimer);
        document.body.style.cursor = ''; document.body.style.userSelect = '';
        recalcAllStageDaysAuto();
        _fixTotalDaysAfterDrag(wrap);
        _renderGanttWorks(wrap);
        _renderGanttRuler();
        _onDurationChanged();
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  });

  // ── Resize правым handle ──────────────────────────────────────
  wrap.querySelectorAll('.gantt-work-handle[data-edge="right"]').forEach(h => {
    h.addEventListener('mousedown', e => {
      e.preventDefault(); e.stopPropagation();
      const uid    = h.dataset.uid;
      const startX = e.clientX;
      const origD  = appState.workDays[uid]  || 1;
      const origS  = appState.workStart[uid] || 0;
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';

      let autoScrollTimer = null;
      function _autoScroll(ev) {
        const sc = scrollArea;
        if (!sc) return;
        const rect = sc.getBoundingClientRect();
        const ZONE = 60; const SPEED = 8;
        clearInterval(autoScrollTimer);
        if (ev.clientX > rect.right - ZONE) {
          autoScrollTimer = setInterval(() => { sc.scrollLeft += SPEED; }, 16);
        }
      }

      function onMove(ev) {
        _autoScroll(ev);
        const delta = Math.round((ev.clientX - startX) / PX_PER_DAY);
        const newD  = Math.max(1, origD + delta);
        appState.workDays[uid] = newD;
        if (!appState.workMovedManually) appState.workMovedManually = {};
        appState.workMovedManually[uid] = true;
        _updateTotalDays(origS + newD);
        _updateBarDOM(uid);
        // Синхронизируем инпут
        const inp = wrap.querySelector(`.gantt-work-days-inp[data-uid="${uid}"]`);
        if (inp) { inp.value = newD; inp.style.fontWeight = '600'; }
      }
      function onUp() {
        clearInterval(autoScrollTimer);
        document.body.style.cursor = ''; document.body.style.userSelect = '';
        recalcAllStageDaysAuto();
        _fixTotalDaysAfterDrag(wrap);
        _renderGanttWorks(wrap);
        _renderGanttRuler();
        _onDurationChanged();
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  });

  // ── Фиксация totalDays после drag/resize ─────────────────────
  function _fixTotalDaysAfterDrag(wrapEl) {
    if (appState.totalDaysOverride) return;
    let realEnd = 0;
    Object.keys(appState.workDays).forEach(uid => {
      const d = appState.workDays[uid] || 0;
      if (d > 0) realEnd = Math.max(realEnd, (appState.workStart[uid] || 0) + d);
    });
    if (realEnd === 0) return;
    appState.totalDays    = Math.min(Math.max(realEnd + 5, VISIBLE_DAYS_DEFAULT), CANVAS_DAYS);
    appState.worksRealEnd = realEnd;
    _setTotalDaysDisplay(realEnd);
  }
} // end _renderGanttWorks

// ── Строим тики шкалы ─────────────────────────────────────────
// В режиме «По работам» (works):
//   • Тонкая вертикальная линия на каждом дне (d * PX_PER_DAY)
//   • Цифра по ЦЕНТРУ дневной ячейки (между двумя соседними тиками)
//   • Нумерация начинается с 1 (день 1 = первая ячейка от 0 до PX_PER_DAY)
// В режиме «По этапам» — крупный шаг с цифрами + промежуточные тонкие тики.
function _buildRulerTicks(rulerEl, totalDays) {
  rulerEl.innerHTML = '';
  rulerEl.style.height   = RULER_H + 'px';
  rulerEl.style.position = 'relative';

  const isWorksMode = appState.ganttMode === 'works';

  if (isWorksMode) {
    // Тонкие тики — на каждом дне (включая 0 и totalDays)
    for (let d = 0; d <= totalDays; d++) {
      const line = document.createElement('div');
      line.className = 'gantt-ruler-tick gantt-ruler-tick-minor';
      line.style.position   = 'absolute';
      line.style.top        = '0';
      line.style.bottom     = '0';
      line.style.left       = (d * PX_PER_DAY) + 'px';
      line.style.width      = '1px';
      line.style.background = 'var(--border-2, #f0f0f0)';
      line.style.pointerEvents = 'none';
      rulerEl.appendChild(line);
    }
    // Цифры по центру каждой дневной ячейки (1, 2, 3, ...)
    for (let d = 0; d < totalDays; d++) {
      const lbl = document.createElement('span');
      lbl.className = 'gantt-ruler-tick-label';
      lbl.textContent = (d + 1);
      lbl.style.position    = 'absolute';
      lbl.style.left        = (d * PX_PER_DAY) + 'px';
      lbl.style.width       = PX_PER_DAY + 'px';
      lbl.style.top         = '0';
      lbl.style.height      = RULER_H + 'px';
      lbl.style.display     = 'flex';
      lbl.style.alignItems  = 'center';
      lbl.style.justifyContent = 'center';
      lbl.style.fontSize    = '10px';
      lbl.style.lineHeight  = '1';
      lbl.style.color       = 'var(--text-3, #999)';
      lbl.style.fontFamily  = 'var(--font-mono, monospace)';
      lbl.style.pointerEvents = 'none';
      rulerEl.appendChild(lbl);
    }
    return;
  }

  // Режим «По этапам» — крупный шаг
  const majorStep = totalDays <= 60 ? 5 : totalDays <= 120 ? 7 : 14;
  for (let d = 0; d <= totalDays; d++) {
    const isMajor = d % majorStep === 0;
    const line = document.createElement('div');
    line.className = isMajor ? 'gantt-ruler-tick gantt-ruler-tick-major'
                              : 'gantt-ruler-tick gantt-ruler-tick-minor';
    line.style.position = 'absolute';
    line.style.top      = '0';
    line.style.bottom   = '0';
    line.style.left     = (d * PX_PER_DAY) + 'px';
    line.style.width    = '1px';
    line.style.background = isMajor ? 'var(--border-1, #d8d8d8)' : 'var(--border-2, #ececec)';
    line.style.pointerEvents = 'none';

    if (isMajor) {
      const lbl = document.createElement('span');
      lbl.textContent = d;
      lbl.style.position    = 'absolute';
      lbl.style.left        = '3px';
      lbl.style.top         = '2px';
      lbl.style.fontSize    = '10px';
      lbl.style.lineHeight  = '1';
      lbl.style.color       = 'var(--text-3, #888)';
      lbl.style.fontFamily  = 'var(--font-mono, monospace)';
      lbl.style.whiteSpace  = 'nowrap';
      line.appendChild(lbl);
    }
    rulerEl.appendChild(line);
  }
}

// ── Строим вертикальную сетку трека ───────────────────────────
// Координаты точно совпадают с _buildRulerTicks: линия на каждом дне d * PX_PER_DAY.
// В режиме «по работам» все линии тонкие и очень бледные.
function _buildTrackGrid(gridEl, totalDays) {
  gridEl.innerHTML = '';
  gridEl.style.position = 'absolute';
  gridEl.style.inset    = '0';
  gridEl.style.pointerEvents = 'none';

  const isWorksMode = appState.ganttMode === 'works';

  if (isWorksMode) {
    for (let d = 0; d <= totalDays; d++) {
      const line = document.createElement('div');
      line.className = 'gantt-grid-line gantt-grid-line-minor';
      line.style.position = 'absolute';
      line.style.top      = '0';
      line.style.bottom   = '0';
      line.style.left     = (d * PX_PER_DAY) + 'px';
      line.style.width    = '1px';
      line.style.background = 'var(--border-2, #f4f4f4)';
      gridEl.appendChild(line);
    }
    return;
  }

  // Режим «По этапам»
  const majorStep = totalDays <= 60 ? 5 : totalDays <= 120 ? 7 : 14;
  for (let d = 0; d <= totalDays; d++) {
    const isMajor = d % majorStep === 0;
    const line = document.createElement('div');
    line.className = isMajor ? 'gantt-grid-line gantt-grid-line-major'
                              : 'gantt-grid-line gantt-grid-line-minor';
    line.style.position = 'absolute';
    line.style.top      = '0';
    line.style.bottom   = '0';
    line.style.left     = (d * PX_PER_DAY) + 'px';
    line.style.width    = '1px';
    line.style.background = isMajor ? 'var(--border-1, #e6e6e6)' : 'var(--border-2, #f1f1f1)';
    gridEl.appendChild(line);
  }
}

// ── Ruler (только для режима «По этапам») ─────────────────────
// В режиме «По работам» ruler строится внутри _renderGanttWorks.

function _renderGanttRuler() {
  const ruler = document.getElementById('ganttRuler');
  const wrapTop = document.getElementById('ganttRulerTopWrap');

  // В режиме «По работам» полностью убираем верхнюю шкалу из layout
  if (appState.ganttMode === 'works') {
    if (wrapTop) {
      wrapTop.classList.add('works-mode');
      wrapTop.style.display = 'none';
    }
    if (ruler) ruler.innerHTML = '';
    return;
  }

  // Режим «По этапам» — верхнюю шкалу показываем
  if (wrapTop) {
    wrapTop.classList.remove('works-mode');
    wrapTop.style.display = '';
  }
  if (!ruler) return;
  ruler.innerHTML = '';
  const totalDays = Math.max(appState.totalDays || 0, 14);

  const spacer = document.getElementById('ganttRulerSpacer');
  if (spacer) spacer.style.width = 'calc(230px + 14px)';

  const ticks = Math.min(totalDays, 20);
  for (let i = 0; i <= ticks; i++) {
    const dayNum = Math.round(totalDays * i / ticks);
    const t = document.createElement('span');
    t.className = 'gantt-tick';
    t.textContent = dayNum;
    t.style.left = (i / ticks * 100) + '%';
    ruler.appendChild(t);
  }
}

// ── DOM-обновление одного бара «по этапам» (legacy drag) ─────────

function _updateGanttBarDOM(idx) {
  const s   = appState.stages[idx];
  const bar = document.querySelector(`.gantt-bar[data-idx="${idx}"]`);
  if (!bar) return;
  bar.style.left  = s.pct + '%';
  bar.style.width = s.w   + '%';
  const days = Math.max(1, Math.round(appState.totalDays * s.w / 100));
  const lbl  = bar.querySelector('.gantt-bar-label');
  if (lbl) lbl.textContent = days + ' дн.';
  const ticks = bar.querySelector('.gantt-ticks');
  if (ticks) {
    ticks.innerHTML = Array.from({length: days + 1}, (_, ti) =>
      `<div class="gantt-tick-mark" style="left:${(ti / days * 100).toFixed(2)}%"></div>`
    ).join('');
  }
}

// ── Global mouse listeners для drag баров «по этапам» ────────────

function _initGanttDrag() {
  document.addEventListener('mousemove', e => {
    if (!_dragging) return;
    const { idx, type, startX, origPct, origW, trackW } = _dragging;
    if (!trackW) return;
    const dpct = (e.clientX - startX) / trackW * 100;
    const s    = appState.stages[idx];
    const snap = appState.totalDays > 0 ? (100 / appState.totalDays) : 1;
    if (type === 'bar') {
      s.pct = Math.round(Math.max(0, Math.min(origPct + dpct, 100 - origW)) / snap) * snap;
    } else if (type === 'left') {
      const rawPct = Math.round(Math.max(0, Math.min(origPct + dpct, origPct + origW - snap)) / snap) * snap;
      s.w   = origW - (rawPct - origPct);
      s.pct = rawPct;
    } else {
      s.w = Math.round(Math.max(snap, Math.min(origW + dpct, 100 - origPct)) / snap) * snap;
    }
    _updateGanttBarDOM(idx);
  });

  document.addEventListener('mouseup', () => {
    if (!_dragging) return;
    _dragging = null;
    document.body.style.cursor    = '';
    document.body.style.userSelect = '';
    _onDurationChanged();
  });
}

// ── Безопасный вызов renderPayments (избегаем кругового импорта) ──

function renderPayments_safe() {
  if (typeof window._smetaModule?.renderPayments === 'function') {
    window._smetaModule.renderPayments();
  }
}
