// ─── smeta-payments.js ─────────────────────────────────────────────
// Блок 5: График платежей.
// Drag-and-drop этапов в слоты оплаты.

import { appState }              from '../state.js';
import { fmtInt, esc }           from './smeta-utils.js';
import { getSmrTotal }           from './smeta-tables-smr.js';
import { getMatTotal }           from './smeta-tables-mat.js';

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

// ── Публичный API ──────────────────────────────────────────────────

export function renderPayments() {
  const wrap = document.getElementById('paymentsWrap');
  if (!wrap) return;
  const grandTotal = getSmrTotal() + getMatTotal();

  wrap.innerHTML = '';

  const layout   = document.createElement('div');
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
    const pct       = totalReal > 0 ? Math.round(amount / totalReal * 100) : 0;

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
        <button class="pay-slot-del" data-pi="${pi}">×</button>
      </div>
      <div class="pay-slot-tags" data-pi="${pi}">${tagsHtml || '<span class="pay-slot-empty">Перетащите этапы сюда</span>'}</div>
      <div class="pay-slot-total">${fmtInt(amount)} ₽ <span class="pay-slot-pct">${pct}%</span></div>`;

    card.addEventListener('dragover', e => { e.preventDefault(); card.classList.add('drag-over'); });
    card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
    card.addEventListener('drop', e => {
      e.preventDefault();
      card.classList.remove('drag-over');
      const sid = e.dataTransfer.getData('stageId');
      if (sid && !p.stageIds.includes(sid)) { p.stageIds.push(sid); renderPayments(); }
    });
    leftCol.appendChild(card);
  });

  const addBtn = document.createElement('button');
  addBtn.className = 'pay-add-slot-btn';
  addBtn.textContent = '+ Добавить этап оплаты';
  addBtn.addEventListener('click', () => {
    appState.payments.push({ id: 'p' + (++appState.payCounter), name: 'Платёж ' + appState.payments.length, stageIds: [] });
    renderPayments();
  });
  leftCol.appendChild(addBtn);

  // ── Правая колонка: пул этапов ────────────────────────────────────
  const rightCol = document.createElement('div');
  rightCol.className = 'pay-right';
  const rightHead = document.createElement('div');
  rightHead.className = 'pay-right-head';
  rightHead.textContent = 'Этапы работ';
  rightCol.appendChild(rightHead);

  if (!appState.stages.length) {
    const empty = document.createElement('div');
    empty.className = 'pay-right-empty';
    empty.textContent = 'Добавьте этапы в Ганtt';
    rightCol.appendChild(empty);
  } else {
    appState.stages.forEach(s => {
      const stageDays = Math.max(1, Math.round(appState.totalDays * s.w / 100));
      const stageAmt  = _getStageAmount(s.name);
      const pill = document.createElement('div');
      pill.className = 'pay-stage-pill';
      pill.draggable = true;
      pill.dataset.sid = s.id;
      pill.innerHTML = `<span class="pay-stage-pill-dot" style="background:${s.color}"></span>
        <span class="pay-stage-pill-name">${esc(s.name)}</span>
        <span class="pay-stage-pill-info">${stageDays} дн. · ${fmtInt(stageAmt)} ₽</span>`;
      pill.addEventListener('dragstart', e => { e.dataTransfer.setData('stageId', s.id); pill.classList.add('dragging'); });
      pill.addEventListener('dragend', () => pill.classList.remove('dragging'));
      rightCol.appendChild(pill);
    });
  }

  layout.appendChild(leftCol);
  layout.appendChild(rightCol);
  wrap.appendChild(layout);

  // Bind events
  wrap.querySelectorAll('.pay-slot-name').forEach(inp => {
    inp.addEventListener('input', e => { appState.payments[+e.target.dataset.pi].name = e.target.value; });
  });
  wrap.querySelectorAll('.pay-slot-del').forEach(btn => {
    btn.addEventListener('click', e => { appState.payments.splice(+e.target.dataset.pi, 1); renderPayments(); });
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
