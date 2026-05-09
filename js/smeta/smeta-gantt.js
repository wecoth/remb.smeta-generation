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

  // Дефолт — ничего не ставим, поле пустое пока нет работ
  if (!appState.totalDaysSet) {
    appState.totalDays = 14;
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

  // При переходе на «по этапам» — пересчитываем из актуальных workDays/workStart
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
    7
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

// ── Режим «По работам» ──────────────────────────────────────────
// FIX: инпут дней вынесен влево от трека, полоса — только drag

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
    if (!appState.totalDays || appState.totalDays < 14) {
      appState.totalDays = 14;
      const sl = document.getElementById('totalDaysSlider');
      if (sl) sl.value = 14;
    }
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

  const totalDays = Math.max(realEnd, 14);
  appState.totalDays = totalDays;
  appState.worksRealEnd = realEnd;

  // Обновляем поле «Общий срок» из работ (если нет ручного override)
  if (!appState.totalDaysOverride) {
    _setTotalDaysDisplay(realEnd > 0 ? realEnd : 14);
  }

  wrap.innerHTML = '';
  const uidToColor = {};
  groups.forEach(g => g.rows.forEach(r => { uidToColor[String(r._uid)] = g.color; }));

  groups.forEach(g => {
    if (!g.rows.length) return;

    const groupHead = document.createElement('div');
    groupHead.className = 'gantt-works-group-head';
    groupHead.innerHTML = `
      <span class="gantt-stage-dot" style="background:${g.color}"></span>
      <span style="font-size:11px;font-weight:600;color:var(--text-1);flex:1">${esc(g.stageName || 'Без этапа')}</span>`;
    wrap.appendChild(groupHead);

    g.rows.forEach(r => {
      const uid   = String(r._uid);
      const days  = appState.workDays[uid]  || 0;
      const start = appState.workStart[uid] || 0;
      const pct   = totalDays > 0 ? (start / totalDays * 100) : 0;
      const wPct  = totalDays > 0 ? (days  / totalDays * 100) : 0;

      // Объём и единица из сметы
      const unitStr = r.unit ? esc(r.unit) : '';
      const qtyStr  = r.qty  ? esc(String(r.qty)) : '';
      const volBadge = (unitStr || qtyStr)
        ? `<span class="gantt-work-vol" title="Объём" style="
              font-size:10px;color:var(--text-3);white-space:nowrap;flex-shrink:0;
              font-family:var(--font-mono);padding:0 3px;
              border:1px solid var(--border-2);border-radius:3px;background:var(--bg-soft);">
            ${qtyStr}${qtyStr && unitStr ? ' ' : ''}${unitStr}
           </span>`
        : '';

      const row = document.createElement('div');
      row.className = 'gantt-row gantt-works-row';

      // ── Лейбл (drag-зона) ─────────────────────────────────────
      const labelDiv = document.createElement('div');
      labelDiv.className = 'gantt-row-label gantt-works-label-draggable';
      labelDiv.style.cssText = 'gap:4px;padding-left:4px;cursor:grab;flex-wrap:nowrap;align-items:center;';
      labelDiv.dataset.uid = uid;
      labelDiv.innerHTML = `
        <span class="gantt-work-drag-handle" title="Перетащите на шкалу">⠿</span>
        <span class="gantt-work-name" title="${esc(r.name)}">${esc(r.name)}</span>
        ${volBadge}`;

      // ── Правая часть: инпут дней + трек ──────────────────────
      // Инпут дней теперь СЛЕВА от трека, вне полосы → чистый drag
      const rightWrap = document.createElement('div');
      rightWrap.style.cssText = 'display:flex;align-items:center;gap:6px;flex:1;min-width:0;';

      // Инпут количества дней
      const daysInp = document.createElement('input');
      daysInp.type = 'number';
      daysInp.min  = 0; daysInp.max = 999;
      daysInp.value = days > 0 ? days : '';
      daysInp.placeholder = '—';
      daysInp.dataset.uid = uid;
      daysInp.className = 'gantt-work-days-inp';
      daysInp.title = 'Количество рабочих дней';
      daysInp.style.cssText = `
        width:40px;padding:2px 4px;border-radius:4px;border:1px solid var(--border-1);
        font-size:11px;font-weight:${days > 0 ? '600' : '400'};text-align:center;
        background:var(--bg-card);color:var(--text-1);font-family:var(--font-mono);
        -moz-appearance:textfield;appearance:textfield;outline:none;flex-shrink:0;`;

      const daysLbl = document.createElement('span');
      daysLbl.textContent = 'дн.';
      daysLbl.style.cssText = 'font-size:10px;color:var(--text-3);flex-shrink:0;';

      const trackWrap = document.createElement('div');
      trackWrap.className = 'gantt-track-wrap';
      trackWrap.style.flex = '1';

      const track = document.createElement('div');
      track.className = 'gantt-track';
      track.dataset.uid = uid;

      if (days > 0) {
        const bar = document.createElement('div');
        bar.className = 'gantt-bar gantt-work-bar gantt-work-bar-placed';
        bar.dataset.uid = uid;
        bar.style.left       = pct.toFixed(2) + '%';
        bar.style.width      = Math.max(wPct, 0.5).toFixed(2) + '%';
        bar.style.background = g.color;
        bar.style.cursor     = 'grab';
        bar.innerHTML = `
          <div class="gantt-ticks">${Array.from({length: days + 1}, (_, ti) =>
            `<div class="gantt-tick-mark" style="left:${(ti / days * 100).toFixed(2)}%"></div>`
          ).join('')}</div>
          <div class="gantt-handle gantt-handle-r gantt-work-handle" data-uid="${uid}" data-edge="right"></div>`;
        track.appendChild(bar);
      }

      trackWrap.appendChild(track);
      rightWrap.appendChild(daysInp);
      rightWrap.appendChild(daysLbl);
      rightWrap.appendChild(trackWrap);

      row.appendChild(labelDiv);
      row.appendChild(rightWrap);
      wrap.appendChild(row);
    });
  });

  // ── Обработка инпутов дней ─────────────────────────────────────
  // Перерендер только на blur/Enter — иначе DOM убивается при каждом символе
  wrap.querySelectorAll('.gantt-work-days-inp').forEach(inp => {
    inp.addEventListener('mousedown', e => e.stopPropagation());
    // input: только данные, без перерендера
    inp.addEventListener('input', () => {
      const uid = inp.dataset.uid;
      const val = Math.max(0, parseInt(inp.value) || 0);
      appState.workDays[uid] = val;
      inp.style.fontWeight = val > 0 ? '600' : '400';
      if (!appState.workMovedManually) appState.workMovedManually = {};
      if (val > 0) appState.workMovedManually[uid] = true;
    });
    // blur/Enter: полный перерендер
    function _commitWorkInp() {
      recalcAllStageDaysAuto();
      _renderGanttWorks(wrap);
      _renderGanttRuler();
      _onDurationChanged();
    }
    inp.addEventListener('blur', _commitWorkInp);
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); inp.blur(); }
    });
  });

  // ── Drag с лейбла на трек ─────────────────────────────────────
  wrap.querySelectorAll('.gantt-works-label-draggable').forEach(labelEl => {
    labelEl.addEventListener('mousedown', e => {
      if (e.target.tagName === 'INPUT') return;
      if (e.detail >= 2) return;
      e.preventDefault(); e.stopPropagation();
      const uid      = labelEl.dataset.uid;
      const color    = uidToColor[uid] || '#9b9b9b';
      const origDays = appState.workDays[uid] || 0;

      const ghost = document.createElement('div');
      ghost.className = 'gantt-work-ghost';
      ghost.style.background = color;
      ghost.style.top  = (e.clientY - 11) + 'px';
      ghost.style.left = e.clientX + 'px';
      let ghostDays = origDays || 1;
      ghost.textContent = ghostDays + ' дн.';
      document.body.appendChild(ghost);
      document.body.style.cursor    = 'grabbing';
      document.body.style.userSelect = 'none';

      wrap.querySelectorAll('.gantt-track[data-uid]').forEach(t => {
        t.style.outline       = '1.5px dashed var(--border-1)';
        t.style.outlineOffset = '-1px';
      });

      function onMove(ev) {
        ghost.style.top  = (ev.clientY - 11) + 'px';
        ghost.style.left = ev.clientX + 'px';
        ghost.style.display = 'none';
        const el2 = document.elementFromPoint(ev.clientX, ev.clientY);
        ghost.style.display = '';
        const trk = el2 && (el2.classList.contains('gantt-track') ? el2 : el2.closest('.gantt-track[data-uid]'));
        if (trk && trk.dataset.uid) {
          const rect = trk.getBoundingClientRect();
          ghost.style.width = (ghostDays / (appState.totalDays || 14) * rect.width) + 'px';
          trk.style.outline = '1.5px dashed ' + color;
        } else {
          ghost.style.width = '';
          wrap.querySelectorAll('.gantt-track[data-uid]').forEach(t => {
            t.style.outline = '1.5px dashed var(--border-1)';
          });
        }
      }

      function onUp(ev) {
        document.body.removeChild(ghost);
        document.body.style.cursor    = '';
        document.body.style.userSelect = '';
        wrap.querySelectorAll('.gantt-track[data-uid]').forEach(t => {
          t.style.outline = ''; t.style.outlineOffset = '';
        });

        // Ищем трек под курсором
        const el2 = document.elementFromPoint(ev.clientX, ev.clientY);
        let trk = null;
        if (el2) {
          if (el2.classList.contains('gantt-track') && el2.dataset.uid) {
            trk = el2;
          } else {
            trk = el2.closest('.gantt-track[data-uid]');
          }
          if (!trk) {
            const wrap2 = el2.classList.contains('gantt-track-wrap') ? el2 : el2.closest('.gantt-track-wrap');
            if (wrap2) trk = wrap2.querySelector('.gantt-track[data-uid]');
          }
          if (!trk) {
            const ganttRow = el2.closest('.gantt-works-row');
            if (ganttRow) trk = ganttRow.querySelector('.gantt-track[data-uid]');
          }
        }
        // По Y-расстоянию как запасной вариант
        if (!trk) {
          let bestTrk = null, bestDist = Infinity;
          wrap.querySelectorAll('.gantt-track[data-uid]').forEach(t => {
            const r    = t.getBoundingClientRect();
            const dist = Math.abs(ev.clientY - (r.top + r.bottom) / 2);
            if (dist < bestDist && dist < 80) { bestDist = dist; bestTrk = t; }
          });
          trk = bestTrk;
        }

        if (trk && trk.dataset.uid) {
          const trkUid = String(trk.dataset.uid);
          const rect   = trk.getBoundingClientRect();
          const dayPos = Math.max(0, Math.floor((ev.clientX - rect.left) / rect.width * (appState.totalDays || 14)));
          if (!appState.workDays[trkUid] || appState.workDays[trkUid] === 0) {
            appState.workDays[trkUid] = 1;
          }
          appState.workStart[trkUid] = dayPos;
          if (!appState.workMovedManually) appState.workMovedManually = {};
          appState.workMovedManually[trkUid] = true;
          // Растягиваем шкалу если дроп ушёл вправо
          const barEnd = dayPos + (appState.workDays[trkUid] || 1);
          if (barEnd + 3 > appState.totalDays) {
            appState.totalDays = barEnd + 5;
          }
          // Синхронизируем инпут дней в этой строке
          const rowDaysInp = wrap.querySelector(`.gantt-work-days-inp[data-uid="${trkUid}"]`);
          if (rowDaysInp) {
            rowDaysInp.value       = appState.workDays[trkUid];
            rowDaysInp.style.fontWeight = '600';
          }
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

  // ── Вспомогательная: обновить бар в DOM без полного перерендера ──
  // Во время drag полный _renderGanttWorks убивает DOM и track теряется.
  // Поэтому двигаем только стиль конкретного бара.
  function _updateBarDOM(uid, tDays) {
    const barEl = wrap.querySelector(`.gantt-work-bar[data-uid="${uid}"]`);
    if (!barEl) return;
    const start = appState.workStart[uid] || 0;
    const days  = appState.workDays[uid]  || 1;
    const pct   = start / tDays * 100;
    const wPct  = Math.max(days / tDays * 100, 0.5);
    barEl.style.left  = pct.toFixed(2) + '%';
    barEl.style.width = wPct.toFixed(2) + '%';
  }

  // ── Резиновая шкала ──────────────────────────────────────────────
  // Расширяет totalDays если barEnd подходит к правому краю.
  // Перерисовывает только ruler (не трогает DOM баров/треков).
  function _stretchScale(barEnd) {
    const BUFFER = 5;
    if (barEnd + BUFFER > appState.totalDays) {
      appState.totalDays = barEnd + BUFFER + 3;
      _renderGanttRuler();
      // Пересчитываем left/width всех баров под новый totalDays
      wrap.querySelectorAll('.gantt-work-bar').forEach(b => {
        _updateBarDOM(b.dataset.uid, appState.totalDays);
      });
    }
  }

  // ── Drag бара (перемещение) ───────────────────────────────────
  wrap.querySelectorAll('.gantt-work-bar').forEach(bar => {
    const uid = bar.dataset.uid;
    bar.addEventListener('mousedown', e => {
      if (e.target.classList.contains('gantt-handle')) return;
      e.preventDefault(); e.stopPropagation();
      const track      = bar.closest('.gantt-track');
      const trackRect0 = track.getBoundingClientRect(); // snapshot при mousedown
      const startX     = e.clientX;
      const origStart  = appState.workStart[uid] || 0;
      const origDays   = appState.workDays[uid]  || 1;
      document.body.style.cursor    = 'grabbing';
      document.body.style.userSelect = 'none';

      function onMove(ev) {
        const tDays  = appState.totalDays || 14;
        // trackW: используем snapshot — трек не пересоздаётся во время drag
        const trackW = track.getBoundingClientRect().width || trackRect0.width || 1;
        const delta  = Math.round((ev.clientX - startX) / trackW * tDays);
        const newStart = Math.max(0, origStart + delta);
        appState.workStart[uid] = newStart;
        if (!appState.workMovedManually) appState.workMovedManually = {};
        appState.workMovedManually[uid] = true;
        _stretchScale(newStart + origDays);
        _updateBarDOM(uid, appState.totalDays);
      }
      function onUp() {
        document.body.style.cursor = ''; document.body.style.userSelect = '';
        // Полный перерендер только после отпускания
        _renderGanttWorks(wrap);
        _renderGanttRuler();
        recalcAllStageDaysAuto();
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
      const uid       = h.dataset.uid;
      const track     = h.closest('.gantt-track');
      const trackRect0 = track.getBoundingClientRect();
      const startX    = e.clientX;
      const origD     = appState.workDays[uid]  || 1;
      const origS     = appState.workStart[uid] || 0;
      document.body.style.cursor    = 'ew-resize';
      document.body.style.userSelect = 'none';

      function onMove(ev) {
        const tDays  = appState.totalDays || 14;
        const trackW = track.getBoundingClientRect().width || trackRect0.width || 1;
        const delta  = Math.round((ev.clientX - startX) / trackW * tDays);
        const newD   = Math.max(1, origD + delta);
        appState.workDays[uid] = newD;
        if (!appState.workMovedManually) appState.workMovedManually = {};
        appState.workMovedManually[uid] = true;
        _stretchScale(origS + newD);
        _updateBarDOM(uid, appState.totalDays);
        // Синхронизируем инпут дней
        const rowDaysInp = wrap.querySelector(`.gantt-work-days-inp[data-uid="${uid}"]`);
        if (rowDaysInp) {
          rowDaysInp.value = newD;
          rowDaysInp.style.fontWeight = '600';
        }
      }
      function onUp() {
        document.body.style.cursor = ''; document.body.style.userSelect = '';
        _renderGanttWorks(wrap);
        _renderGanttRuler();
        recalcAllStageDaysAuto();
        _onDurationChanged();
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  });
}

// ── Ruler ─────────────────────────────────────────────────────────

function _renderGanttRuler() {
  const ruler = document.getElementById('ganttRuler');
  if (!ruler) return;
  ruler.innerHTML = '';
  // Ruler: никогда не делим на 0 — минимум 14
  const sliderVal = parseInt(document.getElementById('totalDaysSlider')?.value) || 0;
  const totalDays = Math.max(sliderVal, appState.totalDays || 0, 14);

  const spacer = document.getElementById('ganttRulerSpacer');
  if (spacer) {
    spacer.style.width = (appState.ganttMode === 'works')
      ? 'calc(280px + 14px)'
      : 'calc(230px + 14px)';
  }

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
}// ─── smeta-gantt.js ────────────────────────────────────────────────
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

  // Дефолт — ничего не ставим, поле пустое пока нет работ
  if (!appState.totalDaysSet) {
    appState.totalDays = 14;
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

  // При переходе на «по этапам» — пересчитываем из актуальных workDays/workStart
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
    7
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

// ── Режим «По работам» ──────────────────────────────────────────
// FIX: инпут дней вынесен влево от трека, полоса — только drag

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
    if (!appState.totalDays || appState.totalDays < 14) {
      appState.totalDays = 14;
      const sl = document.getElementById('totalDaysSlider');
      if (sl) sl.value = 14;
    }
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

  const totalDays = Math.max(realEnd, 14);
  appState.totalDays = totalDays;
  appState.worksRealEnd = realEnd;

  // Обновляем поле «Общий срок» из работ (если нет ручного override)
  if (!appState.totalDaysOverride) {
    _setTotalDaysDisplay(realEnd > 0 ? realEnd : 0);
  }

  wrap.innerHTML = '';
  const uidToColor = {};
  groups.forEach(g => g.rows.forEach(r => { uidToColor[String(r._uid)] = g.color; }));

  groups.forEach(g => {
    if (!g.rows.length) return;

    const groupHead = document.createElement('div');
    groupHead.className = 'gantt-works-group-head';
    groupHead.innerHTML = `
      <span class="gantt-stage-dot" style="background:${g.color}"></span>
      <span style="font-size:11px;font-weight:600;color:var(--text-1);flex:1">${esc(g.stageName || 'Без этапа')}</span>`;
    wrap.appendChild(groupHead);

    g.rows.forEach(r => {
      const uid   = String(r._uid);
      const days  = appState.workDays[uid]  || 0;
      const start = appState.workStart[uid] || 0;
      const pct   = totalDays > 0 ? (start / totalDays * 100) : 0;
      const wPct  = totalDays > 0 ? (days  / totalDays * 100) : 0;

      // Объём и единица из сметы
      const unitStr = r.unit ? esc(r.unit) : '';
      const qtyStr  = r.qty  ? esc(String(r.qty)) : '';
      const volBadge = (unitStr || qtyStr)
        ? `<span class="gantt-work-vol" title="Объём" style="
              font-size:10px;color:var(--text-3);white-space:nowrap;flex-shrink:0;
              font-family:var(--font-mono);padding:0 3px;
              border:1px solid var(--border-2);border-radius:3px;background:var(--bg-soft);">
            ${qtyStr}${qtyStr && unitStr ? ' ' : ''}${unitStr}
           </span>`
        : '';

      const row = document.createElement('div');
      row.className = 'gantt-row gantt-works-row';

      // ── Лейбл (drag-зона) ─────────────────────────────────────
      const labelDiv = document.createElement('div');
      labelDiv.className = 'gantt-row-label gantt-works-label-draggable';
      labelDiv.style.cssText = 'gap:4px;padding-left:4px;cursor:grab;flex-wrap:nowrap;align-items:center;';
      labelDiv.dataset.uid = uid;
      labelDiv.innerHTML = `
        <span class="gantt-work-drag-handle" title="Перетащите на шкалу">⠿</span>
        <span class="gantt-work-name" title="${esc(r.name)}">${esc(r.name)}</span>
        ${volBadge}`;

      // ── Правая часть: инпут дней + трек ──────────────────────
      // Инпут дней теперь СЛЕВА от трека, вне полосы → чистый drag
      const rightWrap = document.createElement('div');
      rightWrap.style.cssText = 'display:flex;align-items:center;gap:6px;flex:1;min-width:0;';

      // Инпут количества дней
      const daysInp = document.createElement('input');
      daysInp.type = 'number';
      daysInp.min  = 0; daysInp.max = 999;
      daysInp.value = days > 0 ? days : '';
      daysInp.placeholder = '—';
      daysInp.dataset.uid = uid;
      daysInp.className = 'gantt-work-days-inp';
      daysInp.title = 'Количество рабочих дней';
      daysInp.style.cssText = `
        width:40px;padding:2px 4px;border-radius:4px;border:1px solid var(--border-1);
        font-size:11px;font-weight:${days > 0 ? '600' : '400'};text-align:center;
        background:var(--bg-card);color:var(--text-1);font-family:var(--font-mono);
        -moz-appearance:textfield;appearance:textfield;outline:none;flex-shrink:0;`;

      const daysLbl = document.createElement('span');
      daysLbl.textContent = 'дн.';
      daysLbl.style.cssText = 'font-size:10px;color:var(--text-3);flex-shrink:0;';

      const trackWrap = document.createElement('div');
      trackWrap.className = 'gantt-track-wrap';
      trackWrap.style.flex = '1';

      const track = document.createElement('div');
      track.className = 'gantt-track';
      track.dataset.uid = uid;

      if (days > 0) {
        const bar = document.createElement('div');
        bar.className = 'gantt-bar gantt-work-bar gantt-work-bar-placed';
        bar.dataset.uid = uid;
        bar.style.left       = pct.toFixed(2) + '%';
        bar.style.width      = Math.max(wPct, 0.5).toFixed(2) + '%';
        bar.style.background = g.color;
        bar.style.cursor     = 'grab';
        bar.innerHTML = `
          <div class="gantt-ticks">${Array.from({length: days + 1}, (_, ti) =>
            `<div class="gantt-tick-mark" style="left:${(ti / days * 100).toFixed(2)}%"></div>`
          ).join('')}</div>
          <div class="gantt-handle gantt-handle-r gantt-work-handle" data-uid="${uid}" data-edge="right"></div>`;
        track.appendChild(bar);
      }

      trackWrap.appendChild(track);
      rightWrap.appendChild(daysInp);
      rightWrap.appendChild(daysLbl);
      rightWrap.appendChild(trackWrap);

      row.appendChild(labelDiv);
      row.appendChild(rightWrap);
      wrap.appendChild(row);
    });
  });

  // ── Обработка инпутов дней ─────────────────────────────────────
  // Перерендер только на blur/Enter — иначе DOM убивается при каждом символе
  wrap.querySelectorAll('.gantt-work-days-inp').forEach(inp => {
    inp.addEventListener('mousedown', e => e.stopPropagation());
    // input: только данные, без перерендера
    inp.addEventListener('input', () => {
      const uid = inp.dataset.uid;
      const val = Math.max(0, parseInt(inp.value) || 0);
      appState.workDays[uid] = val;
      inp.style.fontWeight = val > 0 ? '600' : '400';
      if (!appState.workMovedManually) appState.workMovedManually = {};
      if (val > 0) appState.workMovedManually[uid] = true;
    });
    // blur/Enter: полный перерендер
    function _commitWorkInp() {
      recalcAllStageDaysAuto();
      _renderGanttWorks(wrap);
      _renderGanttRuler();
      _onDurationChanged();
    }
    inp.addEventListener('blur', _commitWorkInp);
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); inp.blur(); }
    });
  });

  // ── Drag с лейбла на трек ─────────────────────────────────────
  wrap.querySelectorAll('.gantt-works-label-draggable').forEach(labelEl => {
    labelEl.addEventListener('mousedown', e => {
      if (e.target.tagName === 'INPUT') return;
      if (e.detail >= 2) return;
      e.preventDefault(); e.stopPropagation();
      const uid      = labelEl.dataset.uid;
      const color    = uidToColor[uid] || '#9b9b9b';
      const origDays = appState.workDays[uid] || 0;

      const ghost = document.createElement('div');
      ghost.className = 'gantt-work-ghost';
      ghost.style.background = color;
      ghost.style.top  = (e.clientY - 11) + 'px';
      ghost.style.left = e.clientX + 'px';
      let ghostDays = origDays || 1;
      ghost.textContent = ghostDays + ' дн.';
      document.body.appendChild(ghost);
      document.body.style.cursor    = 'grabbing';
      document.body.style.userSelect = 'none';

      wrap.querySelectorAll('.gantt-track[data-uid]').forEach(t => {
        t.style.outline       = '1.5px dashed var(--border-1)';
        t.style.outlineOffset = '-1px';
      });

      function onMove(ev) {
        ghost.style.top  = (ev.clientY - 11) + 'px';
        ghost.style.left = ev.clientX + 'px';
        ghost.style.display = 'none';
        const el2 = document.elementFromPoint(ev.clientX, ev.clientY);
        ghost.style.display = '';
        const trk = el2 && (el2.classList.contains('gantt-track') ? el2 : el2.closest('.gantt-track[data-uid]'));
        if (trk && trk.dataset.uid) {
          const rect = trk.getBoundingClientRect();
          ghost.style.width = (ghostDays / (appState.totalDays || 1) * rect.width) + 'px';
          trk.style.outline = '1.5px dashed ' + color;
        } else {
          ghost.style.width = '';
          wrap.querySelectorAll('.gantt-track[data-uid]').forEach(t => {
            t.style.outline = '1.5px dashed var(--border-1)';
          });
        }
      }

      function onUp(ev) {
        document.body.removeChild(ghost);
        document.body.style.cursor    = '';
        document.body.style.userSelect = '';
        wrap.querySelectorAll('.gantt-track[data-uid]').forEach(t => {
          t.style.outline = ''; t.style.outlineOffset = '';
        });

        // Ищем трек под курсором
        const el2 = document.elementFromPoint(ev.clientX, ev.clientY);
        let trk = null;
        if (el2) {
          if (el2.classList.contains('gantt-track') && el2.dataset.uid) {
            trk = el2;
          } else {
            trk = el2.closest('.gantt-track[data-uid]');
          }
          if (!trk) {
            const wrap2 = el2.classList.contains('gantt-track-wrap') ? el2 : el2.closest('.gantt-track-wrap');
            if (wrap2) trk = wrap2.querySelector('.gantt-track[data-uid]');
          }
          if (!trk) {
            const ganttRow = el2.closest('.gantt-works-row');
            if (ganttRow) trk = ganttRow.querySelector('.gantt-track[data-uid]');
          }
        }
        // По Y-расстоянию как запасной вариант
        if (!trk) {
          let bestTrk = null, bestDist = Infinity;
          wrap.querySelectorAll('.gantt-track[data-uid]').forEach(t => {
            const r    = t.getBoundingClientRect();
            const dist = Math.abs(ev.clientY - (r.top + r.bottom) / 2);
            if (dist < bestDist && dist < 80) { bestDist = dist; bestTrk = t; }
          });
          trk = bestTrk;
        }

        if (trk && trk.dataset.uid) {
          const trkUid = String(trk.dataset.uid);
          const rect   = trk.getBoundingClientRect();
          const dayPos = Math.max(0, Math.floor((ev.clientX - rect.left) / rect.width * (appState.totalDays || 14)));
          if (!appState.workDays[trkUid] || appState.workDays[trkUid] === 0) {
            appState.workDays[trkUid] = 1;
          }
          appState.workStart[trkUid] = dayPos;
          if (!appState.workMovedManually) appState.workMovedManually = {};
          appState.workMovedManually[trkUid] = true;
          // Растягиваем шкалу если дроп ушёл вправо
          const barEnd = dayPos + (appState.workDays[trkUid] || 1);
          if (barEnd + 3 > appState.totalDays) {
            appState.totalDays = barEnd + 5;
          }
          // Синхронизируем инпут дней в этой строке
          const rowDaysInp = wrap.querySelector(`.gantt-work-days-inp[data-uid="${trkUid}"]`);
          if (rowDaysInp) {
            rowDaysInp.value       = appState.workDays[trkUid];
            rowDaysInp.style.fontWeight = '600';
          }
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

  // ── Резиновая шкала ──────────────────────────────────────────────
  // barEnd — правый конец бара в днях.
  // Если он ближе чем 3 дня к правому краю шкалы — расширяем totalDays.
  // trackW пересчитывается после расширения.
  function _stretch(track, barEnd) {
    const BUFFER = 3;
    if (barEnd + BUFFER > appState.totalDays) {
      // Расширяем с запасом чтобы не дёргало на каждый пиксель
      appState.totalDays = barEnd + BUFFER + 2;
      _renderGanttRuler();
    }
    return track.getBoundingClientRect().width;
  }

  // ── Drag бара (перемещение) ───────────────────────────────────
  wrap.querySelectorAll('.gantt-work-bar').forEach(bar => {
    const uid = bar.dataset.uid;
    bar.addEventListener('mousedown', e => {
      if (e.target.classList.contains('gantt-handle')) return;
      e.preventDefault(); e.stopPropagation();
      const track     = bar.closest('.gantt-track');
      const startX    = e.clientX;
      const origStart = appState.workStart[uid] || 0;
      const origDays  = appState.workDays[uid]  || 1;
      document.body.style.cursor    = 'grabbing';
      document.body.style.userSelect = 'none';

      function onMove(ev) {
        // trackW и tDays пересчитываем каждый раз — шкала могла растянуться
        let trackW = track.getBoundingClientRect().width;
        const tDays = appState.totalDays || 14;
        const delta = Math.round((ev.clientX - startX) / trackW * tDays);
        const newStart = Math.max(0, origStart + delta);
        appState.workStart[uid] = newStart;
        if (!appState.workMovedManually) appState.workMovedManually = {};
        appState.workMovedManually[uid] = true;
        // Растягиваем если бар подошёл к краю
        trackW = _stretch(track, newStart + origDays);
        _renderGanttWorks(wrap);
        _renderGanttRuler();
      }
      function onUp() {
        document.body.style.cursor = ''; document.body.style.userSelect = '';
        recalcAllStageDaysAuto(); _onDurationChanged();
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
      const track  = h.closest('.gantt-track');
      const startX = e.clientX;
      const origD  = appState.workDays[uid]  || 1;
      const origS  = appState.workStart[uid] || 0;
      document.body.style.cursor    = 'ew-resize';
      document.body.style.userSelect = 'none';

      function onMove(ev) {
        let trackW = track.getBoundingClientRect().width;
        const tDays = appState.totalDays || 14;
        const delta = Math.round((ev.clientX - startX) / trackW * tDays);
        const newD  = Math.max(1, origD + delta);
        appState.workDays[uid] = newD;
        if (!appState.workMovedManually) appState.workMovedManually = {};
        appState.workMovedManually[uid] = true;
        // Растягиваем если resize ушёл вправо
        trackW = _stretch(track, origS + newD);
        // Синхронизируем инпут
        const rowDaysInp = wrap.querySelector(`.gantt-work-days-inp[data-uid="${uid}"]`);
        if (rowDaysInp) {
          rowDaysInp.value = newD;
          rowDaysInp.style.fontWeight = '600';
        }
        _renderGanttWorks(wrap);
        _renderGanttRuler();
      }
      function onUp() {
        document.body.style.cursor = ''; document.body.style.userSelect = '';
        recalcAllStageDaysAuto(); _onDurationChanged();
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  });
}

// ── Ruler ─────────────────────────────────────────────────────────

function _renderGanttRuler() {
  const ruler = document.getElementById('ganttRuler');
  if (!ruler) return;
  ruler.innerHTML = '';
  const totalDays = Math.max(
    parseInt(document.getElementById('totalDaysSlider')?.value) || appState.totalDays || 0,
    7
  );
  if (!totalDays) return;

  const spacer = document.getElementById('ganttRulerSpacer');
  if (spacer) {
    spacer.style.width = (appState.ganttMode === 'works')
      ? 'calc(280px + 14px)'
      : 'calc(230px + 14px)';
  }

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
