// ─── smeta-gantt.js ────────────────────────────────────────────────
// Блок 4: График производства работ (Гантт).
// Режимы: 'stages' (по этапам) | 'works' (по работам).
// Эмитит изменения через колбэки, переданные в initGantt().

import { appState }          from '../state.js';
import { STAGE_COLORS, esc } from './smeta-utils.js';

// Колбэки из smeta-init (избегаем кругового импорта)
let _onDurationChanged  = () => {}; // → updateTotals + renderPayments
let _onStageRenamed     = () => {}; // → renderPayments

// Состояние drag'а Гантт-баров
let _dragging = null; // { idx, type:'bar'|'left'|'right', startX, origPct, origW, trackW }

// ── Инициализация ──────────────────────────────────────────────────

export function initGantt({ onDurationChanged, onStageRenamed }) {
  _onDurationChanged = onDurationChanged || (() => {});
  _onStageRenamed    = onStageRenamed    || (() => {});
  // Дефолт 7 дней — если пользователь не задавал вручную через слайдер
  if (!appState.totalDaysSet) {
    appState.totalDays = 7;
    const sliderEl = document.getElementById('totalDaysSlider');
    const valEl    = document.getElementById('totalDaysVal');
    if (sliderEl) sliderEl.value = 7;
    if (valEl)    valEl.textContent = 7;
  }
  _initGanttDrag();
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
  appState.stages.push({ id, name, color, pct: Math.min(lastEnd, 90), w: 10, daysAuto: 0, daysOverride: null, parallelWithPrev: false });
  renderGantt();
  return id;
}

// ── Section → Gantt sync (вызывается из smeta-tables-smr) ──────────

// Удаляет из workDays/workStart/workMovedManually записи,
// которых больше нет в smrRows (работы удалены или переименованы).
// Также обновляет workDays для новых строк (добавленных в СМР).
function _cleanupOrphanWorkData() {
  const liveUids = new Set(
    appState.smrRows.filter(r => !r.isSection && r.name).map(r => r._uid)
  );
  if (!appState.workDays)          appState.workDays          = {};
  if (!appState.workStart)         appState.workStart         = {};
  if (!appState.workMovedManually) appState.workMovedManually = {};

  // Удаляем осиротевшие ключи
  for (const uid of Object.keys(appState.workDays)) {
    if (!liveUids.has(uid)) {
      delete appState.workDays[uid];
      delete appState.workStart[uid];
      delete appState.workMovedManually[uid];
    }
  }
  // Для новых строк, у которых ещё нет записи — инициализируем 0
  for (const uid of liveUids) {
    if (!(uid in appState.workDays)) appState.workDays[uid] = 0;
  }
}

export function syncSectionsToGantt() {
  _cleanupOrphanWorkData();   // ← синхронизация работ (добавление + удаление)

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
      appState.stages.push({ id, name, color, pct: Math.min(lastEnd, 90), w: 10, daysAuto: 0, daysOverride: null, parallelWithPrev: false });
    }
  });

  renderGantt();
  _onDurationChanged();
}

// ── Days auto-calc ─────────────────────────────────────────────────

function _calcStageDaysAuto(stageName) {
  let inside = false, auto = 0, prevDays = 0;
  for (const r of appState.smrRows) {
    if (r.isSection) {
      if (inside) break;
      inside = (r.name?.trim() === stageName);
      continue;
    }
    if (!inside) continue;
    const d        = appState.workDays?.[r._uid] || 0;
    const parallel = appState.workParallel?.[r._uid] || false;
    if (parallel && prevDays > 0) {
      auto = auto - prevDays + Math.max(prevDays, d);
    } else {
      auto += d;
    }
    prevDays = d;
  }
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
  if (!appState.totalDaysOverride && maxEnd > 0) {
    const inp = document.getElementById('totalDaysSlider');
    if (inp) {
      inp.value = maxEnd;
      appState.totalDays = maxEnd;
      const valEl = document.getElementById('totalDaysVal');
      if (valEl) valEl.textContent = maxEnd;
      if (typeof window._calcFinish === 'function') window._calcFinish();
    }
  }
}

// ── Публичный переключатель режимов ───────────────────────────────

export function setGanttMode(mode) {
  appState.ganttMode = mode;
  document.getElementById('ganttBtnStages')?.classList.toggle('active', mode === 'stages');
  document.getElementById('ganttBtnWorks')?.classList.toggle('active',  mode === 'works');
  renderGantt();
}

// ── Рендер (диспетчер) ─────────────────────────────────────────────

export function renderGantt() {
  const wrap = document.getElementById('ganttBars');
  if (!wrap) return;
  const mode = appState.ganttMode || 'stages';
  if (mode === 'works') {
    _renderGanttWorks(wrap);
    _renderGanttRuler();
    return;
  }
  _renderGanttStages(wrap);
  _renderGanttRuler();
}

// ── Режим «По этапам» ──────────────────────────────────────────────

function _renderGanttStages(wrap) {
  if (!appState.stages.length) {
    wrap.innerHTML = '<div style="padding:20px 0;text-align:center;font-size:12px;color:#bbb">Этапы появятся когда вы добавите строки в смету и укажете им этапы</div>';
    return;
  }

  recalcAllStageDaysAuto();
  const totalDays = Math.max(appState.totalDays || 0, 7);

  // Позиционируем с учётом parallelWithPrev
  let cursor = 0;
  appState.stages.forEach((s, i) => {
    const dur   = (s.daysOverride != null ? s.daysOverride : s.daysAuto) || 0;
    const start = (s.parallelWithPrev && i > 0) ? (appState.stages[i - 1]._startDay || 0) : cursor;
    s._startDay = start;
    if (!s.parallelWithPrev) cursor = start + dur;
  });

  wrap.innerHTML = '';

  appState.stages.forEach((s, idx) => {
    const hasAuto    = (s.daysAuto || 0) > 0;
    const dur        = s.daysOverride != null ? s.daysOverride : (s.daysAuto || 0);
    const startDay   = s._startDay || 0;
    const pct        = totalDays > 0 ? (startDay / totalDays * 100) : s.pct;
    const wPct       = totalDays > 0 && dur > 0 ? (dur / totalDays * 100) : s.w;
    const isOverride = s.daysOverride != null;
    const isParallel = s.parallelWithPrev && idx > 0;

    const row = document.createElement('div');
    row.className = 'gantt-row';

    const ticksHtml = dur > 0 ? Array.from({length: dur + 1}, (_, ti) => {
      return `<div class="gantt-tick-mark" style="left:${(ti / dur * 100).toFixed(2)}%"></div>`;
    }).join('') : '';

    row.innerHTML = `
      <div class="gantt-row-label">
        ${idx > 0
          ? `<button class="gantt-parallel-btn${isParallel ? ' active' : ''}" data-sidx="${idx}" title="Параллельно с предыдущим этапом" style="font-size:13px">⇉</button>`
          : '<span style="width:22px;display:inline-block"></span>'}
        <span class="gantt-stage-dot" style="background:${s.color}"></span>
        <span class="gantt-stage-name" contenteditable="true" data-idx="${idx}">${esc(s.name)}</span>
        ${hasAuto && !isOverride
          ? `<span class="gantt-stage-days" title="Автоматически из работ">🔒 ${dur} дн.</span>
             <button class="gantt-unlock-btn" data-sidx="${idx}" title="Задать вручную">✏️</button>`
          : `<input type="number" min="1" max="999" class="gantt-stage-days-inp" data-sidx="${idx}" value="${dur || ''}" placeholder="0"
               style="width:42px;padding:2px 4px;border-radius:4px;border:1px solid var(--border-1);font-size:11px;
                      text-align:center;background:var(--bg-card);color:var(--text-1);font-family:var(--font-mono);
                      -moz-appearance:textfield;appearance:textfield;outline:none;">
             <span style="font-size:10px;color:var(--text-3)">дн.</span>
             ${hasAuto ? `<button class="gantt-lock-btn" data-sidx="${idx}" title="Вернуть авторасчёт">🔓</button>` : ''}`
        }
      </div>
      <div class="gantt-track-wrap">
        <div class="gantt-track">
          ${wPct > 0 ? `<div class="gantt-bar" data-idx="${idx}" style="left:${pct.toFixed(2)}%;width:${wPct.toFixed(2)}%;background:${s.color};${!isOverride && hasAuto ? 'opacity:0.85;' : ''}">
            ${!isOverride && hasAuto ? '' : `<div class="gantt-handle gantt-handle-l" data-idx="${idx}" data-edge="left"></div>`}
            <div class="gantt-ticks">${ticksHtml}</div>
            <span class="gantt-bar-label">${dur} дн.</span>
            ${!isOverride && hasAuto ? '' : `<div class="gantt-handle gantt-handle-r" data-idx="${idx}" data-edge="right"></div>`}
          </div>` : ''}
        </div>
      </div>`;
    wrap.appendChild(row);

    // Редактирование названия
    row.querySelector('.gantt-stage-name').addEventListener('blur', () => {
      appState.stages[idx].name = row.querySelector('.gantt-stage-name').textContent.trim();
      _onStageRenamed();
    });

    // Параллельность
    row.querySelector('.gantt-parallel-btn[data-sidx]')?.addEventListener('click', () => {
      appState.stages[idx].parallelWithPrev = !appState.stages[idx].parallelWithPrev;
      recalcTotalDaysAuto();
      renderGantt();
      _onDurationChanged();
    });

    // ✏️ → ручной режим
    row.querySelector('.gantt-unlock-btn')?.addEventListener('click', () => {
      appState.stages[idx].daysOverride = appState.stages[idx].daysAuto || 0;
      renderGantt();
    });

    // 🔓 → авто
    row.querySelector('.gantt-lock-btn')?.addEventListener('click', () => {
      appState.stages[idx].daysOverride = null;
      recalcTotalDaysAuto();
      renderGantt();
    });

    // Инпут ручных дней
    row.querySelector('.gantt-stage-days-inp')?.addEventListener('input', e => {
      const val = Math.max(0, parseInt(e.target.value) || 0);
      appState.stages[idx].daysOverride = val > 0 ? val : null;
      recalcTotalDaysAuto();
      _renderGanttRuler();
      _onDurationChanged();
    });

    // Drag-handles (только при override или без auto)
    if (isOverride || !hasAuto) {
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

      const bar = row.querySelector('.gantt-bar');
      if (bar) {
        bar.addEventListener('mousedown', e => {
          if (e.target.classList.contains('gantt-handle')) return;
          e.preventDefault();
          const track  = bar.closest('.gantt-track');
          const trackW = track.getBoundingClientRect().width;
          _dragging = { idx, type: 'bar', startX: e.clientX, origPct: s.pct, origW: s.w, trackW };
          document.body.style.cursor = 'grabbing';
          document.body.style.userSelect = 'none';
        });
      }
    }
  });
}

// ── Режим «По работам» ─────────────────────────────────────────────

function _renderGanttWorks(wrap) {
  if (!appState.workDays)  appState.workDays  = {};
  if (!appState.workStart) appState.workStart = {};

  _cleanupOrphanWorkData();   // ← актуализируем перед каждым рендером

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
      if (!curGroup) { curGroup = { stageName: '', color: '#9b9b9b', stage: null, rows: [] }; groups.push(curGroup); }
      curGroup.rows.push(r);
    }
  });

  const allWorkRows = groups.flatMap(g => g.rows);
  if (!allWorkRows.length) {
    // Даже без работ — держим шкалу на дефолте 7
    if (!appState.totalDays || appState.totalDays < 7) {
      appState.totalDays = 7;
      const sl = document.getElementById('totalDaysSlider');
      if (sl) sl.value = 7;
    }
    wrap.innerHTML = '<div style="padding:20px 0;text-align:center;font-size:12px;color:#bbb">Добавьте работы в смету — они появятся здесь</div>';
    return;
  }

  if (!appState.workMovedManually) appState.workMovedManually = {};

  // Авто-позиция
  {
    let seqCursor = 0;
    allWorkRows.forEach(r => {
      const uid = r._uid;
      if (appState.workMovedManually[uid]) {
        const end = (appState.workStart[uid] || 0) + (appState.workDays[uid] || 0);
        if (end > seqCursor) seqCursor = end;
      } else {
        appState.workStart[uid] = seqCursor;
        seqCursor += appState.workDays[uid] || 0;
      }
    });
  }

  let autoTotal = 0;
  allWorkRows.forEach(r => {
    autoTotal = Math.max(autoTotal, (appState.workStart[r._uid] || 0) + (appState.workDays[r._uid] || 0));
  });
  // Не схлопываем шкалу: берём максимум из авто, текущего значения и минимума 7
  const totalDays = Math.max(autoTotal, appState.totalDays || 0, 7);
  appState.totalDays = totalDays;
  const sliderEl = document.getElementById('totalDaysSlider');
  if (sliderEl) sliderEl.value = totalDays;

  wrap.innerHTML = '';
  const uidToColor = {};
  groups.forEach(g => g.rows.forEach(r => { uidToColor[r._uid] = g.color; }));

  groups.forEach(g => {
    if (!g.rows.length) return;

    const groupHead = document.createElement('div');
    groupHead.className = 'gantt-works-group-head';
    groupHead.innerHTML = `
      <span class="gantt-stage-dot" style="background:${g.color}"></span>
      <span style="font-size:11px;font-weight:600;color:var(--text-1);flex:1">${esc(g.stageName || 'Без этапа')}</span>`;
    wrap.appendChild(groupHead);

    g.rows.forEach(r => {
      const uid   = r._uid;
      const days  = appState.workDays[uid]  || 0;
      const start = appState.workStart[uid] || 0;
      const pct   = totalDays > 0 ? (start / totalDays * 100) : 0;
      const wPct  = totalDays > 0 ? (days  / totalDays * 100) : 0;

      const row = document.createElement('div');
      row.className = 'gantt-row gantt-works-row';

      const labelDiv = document.createElement('div');
      labelDiv.className = 'gantt-row-label gantt-works-label-draggable';
      labelDiv.style.cssText = 'gap:4px;padding-left:4px;cursor:grab';
      labelDiv.dataset.uid = uid;
      labelDiv.innerHTML = `
        <span class="gantt-work-drag-handle" title="Перетащите на шкалу">⠿</span>
        <span class="gantt-work-name" title="${esc(r.name)}">${esc(r.name)}</span>
        ${days > 0 ? `<span class="gantt-works-auto-days" data-uid-days="${uid}">${days} дн.</span>` : ''}`;

      const trackWrap = document.createElement('div');
      trackWrap.className = 'gantt-track-wrap';
      const track = document.createElement('div');
      track.className = 'gantt-track';
      track.dataset.uid = uid;

      if (days > 0) {
        const bar = document.createElement('div');
        bar.className = 'gantt-bar gantt-work-bar gantt-work-bar-placed';
        bar.dataset.uid = uid;
        bar.style.left      = pct.toFixed(2) + '%';
        bar.style.width     = Math.max(wPct, 0.5).toFixed(2) + '%';
        bar.style.background = g.color;
        bar.innerHTML = `
          <div class="gantt-ticks">${Array.from({length: days + 1}, (_, ti) =>
            `<div class="gantt-tick-mark" style="left:${(ti / days * 100).toFixed(2)}%"></div>`
          ).join('')}</div>
          <span class="gantt-bar-label">${days} дн.</span>
          <div class="gantt-handle gantt-handle-r gantt-work-handle" data-uid="${uid}" data-edge="right"></div>`;
        track.appendChild(bar);
      }

      trackWrap.appendChild(track);
      row.appendChild(labelDiv);
      row.appendChild(trackWrap);
      wrap.appendChild(row);
    });
  });

  // ── Drag с лейбла на трек (весь лейбл — включая текст) ──────────────
  wrap.querySelectorAll('.gantt-works-label-draggable').forEach(labelEl => {
    labelEl.addEventListener('mousedown', e => {
      // Не мешаем выделению текста двойным кликом
      if (e.detail >= 2) return;
      e.preventDefault(); e.stopPropagation();
      const uid       = labelEl.dataset.uid;
      const color     = uidToColor[uid] || '#9b9b9b';
      const origDays  = appState.workDays[uid] || 0;

      const ghost = document.createElement('div');
      ghost.className = 'gantt-work-ghost';
      ghost.style.background = color;
      ghost.style.top  = (e.clientY - 11) + 'px';
      ghost.style.left = e.clientX + 'px';
      let ghostDays = origDays || 1;
      ghost.textContent = ghostDays + ' дн.';
      document.body.appendChild(ghost);
      document.body.style.cursor = 'grabbing';
      document.body.style.userSelect = 'none';

      wrap.querySelectorAll('.gantt-track[data-uid]').forEach(t => {
        t.style.outline = '1.5px dashed var(--border-1)';
        t.style.outlineOffset = '-1px';
      });

      function onMove(ev) {
        ghost.style.top  = (ev.clientY - 11) + 'px';
        ghost.style.left = ev.clientX + 'px';
        ghost.style.display = 'none';
        const el2   = document.elementFromPoint(ev.clientX, ev.clientY);
        ghost.style.display = '';
        const trk   = el2 && (el2.classList.contains('gantt-track') ? el2 : el2.closest('.gantt-track[data-uid]'));
        if (trk && trk.dataset.uid) {
          const rect  = trk.getBoundingClientRect();
          ghostDays   = Math.max(1, ghostDays);
          ghost.textContent = ghostDays + ' дн.';
          ghost.style.width = (ghostDays / (appState.totalDays || 1) * rect.width) + 'px';
          trk.style.outline = '1.5px dashed ' + color;
        } else {
          ghost.style.width = '';
          wrap.querySelectorAll('.gantt-track[data-uid]').forEach(t => { t.style.outline = '1.5px dashed var(--border-1)'; });
        }
      }

      function onUp(ev) {
        document.body.removeChild(ghost);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        wrap.querySelectorAll('.gantt-track[data-uid]').forEach(t => { t.style.outline = ''; t.style.outlineOffset = ''; });

        // Ищем трек под курсором — сначала прямо под точкой, потом по ближайшей строке
        const el2  = document.elementFromPoint(ev.clientX, ev.clientY);
        console.log('[gantt drop] uid:', uid, '| el2:', el2, '| el2.className:', el2?.className);

        // el2 может быть: gantt-track, gantt-work-bar, gantt-bar-label, gantt-ticks,
        //   gantt-track-wrap, gantt-works-row, gantt-row-label — обрабатываем все варианты
        let trk = null;
        if (el2) {
          if (el2.classList.contains('gantt-track') && el2.dataset.uid) {
            // Прямо трек
            trk = el2;
          } else {
            // Пробуем подняться к треку (работает если el2 — дочерний бара)
            trk = el2.closest('.gantt-track[data-uid]');
          }
          if (!trk) {
            // el2 может быть gantt-track-wrap (родитель трека) — ищем вниз
            const wrap2 = el2.classList.contains('gantt-track-wrap') ? el2 : el2.closest('.gantt-track-wrap');
            if (wrap2) trk = wrap2.querySelector('.gantt-track[data-uid]');
          }
          if (!trk) {
            // Курсор над лейблом или любым элементом строки — берём трек той же строки
            const ganttRow = el2.closest('.gantt-works-row');
            if (ganttRow) trk = ganttRow.querySelector('.gantt-track[data-uid]');
          }
        }
        // Если вообще мимо — ищем ближайший трек по Y-позиции (увеличен радиус до 80px)
        if (!trk) {
          let bestTrk = null, bestDist = Infinity;
          wrap.querySelectorAll('.gantt-track[data-uid]').forEach(t => {
            const r = t.getBoundingClientRect();
            const centerY = (r.top + r.bottom) / 2;
            const dist = Math.abs(ev.clientY - centerY);
            if (dist < bestDist && dist < 80) { bestDist = dist; bestTrk = t; }
          });
          trk = bestTrk;
        }

        console.log('[gantt drop] trk found:', trk, '| trk.dataset.uid:', trk?.dataset?.uid);
        console.log('[gantt drop] workDays[uid] before:', appState.workDays[uid]);

        if (trk && trk.dataset.uid) {
          const rect   = trk.getBoundingClientRect();
          const dayPos = Math.max(0, Math.floor((ev.clientX - rect.left) / rect.width * (appState.totalDays || 1)));
          if (!appState.workDays[uid] || appState.workDays[uid] === 0) appState.workDays[uid] = 1;
          appState.workStart[uid] = dayPos;
          if (!appState.workMovedManually) appState.workMovedManually = {};
          appState.workMovedManually[uid] = true;
          console.log('[gantt drop] ✅ placed uid:', uid, '| start day:', dayPos, '| days:', appState.workDays[uid]);
          console.log('[gantt drop] trk.uid vs label.uid:', trk.dataset.uid, '===', uid, trk.dataset.uid === uid);
        } else {
          console.warn('[gantt drop] ❌ track not found — drop ignored');
        }
        recalcAllStageDaysAuto();
        _renderGanttWorks(wrap);
        console.log('[gantt drop] after render workDays[uid]:', appState.workDays[uid], '| workStart[uid]:', appState.workStart[uid], '| movedManually:', appState.workMovedManually[uid]);
        _renderGanttRuler();
        _onDurationChanged();
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      }

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  });

  // ── Drag бара (перемещение) ──────────────────────────────────────
  wrap.querySelectorAll('.gantt-work-bar').forEach(bar => {
    const uid = bar.dataset.uid;
    bar.addEventListener('mousedown', e => {
      if (e.target.classList.contains('gantt-handle')) return;
      e.preventDefault(); e.stopPropagation();
      const track   = bar.closest('.gantt-track');
      const trackW  = track.getBoundingClientRect().width;
      const startX  = e.clientX;
      const origStart = appState.workStart[uid] || 0;
      const tDays   = appState.totalDays || 1;
      document.body.style.cursor = 'grabbing';
      document.body.style.userSelect = 'none';
      function onMove(ev) {
        const delta = Math.round((ev.clientX - startX) / trackW * tDays);
        appState.workStart[uid] = Math.max(0, origStart + delta);
        if (!appState.workMovedManually) appState.workMovedManually = {};
        appState.workMovedManually[uid] = true;
        _renderGanttWorks(wrap); _renderGanttRuler();
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

  // ── Resize правым handle ─────────────────────────────────────────
  wrap.querySelectorAll('.gantt-work-handle[data-edge="right"]').forEach(h => {
    h.addEventListener('mousedown', e => {
      e.preventDefault(); e.stopPropagation();
      const uid    = h.dataset.uid;
      const track  = h.closest('.gantt-track');
      const trackW = track.getBoundingClientRect().width;
      const startX = e.clientX;
      const origD  = appState.workDays[uid] || 1;
      const tDays  = appState.totalDays || 1;
      document.body.style.cursor = 'ew-resize'; document.body.style.userSelect = 'none';
      function onMove(ev) {
        const delta = Math.round((ev.clientX - startX) / trackW * tDays);
        appState.workDays[uid] = Math.max(1, origD + delta);
        if (!appState.workMovedManually) appState.workMovedManually = {};
        appState.workMovedManually[uid] = true;
        _renderGanttWorks(wrap); _renderGanttRuler();
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

// ── Ruler ──────────────────────────────────────────────────────────

function _renderGanttRuler() {
  const ruler = document.getElementById('ganttRuler');
  if (!ruler) return;
  ruler.innerHTML = '';
  const totalDays = Math.max(parseInt(document.getElementById('totalDaysSlider')?.value) || appState.totalDays || 0, 7);
  if (!totalDays) return;

  const spacer = document.getElementById('ganttRulerSpacer');
  if (spacer) {
    spacer.style.width = (appState.ganttMode === 'works') ? 'calc(280px + 14px)' : 'calc(230px + 14px)';
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

// ── DOM-обновление одного бара (drag handles) ──────────────────────

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

// ── Global mouse listeners для drag баров ──────────────────────────

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
      let rawPct = Math.round(Math.max(0, Math.min(origPct + dpct, origPct + origW - snap)) / snap) * snap;
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
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    _onDurationChanged();
  });
}
