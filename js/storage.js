// ─── STORAGE.JS ───────────────────────────────────────────────────
import { appState } from './state.js';
import { _uid } from './smeta/smeta-utils.js';

const LS_KEY = 'remb_project_v1';

function nextId(items, field = 'id', min = 1) {
  let maxId = min - 1;
  for (const item of items || []) {
    const v = Number(item?.[field]);
    if (Number.isFinite(v) && v > maxId) maxId = v;
  }
  return Math.max(min, maxId + 1);
}

export function saveProject() {
  const walls = appState.walls.map(w => ({ ...w }));
  const openings = appState.openings.map(o => ({ ...o }));
  const dividers = (appState.dividers || []).map(d => ({ ...d }));
  const measures = (appState.measures || []).map(m => ({ ...m }));

  const data = {
    walls,
    openings,
    dividers,
    measures,
    roomNameOverrides: { ...appState.roomNameOverrides },
    dimensionOffsets: { ...(appState.dimensionOffsets || {}) },
    idWall: appState.idWall ?? nextId(walls, 'id', 1),
    idOpen: appState.idOpen ?? nextId(openings, 'id', 1),
    idDivider: appState.idDivider ?? nextId(dividers, 'id', 1),
    idMeasure: appState.idMeasure ?? nextId(measures, 'id', 1),
    smrRows: (appState.smrRows || []).map(r => ({ ...r })),
    smrRowsMasters: (appState.smrRowsMasters || []).map(r => ({ ...r })),
    smrMode: appState.smrMode || 'client',
    matRows: (appState.matRows || []).map(r => ({ ...r })),
    stages: (appState.stages || []).map(s => ({ ...s })),
    payments: (appState.payments || []).map(p => ({ ...p, stageIds: [...(p.stageIds || [])] })),
    totalDays: appState.totalDays ?? 60,
    stageCounter: appState.stageCounter ?? 0,
    payCounter: appState.payCounter ?? 0,
    // UI-параметры
    wallOffset: appState.wallOffset ?? 'left',
    defaultDoorHinge: appState.defaultDoorHinge ?? 'start',
    defaultDoorSwing: appState.defaultDoorSwing ?? 1,
    inpWallThick: appState.inpWallThick ?? 200,
    inpWallHeight: appState.inpWallHeight ?? 2700,
    inpWindowWidth: appState.inpWindowWidth ?? 1200,
    inpWindowHeight: appState.inpWindowHeight ?? 1500,
    inpDoorWidth: appState.inpDoorWidth ?? 900,
    inpDoorHeight: appState.inpDoorHeight ?? 2100,
    savedAt: Date.now(),
  };
  return JSON.stringify(data);
}

export function loadProject(jsonStr) {
  const data = JSON.parse(jsonStr);
  appState.walls = (data.walls || []).map(w => ({ ...w }));
  appState.openings = (data.openings || []).map(o => ({ ...o }));
  appState.dividers = (data.dividers || []).map(d => ({ ...d }));
  appState.measures = (data.measures || []).map(m => ({ ...m }));
  appState.roomNameOverrides = data.roomNameOverrides || {};
  appState.dimensionOffsets = data.dimensionOffsets || {};
  appState.idWall = Number.isFinite(Number(data.idWall)) ? Number(data.idWall) : nextId(appState.walls, 'id', 1);
  appState.idOpen = Number.isFinite(Number(data.idOpen)) ? Number(data.idOpen) : nextId(appState.openings, 'id', 1);
  appState.idDivider = Number.isFinite(Number(data.idDivider)) ? Number(data.idDivider) : nextId(appState.dividers, 'id', 1);
  appState.idMeasure = Number.isFinite(Number(data.idMeasure)) ? Number(data.idMeasure) : nextId(appState.measures, 'id', 1);

  if (data.smrRows !== undefined) appState.smrRows = (data.smrRows || []).map(r => ({ ...r }));
  if (data.smrRowsMasters !== undefined) appState.smrRowsMasters = (data.smrRowsMasters || []).map(r => ({ ...r }));
  if (appState.smrRows) {
    appState.smrRows = appState.smrRows.map(r => ({ ...r, _uid: r._uid || _uid() }));
  }
  if (appState.smrRowsMasters) {
    appState.smrRowsMasters = appState.smrRowsMasters.map(r => ({ ...r, _uid: r._uid || _uid() }));
  }
  if (data.smrMode !== undefined) appState.smrMode = data.smrMode || 'client';
  if (data.matRows !== undefined) appState.matRows = (data.matRows || []).map(r => ({ ...r }));
  if (data.stages !== undefined) appState.stages = (data.stages || []).map(s => ({ ...s }));
  if (data.payments !== undefined) appState.payments = (data.payments || []).map(p => ({ ...p, stageIds: [...(p.stageIds || [])] }));
  if (data.totalDays !== undefined) appState.totalDays = data.totalDays ?? 60;
  if (data.stageCounter !== undefined) appState.stageCounter = data.stageCounter ?? 0;
  if (data.payCounter !== undefined) appState.payCounter = data.payCounter ?? 0;

  appState.wallOffset = data.wallOffset ?? 'left';
  appState.defaultDoorHinge = data.defaultDoorHinge ?? 'start';
  appState.defaultDoorSwing = data.defaultDoorSwing ?? 1;
  appState.inpWallThick = data.inpWallThick ?? 200;
  appState.inpWallHeight = data.inpWallHeight ?? 2700;
  appState.inpWindowWidth = data.inpWindowWidth ?? 1200;
  appState.inpWindowHeight = data.inpWindowHeight ?? 1500;
  appState.inpDoorWidth = data.inpDoorWidth ?? 900;
  appState.inpDoorHeight = data.inpDoorHeight ?? 2100;
}

export function autosaveToLocalStorage() {
  try { localStorage.setItem(LS_KEY, saveProject()); } catch {}
}

export function loadFromLocalStorage() {
  try {
    const data = localStorage.getItem(LS_KEY);
    if (data) { loadProject(data); return true; }
  } catch {}
  return false;
}

export function downloadProject() {
  const street = document.getElementById('hdrStreet')?.value?.trim() || '';
  const house  = document.getElementById('hdrHouse')?.value?.trim()  || '';
  const flat   = document.getElementById('hdrFlat')?.value?.trim()   || '';
  const addressParts = [street, house, flat ? 'кв. ' + flat : ''].filter(Boolean);
  const address = addressParts.join(', ');

  function _doDownload(filename) {
    const json = saveProject();
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename.endsWith('.json') ? filename : filename + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }

  if (address) {
    _doDownload('Проект — ' + address);
  } else {
    _promptFilename(name => {
      if (name !== null) _doDownload(name || 'remb_project');
    });
  }
}

function _promptFilename(callback) {
  document.getElementById('_rembSaveModal')?.remove();
  const overlay = document.createElement('div');
  overlay.id = '_rembSaveModal';
  overlay.style.cssText = `
    position:fixed;inset:0;z-index:99999;
    background:rgba(0,0,0,.45);
    display:flex;align-items:center;justify-content:center;
  `;
  const box = document.createElement('div');
  box.style.cssText = `
    background:#fff;border-radius:14px;padding:28px 28px 22px;
    box-shadow:0 8px 40px rgba(0,0,0,.22);
    width:340px;font-family:Onest,Inter,sans-serif;
  `;
  box.innerHTML = `
    <div style="font-size:15px;font-weight:600;color:#1a1a2e;margin-bottom:6px">Сохранить проект</div>
    <div style="font-size:12px;color:#888;margin-bottom:16px">Укажите название файла</div>
    <input id="_rembSaveInput" type="text" placeholder="Название проекта"
      style="width:100%;box-sizing:border-box;padding:9px 12px;border:1.5px solid #d1d5db;
             border-radius:8px;font-size:14px;outline:none;font-family:inherit;
             transition:border-color .15s;" />
    <div style="display:flex;gap:8px;margin-top:14px;justify-content:flex-end">
      <button id="_rembSaveCancel"
        style="padding:8px 18px;border-radius:8px;border:1.5px solid #e5e7eb;
               background:#fff;font-size:13px;font-family:inherit;cursor:pointer;color:#555">
        Отмена
      </button>
      <button id="_rembSaveOk"
        style="padding:8px 22px;border-radius:8px;border:none;
               background:#1a1a2e;color:#fff;font-size:13px;font-family:inherit;cursor:pointer">
        Сохранить
      </button>
    </div>
  `;
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  const inp = box.querySelector('#_rembSaveInput');
  const btnOk = box.querySelector('#_rembSaveOk');
  const btnCancel = box.querySelector('#_rembSaveCancel');
  inp.focus();
  inp.addEventListener('focus', () => inp.style.borderColor = '#4a6fe3');
  inp.addEventListener('blur',  () => inp.style.borderColor = '#d1d5db');
  function _close(result) {
    overlay.remove();
    callback(result);
  }
  btnOk.addEventListener('click', () => _close(inp.value.trim() || 'remb_project'));
  btnCancel.addEventListener('click', () => _close(null));
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') _close(inp.value.trim() || 'remb_project');
    if (e.key === 'Escape') _close(null);
  });
  overlay.addEventListener('click', e => { if (e.target === overlay) _close(null); });
}

export function uploadProject(file, onLoaded) {
  const r = new FileReader();
  r.onload = e => { try { loadProject(e.target.result); onLoaded?.(null); } catch (err) { onLoaded?.(err); } };
  r.readAsText(file);
}
