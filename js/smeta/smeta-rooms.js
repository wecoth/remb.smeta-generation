// ─── smeta-rooms.js ────────────────────────────────────────────────
// Синхронизация помещений из планировщика и рендер экспликации.
// Подписывается на EventBus('rooms:computed').
// Вызывает _updateHeader() из smeta-header через переданный колбэк.

import { appState } from '../state.js';
import { EventBus }  from '../eventBus.js';
import { esc }       from './smeta-utils.js';

let _rooms = [];
let _onRoomsChanged = null; // колбэк → _updateHeader из smeta-header

// ── Инициализация ──────────────────────────────────────────────────
export function initRooms(onRoomsChangedCb) {
  _onRoomsChanged = onRoomsChangedCb;

  EventBus.on('rooms:computed', () => {
    _syncRoomsFromState();
    _renderExpl();
    if (_onRoomsChanged) _onRoomsChanged();
  });

  // Если комнаты уже загружены (из localStorage) — сразу показать
  if (appState.rooms && appState.rooms.length) {
    _syncRoomsFromState();
    _renderExpl();
  }
}

// ── Внешний вызов (из планировщика напрямую) ──────────────────────
export function importRoomsFromPlanner(rooms) {
  _rooms = rooms.map(r => ({
    name:  r.name,
    floor: parseFloat(r.floorArea)  || 0,
    walls: parseFloat(r.wallsArea)  || 0,
    perim: parseFloat(r.perimeter)  || 0,
  }));
  _renderExpl();
  if (_onRoomsChanged) _onRoomsChanged();
}

// ── Синхронизация из appState ──────────────────────────────────────
function _syncRoomsFromState() {
  _rooms = (appState.rooms || []).map(r => ({
    name:  r.name,
    floor: r.area,
    walls: r.metrics?.wallAreaNetM2 ?? r.wallArea,
    perim: r.metrics?.perimeterFloorM ?? r.perimeter,
  }));
}

// ── Рендер экспликации ─────────────────────────────────────────────
function _renderExpl() {
  const body = document.getElementById('explBody');    // legacy drawer
  const wrap = document.getElementById('objExplWrap'); // inline header table

  if (!_rooms.length) {
    const empty = '<div class="obj-expl-empty">Нет данных. Создайте план на вкладке Чертёж.</div>';
    if (body) body.innerHTML = '<div class="expl-empty">Нет данных. Создайте план на вкладке Чертёж.</div>';
    if (wrap) wrap.innerHTML = empty;
    return;
  }

  let tf = 0, tw = 0, tp = 0;

  // ── Legacy drawer ────────────────────────────────────────────────
  let drawerHtml = _rooms.map(r => {
    tf += r.floor; tw += r.walls; tp += r.perim;
    return `<div class="expl-row">
      <span class="expl-name">${esc(r.name)}</span>
      <span class="expl-num">${r.floor.toFixed(1)}</span>
      <span class="expl-num">${r.walls.toFixed(1)}</span>
      <span class="expl-num">${r.perim.toFixed(1)}</span>
    </div>`;
  }).join('');
  drawerHtml += `<div class="expl-row expl-total">
    <span class="expl-name">Итого</span>
    <span class="expl-num">${tf.toFixed(1)}</span>
    <span class="expl-num">${tw.toFixed(1)}</span>
    <span class="expl-num">${tp.toFixed(1)}</span>
  </div>`;
  if (body) body.innerHTML = drawerHtml;

  // ── Inline header table ──────────────────────────────────────────
  tf = 0; tw = 0; tp = 0;
  let rows = _rooms.map(r => {
    tf += r.floor; tw += r.walls; tp += r.perim;
    return `<tr>
      <td>${esc(r.name)}</td>
      <td>${r.floor.toFixed(1)}</td>
      <td>${r.walls.toFixed(1)}</td>
      <td>${r.perim.toFixed(1)}</td>
    </tr>`;
  }).join('');
  rows += `<tr class="expl-total">
    <td>Итого</td>
    <td>${tf.toFixed(1)}</td>
    <td>${tw.toFixed(1)}</td>
    <td>${tp.toFixed(1)}</td>
  </tr>`;
  if (wrap) wrap.innerHTML = `<table class="obj-expl-tbl">
    <thead><tr>
      <th>Помещение</th><th>Пол м²</th><th>Стены м²</th><th>Пер. м</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}
