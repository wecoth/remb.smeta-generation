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
    name:         r.name,
    floor:        parseFloat(r.floorArea)        || 0,
    wallsNominal: parseFloat(r.wallsAreaNominal) || parseFloat(r.wallsArea) || 0,
    walls:        parseFloat(r.wallsArea)        || 0,
    perim:        parseFloat(r.perimeter)        || 0,
    windows:      parseFloat(r.windowAreaM2)     || 0,
    reveals:      parseFloat(r.windowRevealsLm)  || 0,
    outerAngles:  parseFloat(r.outerAnglesLm)    || 0,
    narrowWalls:  parseFloat(r.narrowWallsLm)    || 0,
  }));
  _renderExpl();
  if (_onRoomsChanged) _onRoomsChanged();
}

// ── Синхронизация из appState ──────────────────────────────────────
function _syncRoomsFromState() {
  _rooms = (appState.rooms || []).map(r => ({
    name:          r.name,
    floor:         r.area,
    wallsNominal:  r.metrics?.wallAreaNominalM2 ?? r.metrics?.wallAreaNetM2 ?? r.wallArea,
    walls:         r.metrics?.wallAreaNetM2     ?? r.wallArea,
    perim:         r.metrics?.perimeterFloorM   ?? r.perimeter,
    windows:       r.metrics?.windowAreaM2      ?? 0,
    reveals:       r.metrics?.windowRevealsLm   ?? 0,
    outerAngles:   r.metrics?.outerAnglesLm     ?? 0,
    narrowWalls:   r.metrics?.narrowWallsLm     ?? 0,
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

  const fmt = v => (v > 0) ? v.toFixed(2) : '—';
  let totFloor = 0, totWallsN = 0, totWalls = 0, totPerim = 0;
  let totWin = 0, totRev = 0, totAng = 0, totNarrow = 0;

  // ── Legacy drawer ────────────────────────────────────────────────
  let drawerHtml = _rooms.map(r => {
    totFloor   += r.floor;   totWallsN += r.wallsNominal;
    totWalls   += r.walls;   totPerim  += r.perim;
    totWin     += r.windows; totRev    += r.reveals;
    totAng     += r.outerAngles; totNarrow += r.narrowWalls;
    return `<div class="expl-row">
      <span class="expl-name">${esc(r.name)}</span>
      <span class="expl-num">${r.floor.toFixed(2)}</span>
      <span class="expl-num">${r.perim.toFixed(2)}</span>
      <span class="expl-num">${fmt(r.wallsNominal)}</span>
      <span class="expl-num">${fmt(r.walls)}</span>
      <span class="expl-num">${fmt(r.windows)}</span>
      <span class="expl-num">${fmt(r.reveals)}</span>
      <span class="expl-num">${fmt(r.outerAngles)}</span>
      <span class="expl-num">${fmt(r.narrowWalls)}</span>
    </div>`;
  }).join('');
  drawerHtml += `<div class="expl-row expl-total">
    <span class="expl-name">Итого</span>
    <span class="expl-num">${totFloor.toFixed(2)}</span>
    <span class="expl-num">${totPerim.toFixed(2)}</span>
    <span class="expl-num">${fmt(totWallsN)}</span>
    <span class="expl-num">${fmt(totWalls)}</span>
    <span class="expl-num">${fmt(totWin)}</span>
    <span class="expl-num">${fmt(totRev)}</span>
    <span class="expl-num">${fmt(totAng)}</span>
    <span class="expl-num">${fmt(totNarrow)}</span>
  </div>`;
  if (body) body.innerHTML = drawerHtml;

  // ── Inline header table ──────────────────────────────────────────
  totFloor = 0; totWallsN = 0; totWalls = 0; totPerim = 0;
  totWin = 0; totRev = 0; totAng = 0; totNarrow = 0;
  let rows = _rooms.map(r => {
    totFloor   += r.floor;   totWallsN += r.wallsNominal;
    totWalls   += r.walls;   totPerim  += r.perim;
    totWin     += r.windows; totRev    += r.reveals;
    totAng     += r.outerAngles; totNarrow += r.narrowWalls;
    return `<tr>
      <td>${esc(r.name)}</td>
      <td>${r.floor.toFixed(2)}</td>
      <td>${r.perim.toFixed(2)}</td>
      <td>${fmt(r.wallsNominal)}</td>
      <td>${fmt(r.walls)}</td>
      <td>${fmt(r.windows)}</td>
      <td>${fmt(r.reveals)}</td>
      <td>${fmt(r.outerAngles)}</td>
      <td>${fmt(r.narrowWalls)}</td>
    </tr>`;
  }).join('');
  rows += `<tr class="expl-total">
    <td>Итого</td>
    <td>${totFloor.toFixed(2)}</td>
    <td>${totPerim.toFixed(2)}</td>
    <td>${fmt(totWallsN)}</td>
    <td>${fmt(totWalls)}</td>
    <td>${fmt(totWin)}</td>
    <td>${fmt(totRev)}</td>
    <td>${fmt(totAng)}</td>
    <td>${fmt(totNarrow)}</td>
  </tr>`;
  if (wrap) wrap.innerHTML = `<table class="obj-expl-tbl">
    <thead><tr>
      <th>Помещение</th>
      <th title="Площадь пола, м²">Пол м²</th>
      <th title="Периметр, м.п.">Пер. м</th>
      <th title="Площадь стен номинальная (до вычета узких простенков), м²">Стены номин. м²</th>
      <th title="Площадь стен чистая (минус участки < 50 см), м²">Стены чист. м²</th>
      <th title="Площадь окон, м²">Окна м²</th>
      <th title="Откосы окон: 3 стороны каждого окна, м.п.">Откосы м.п.</th>
      <th title="Внешние углы стен + откосов, м.п.">Углы м.п.</th>
      <th title="Узкие простенки < 50 см: погонаж, м.п.">Простенки м.п.</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}
