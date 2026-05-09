// ─── smeta-payments.js ─────────────────────────────────────────────
// Блок 5: График платежей.
// Drag-and-drop этапов в слоты оплаты.
// Поддержка разбивки аванс/остаток — глобально и на каждый платёж отдельно.

import { appState }              from '../state.js';
import { fmtInt, esc }           from './smeta-utils.js';
import { getSmrTotal }           from './smeta-tables-smr.js';
import { getMatTotal }           from './smeta-tables-mat.js';

// ── Константы ──────────────────────────────────────────────────────

const PCT_STEP    = 5;
const PCT_OPTIONS = Array.from({ length: 20 }, (_, i) => (i + 1) * PCT_STEP); // [5,10,...,100]
const DEFAULT_ADVANCE_PCT = 50;

// ── Приватные хелперы ──────────────────────────────────────────────

function _getStageAmount(stageName) {
  let total = 0, inSection = false;
  for (const r of appState.smrRows) {
    if (r.isSection) { inSection = (r.name?.trim() === stageName); continue; }
    if (inSection) total += r.total || 0;
  }
  return total;
}

function _getStagesTotalReal() {
  return appState.stages.reduce((s, st) => s + _getStageAmount(st.name), 0);
}

// Получить эффективный процент аванса для платежа:
// локальный если задан, иначе глобальный из appState
function _effectivePct(payment) {
  const local = payment.advancePct;
  if (local != null && local >= 0 && local <= 100) return local;
  return appState.defaultAdvancePct ?? DEFAULT_ADVANCE_PCT;
}

// ── Рендер контрола процента ───────────────────────────────────────
// container  — DOM-элемент куда вставляем
// currentPct — текущее значение (null = «по умолчанию» для локального)
// onChange   — коллбэк при изменении: onChange(pct|null)
// isGlobal   — если true, рисуем глобальную версию с подписью

function _renderPctControl(container, currentPct, onChange, isGlobal) {
  const wrap = document.createElement('div');
  wrap.className = 'pay-pct-wrap' + (isGlobal ? ' pay-pct-wrap--global' : '');

  if (isGlobal) {
    const lbl = document.createElement('span');
    lbl.className = 'pay-pct-global-lbl';
    lbl.textContent = 'Аванс по умолчанию:';
    wrap.appendChild(lbl);
  }

  // Дропдаун
  const select = document.createElement('select');
  select.className = 'pay-pct-select';

  if (!isGlobal) {
    // Первый пункт — наследовать глобальный
    const optDefault = document.createElement('option');
    optDefault.value = '';
    const globalPct = appState.defaultAdvancePct ?? DEFAULT_ADVANCE_PCT;
    optDefault.textContent = `По умолчанию (${globalPct}%)`;
    select.appendChild(optDefault);
  }

  PCT_OPTIONS.forEach(pct => {
    const opt = document.createElement('option');
    opt.value = pct;
    opt.textContent = pct + '%';
    if (pct === currentPct) opt.selected = true;
    select.appendChild(opt);
  });

  // Если текущее значение нестандартное — добавить отдельным пунктом
  if (currentPct != null && !PCT_OPTIONS.includes(currentPct)) {
    const optCustom = document.createElement('option');
    optCustom.value = currentPct;
    optCustom.textContent = currentPct + '%';
    optCustom.selected = true;
    select.appendChild(optCustom);
  }

  if (!isGlobal && currentPct == null) {
    select.value = '';
  } else if (currentPct != null) {
    select.value = String(currentPct);
  }

  select.addEventListener('change', e => {
    const val = e.target.value === '' ? null : Number(e.target.value);
    onChange(val);
  });

  wrap.appendChild(select);

  // Поле ручного ввода произвольного %
  const manualInp = document.createElement('input');
  manualInp.className   = 'pay-pct-manual';
  manualInp.type        = 'number';
  manualInp.min         = '0';
  manualInp.max         = '100';
  manualInp.placeholder = 'или %';
  manualInp.addEventListener('change', e => {
    let v = parseInt(e.target.value);
    if (isNaN(v)) { e.target.value = ''; return; }
    v = Math.max(0, Math.min(100, v));
    e.target.value = v;
    onChange(v);
  });

  wrap.appendChild(manualInp);
  container.appendChild(wrap);
}

// ── Публичный API ──────────────────────────────────────────────────

export function renderPayments() {
  const wrap = document.getElementById('paymentsWrap');
  if (!wrap) return;

  // Инициализируем поле в state если ещё нет
  if (appState.defaultAdvancePct == null) appState.defaultAdvancePct = DEFAULT_ADVANCE_PCT;

  const grandTotal = getSmrTotal() + getMatTotal();
  wrap.innerHTML = '';

  // ── Глобальная панель аванса ──────────────────────────────────────
  const globalBar = document.createElement('div');
  globalBar.className = 'pay-global-bar';

  _renderPctControl(
    globalBar,
    appState.defaultAdvancePct,
    (pct) => {
      appState.defaultAdvancePct = pct ?? DEFAULT_ADVANCE_PCT;
      renderPayments();
    },
    true
  );

  const globalHint = document.createElement('span');
  globalHint.className = 'pay-global-hint';
  globalHint.textContent = 'Применяется ко всем платежам. Можно переопределить на каждом отдельно.';
  globalBar.appendChild(globalHint);

  wrap.appendChild(globalBar);

  // ── Основной layout ───────────────────────────────────────────────
  const layout = document.createElement('div');
  layout.className = 'pay-layout';

  // ── Левая колонка: слоты ──────────────────────────────────────────
  const leftCol = document.createElement('div');
  leftCol.className = 'pay-left';

  appState.payments.forEach((p, pi) => {
    const amount    = p.stageIds.reduce((s, id) => {
      const st = appState.stages.find(x => x.id === id);
      return s + (st ? _getStageAmount(st.name) : 0);
    }, 0);

    const totalReal = _getStagesTotalReal() || grandTotal || 1;
    const sharePct  = totalReal > 0 ? Math.round(amount / totalReal * 100) : 0;

    // Аванс / остаток
    const advPct    = _effectivePct(p);
    const remPct    = 100 - advPct;
    const advAmount = Math.round(amount * advPct / 100);
    const remAmount = amount - advAmount;

    // Флаг локального переопределения
    const isLocalPct = p.advancePct != null;

    const card = document.createElement('div');
    card.className = 'pay-slot';
    card.dataset.pi = pi;

    const tagsHtml = p.stageIds.map(id => {
      const st = appState.stages.find(x => x.id === id);
      if (!st) return '';
      return `<span class="pay-tag" style="border-color:${st.color};color:${st.color}" data-sid="${id}" data-pi="${pi}">
        ${esc(st.name)}
        <span class="pay-tag-x" data-sid="${id}" data-pi="${pi}">×</span>
      </span>`;
    }).join('');

    card.innerHTML = `
      <div class="pay-slot-head">
        <input class="pay-slot-name" value="${esc(p.name)}" data-pi="${pi}">
        <button class="pay-slot-del" data-pi="${pi}" title="Удалить платёж">×</button>
      </div>
      <div class="pay-slot-tags" data-pi="${pi}">
        ${tagsHtml || '<span class="pay-slot-empty">Перетащите этапы сюда</span>'}
      </div>
      <div class="pay-slot-totals">
        <div class="pay-slot-total-row pay-slot-total-row--main">
          <span class="pay-slot-total-lbl">Итого</span>
          <span class="pay-slot-total-val">${fmtInt(amount)} ₽</span>
          <span class="pay-slot-share-pct">${sharePct}% от проекта</span>
        </div>
        <div class="pay-slot-total-row pay-slot-total-row--advance">
          <span class="pay-slot-total-lbl">Аванс ${advPct}%${isLocalPct ? ' ✎' : ''}</span>
          <span class="pay-slot-total-val pay-slot-advance">${fmtInt(advAmount)} ₽</span>
        </div>
        <div class="pay-slot-total-row pay-slot-total-row--remainder">
          <span class="pay-slot-total-lbl">Остаток ${remPct}%${isLocalPct ? ' ✎' : ''}</span>
          <span class="pay-slot-total-val pay-slot-remainder">${fmtInt(remAmount)} ₽</span>
        </div>
      </div>
      <div class="pay-slot-pct-control" data-pi="${pi}"></div>`;

    card.addEventListener('dragover',  e => { e.preventDefault(); card.classList.add('drag-over'); });
    card.addEventListener('dragleave', ()  => card.classList.remove('drag-over'));
    card.addEventListener('drop', e => {
      e.preventDefault();
      card.classList.remove('drag-over');
      const sid = e.dataTransfer.getData('stageId');
      if (sid && !p.stageIds.includes(sid)) {
        p.stageIds.push(sid);
        renderPayments();
      }
    });

    leftCol.appendChild(card);

    // Локальный контрол процента — вставляем после innerHTML
    const pctControlEl = card.querySelector('.pay-slot-pct-control');
    _renderPctControl(
      pctControlEl,
      p.advancePct ?? null,
      (val) => {
        appState.payments[pi].advancePct = val;
        renderPayments();
      },
      false
    );
  });

  // Кнопка добавления платежа
  const addBtn = document.createElement('button');
  addBtn.className   = 'pay-add-slot-btn';
  addBtn.textContent = '+ Добавить этап оплаты';
  addBtn.addEventListener('click', () => {
    const num = appState.payments.length + 1;
    appState.payments.push({
      id:         'p' + (++appState.payCounter),
      name:       'Платёж ' + num,
      stageIds:   [],
      advancePct: null, // null = наследует глобальный
    });
    renderPayments();
  });
  leftCol.appendChild(addBtn);

  // ── Правая колонка: пул этапов ────────────────────────────────────
  const rightCol = document.createElement('div');
  rightCol.className = 'pay-right';

  const rightHead = document.createElement('div');
  rightHead.className   = 'pay-right-head';
  rightHead.textContent = 'Этапы работ';
  rightCol.appendChild(rightHead);

  if (!appState.stages.length) {
    const empty = document.createElement('div');
    empty.className   = 'pay-right-empty';
    empty.textContent = 'Добавьте этапы в Ганtt';
    rightCol.appendChild(empty);
  } else {
    appState.stages.forEach(s => {
      const stageDays = Math.max(1, Math.round(appState.totalDays * s.w / 100));
      const stageAmt  = _getStageAmount(s.name);
      const pill = document.createElement('div');
      pill.className   = 'pay-stage-pill';
      pill.draggable   = true;
      pill.dataset.sid = s.id;
      pill.innerHTML   = `
        <span class="pay-stage-pill-dot" style="background:${s.color}"></span>
        <span class="pay-stage-pill-name">${esc(s.name)}</span>
        <span class="pay-stage-pill-info">${stageDays} дн. · ${fmtInt(stageAmt)} ₽</span>`;
      pill.addEventListener('dragstart', e => {
        e.dataTransfer.setData('stageId', s.id);
        pill.classList.add('dragging');
      });
      pill.addEventListener('dragend', () => pill.classList.remove('dragging'));
      rightCol.appendChild(pill);
    });
  }

  layout.appendChild(leftCol);
  layout.appendChild(rightCol);
  wrap.appendChild(layout);

  // ── Bind events ───────────────────────────────────────────────────

  wrap.querySelectorAll('.pay-slot-name').forEach(inp => {
    inp.addEventListener('input', e => {
      appState.payments[+e.target.dataset.pi].name = e.target.value;
    });
  });

  wrap.querySelectorAll('.pay-slot-del').forEach(btn => {
    btn.addEventListener('click', e => {
      appState.payments.splice(+e.target.dataset.pi, 1);
      renderPayments();
    });
  });

  wrap.querySelectorAll('.pay-tag-x').forEach(x => {
    x.addEventListener('click', e => {
      e.stopPropagation();
      const pi  = +e.target.dataset.pi;
      const sid = e.target.dataset.sid;
      appState.payments[pi].stageIds = appState.payments[pi].stageIds.filter(id => id !== sid);
      renderPayments();
    });
  });
}
