// ─── UI-PLANNER.JS ─────────────────────────────────────────────────
import { appState } from './state.js';
import {
  addWall, deleteSelectedItems, findClosestWall, findClosestWallSel,
  getWallContourPoint, updateWallGeometry, setWallLength, getWallLength,
  invalidateJointCache,
} from './wall.js';
import { addOpening, findClosestOpening, updateDoorOpening } from './opening.js';
import { computeRooms, updateExpl, getComputedRooms, renameRoom } from './room.js';
import {
  snap, setViewport, setModifiers, toScreen, toWorld,
  findObjectSnapCandidate, findGuideCandidate, getNearestGuideAxis,
  projectPointToGuideLineWorld, getSnappedWallResizePoint,
} from './snapping.js';
import {
  redraw, initRenderer, getWallResizeHandles, getOpeningScreenBounds,
  hitTestWallResizeHandle, boundsIntersect, drawAlignedTextBox,
} from './render.js';
import { recordHistory, undoHistory, redoHistory, canUndo, canRedo } from './history.js';

// ── Module state ──────────────────────────────────────────────────
let canvas, canvasWrap;
let tool = 'select';
let isDrawing = false, drawStart = null, drawEnd = null;
let chainMode = false, lengthInput = '', lengthMode = false;
let wallOffset = 'center';
let hoverOpening = null;
let defaultDoorHinge = 'start', defaultDoorSwing = 1;
let selectedItems = [], wallResizeState = null, wallLengthAnchor = 'start';
let scale = 0.12, panX = 200, panY = 150;
let shiftDown = false, ctrlDown = false;
let isPanning = false, panStartX, panStartY, panStartOffX, panStartOffY;
let mouseScreen = null, selectBoxStart = null, selectBoxCurrent = null, selectClickCandidate = null;
let currentGuideLine = null, currentObjectSnap = null;

// ── DOM refs ──────────────────────────────────────────────────────
let dom = {};

export function initPlanner(domRefs) {
  dom = domRefs;
  canvas = domRefs.canvas;
  canvasWrap = domRefs.canvasWrap;

  initRenderer(canvas, canvas.getContext('2d'), () => scale);

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mouseup',   onMouseUp);
  window.addEventListener('mouseup',   onMouseUp);
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup',   onKeyUp);

  // Tool buttons (event delegation)
  dom.toolGrid?.addEventListener('click', e => {
    const btn = e.target.closest('[data-tool]');
    if (btn) setTool(btn.dataset.tool);
  });

  // Wall offset buttons (delegation)
  dom.offsetBtns?.addEventListener('click', e => {
    const btn = e.target.closest('[data-offset]');
    if (!btn) return;
    dom.offsetBtns.querySelectorAll('.offset-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    wallOffset = btn.dataset.offset;
  });

  // Door hinge/swing defaults (delegation)
  dom.doorHingeButtons?.addEventListener('click', e => {
    const btn = e.target.closest('[data-default-door-hinge]');
    if (!btn) return;
    defaultDoorHinge = btn.dataset.defaultDoorHinge;
    syncDoorButtons();
    doRedraw();
  });
  dom.doorSwingButtons?.addEventListener('click', e => {
    const btn = e.target.closest('[data-default-door-swing]');
    if (!btn) return;
    defaultDoorSwing = Number(btn.dataset.defaultDoorSwing);
    syncDoorButtons();
    doRedraw();
  });

  // Edit panel (delegation — bug #8 fix)
  dom.editContent?.addEventListener('click', e => {
    if (selectedItems.length !== 1) return;
    const wall = selectedItems[0].type === 'wall' ? appState.walls.find(w => w.id === selectedItems[0].id) : null;
    const anchBtn = e.target.closest('[data-wall-anchor]');
    if (anchBtn && wall) { wallLengthAnchor = anchBtn.dataset.wallAnchor === 'end' ? 'end' : 'start'; updateEditPanel(); return; }
    const hingeBtn = e.target.closest('[data-edit-door-hinge]');
    if (hingeBtn && selectedItems[0].type === 'opening') { updateDoorOpening(selectedItems[0].id, { hinge: hingeBtn.dataset.editDoorHinge }); syncDoorButtons(); doRedraw(); return; }
    const swingBtn = e.target.closest('[data-edit-door-swing]');
    if (swingBtn && selectedItems[0].type === 'opening') { updateDoorOpening(selectedItems[0].id, { swing: Number(swingBtn.dataset.editDoorSwing) }); syncDoorButtons(); doRedraw(); }
  });
  dom.editContent?.addEventListener('keydown', e => {
    if (!e.target.matches('[data-wall-length-input]')) return;
    if (e.key === 'Enter') { e.preventDefault(); commitWallLengthInput(e.target); }
  });
  dom.editContent?.addEventListener('change', e => {
    if (e.target.matches('[data-wall-length-input]')) commitWallLengthInput(e.target);
  });

  // Delete button
  dom.btnDeleteSelected?.addEventListener('click', () => {
    if (!selectedItems.length) return;
    deleteSelectedItems(selectedItems);
    clearSelection();
    computeRooms(getWallHeightFallback());
    updateExpl(dom.explBody, dom.roomCount);
    recordHistory();
    doRedraw();
  });

  // Undo/Redo buttons
  dom.btnUndo?.addEventListener('click', () => { undoHistory(onHistoryRestore); updateHistoryBtns(); });
  dom.btnRedo?.addEventListener('click', () => { redoHistory(onHistoryRestore); updateHistoryBtns(); });

  // New project
  dom.btnNew?.addEventListener('click', () => {
    if (!confirm('Создать новый проект? Текущий чертёж будет очищен.')) return;
    appState.walls = []; appState.openings = []; appState.rooms = [];
    appState.idWall = 1; appState.idOpen = 1; appState.roomNameOverrides = {};
    hoverOpening = null; wallResizeState = null;
    resetDrawingState(); clearSelectionBox(); clearSelection();
    updateExpl(dom.explBody, dom.roomCount);
    recordHistory(); doRedraw();
  });

  // Recalc rooms
  dom.btnRecalc?.addEventListener('click', () => {
    computeRooms(getWallHeightFallback());
    updateExpl(dom.explBody, dom.roomCount);
    doRedraw();
  });

  // Zoom
  dom.btnZoomIn?.addEventListener('click',    () => { scale = Math.min(2, scale * 1.25); syncViewport(); doRedraw(); });
  dom.btnZoomOut?.addEventListener('click',   () => { scale = Math.max(0.03, scale / 1.25); syncViewport(); doRedraw(); });
  dom.btnZoomReset?.addEventListener('click', () => { scale = 0.12; panX = 200; panY = 150; syncViewport(); doRedraw(); });

  // Wall param inputs — Bug #9 fix: also update edit panel when thickness/height changes
  const paramInputs = [dom.inpWallThick, dom.inpWallHeight, dom.inpWindowWidth, dom.inpWindowHeight, dom.inpDoorWidth, dom.inpDoorHeight];
  paramInputs.forEach(inp => {
    if (!inp) return;
    inp.addEventListener('change', () => {
      // Bug #10 fix: clamp negative values
      if (Number(inp.value) < Number(inp.min || 0)) inp.value = inp.min || 0;
      computeRooms(getWallHeightFallback());
      updateExpl(dom.explBody, dom.roomCount);
      doRedraw();
    });
    inp.addEventListener('focus', e => e.target.select());
  });

  // Explication rename (delegation)
  dom.explBody?.addEventListener('focusin', e => { if (e.target.matches('.room-name-input')) e.target.select(); });
  dom.explBody?.addEventListener('keydown', e => {
    if (e.target.matches('.room-name-input') && e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
  });
  dom.explBody?.addEventListener('change', e => {
    if (!e.target.matches('.room-name-input')) return;
    renameRoom(e.target.dataset.roomKey, e.target.value || e.target.dataset.roomDefault || '');
    updateExpl(dom.explBody, dom.roomCount);
    doRedraw();
    recordHistory();
  });

  // Import rooms from planner into smeta
  dom.btnImportRooms?.addEventListener('click', () => {
    const rooms = getComputedRooms();
    if (!rooms.length) { alert('Нарисуйте план и пересчитайте помещения'); return; }
    window._smetaModule?.importRoomsFromPlanner(rooms);
  });

  setTool('select');
  syncDoorButtons();
  recordHistory();
  updateHistoryBtns();
  doRedraw();
}

// ── Helpers ───────────────────────────────────────────────────────

function getWallHeightFallback() {
  return parseFloat(dom.inpWallHeight?.value) || 2700;
}

function syncViewport() {
  setViewport(scale, panX, panY);
}

function doRedraw() {
  syncViewport();
  redraw(getPlannerState());
}

function getPlannerState() {
  return {
    scale, selectedItems, tool, isDrawing, drawStart, drawEnd,
    currentGuideLine, currentObjectSnap, hoverOpening,
    selectBoxStart, selectBoxCurrent, chainMode, lengthMode, lengthInput,
    wallResizeState, wallOffset, defaultDoorHinge, defaultDoorSwing,
    inpWallThick: dom.inpWallThick,
    lengthOverlay: dom.lengthOverlay, lengthLabel: dom.lengthLabel,
    lblLen: dom.lblLen, lblLenVal: dom.lblLenVal,
    mouseScreen, isPanning,
  };
}

function resizeCanvas() {
  const r = canvasWrap.getBoundingClientRect();
  canvas.width = r.width; canvas.height = r.height;
  doRedraw();
}

function resetDrawingState() {
  isDrawing = false; chainMode = false; drawStart = null; drawEnd = null;
  currentGuideLine = null; currentObjectSnap = null;
  lengthInput = ''; lengthMode = false;
  if (dom.lengthOverlay) dom.lengthOverlay.style.display = 'none';
  if (dom.lblLen) dom.lblLen.style.display = 'none';
}

function clearSelectionBox() { selectBoxStart = null; selectBoxCurrent = null; }

function clearSelection() {
  selectedItems = []; wallResizeState = null;
  if (dom.editPanel) dom.editPanel.style.display = 'none';
  if (dom.editContent) dom.editContent.innerHTML = '';
  syncDoorButtons(); doRedraw();
}

function setSelection(items) {
  const seen = new Set(), unique = [];
  for (const i of items) { const k = `${i.type}:${i.id}`; if (!seen.has(k)) { seen.add(k); unique.push(i); } }
  selectedItems = unique;
  if (dom.editPanel) dom.editPanel.style.display = selectedItems.length ? 'block' : 'none';
  updateEditPanel(); syncDoorButtons(); doRedraw();
}

function selectObject(type, id) { setSelection([{ type, id }]); }

function toggleSelection(type, id) {
  const k = `${type}:${id}`;
  if (selectedItems.some(i => `${i.type}:${i.id}` === k))
    setSelection(selectedItems.filter(i => `${i.type}:${i.id}` !== k));
  else
    setSelection([...selectedItems, { type, id }]);
}

function getSelectedWall() {
  if (selectedItems.length !== 1 || selectedItems[0].type !== 'wall') return null;
  return appState.walls.find(w => w.id === selectedItems[0].id) || null;
}

function updateHistoryBtns() {
  if (dom.btnUndo) dom.btnUndo.disabled = !canUndo();
  if (dom.btnRedo) dom.btnRedo.disabled = !canRedo();
}

function onHistoryRestore() {
  hoverOpening = null; mouseScreen = null; wallResizeState = null;
  resetDrawingState(); clearSelectionBox(); clearSelection();
  computeRooms(getWallHeightFallback());
  updateExpl(dom.explBody, dom.roomCount);
  updateHistoryBtns(); doRedraw();
}

function updateSnapBadge() {
  if (!dom.snapBadge) return;
  dom.snapBadge.textContent = (shiftDown && ctrlDown) ? 'Привязка: 100 мм'
    : shiftDown ? 'Привязка: 10 мм' : 'Привязка: 1 мм';
}

function isEditableTarget(target) {
  return !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
}

// ── Tool ──────────────────────────────────────────────────────────

export function setTool(t) {
  tool = t;
  wallResizeState = null; // Bug #3 fix
  if (t !== 'wall') resetDrawingState();
  clearSelectionBox(); hoverOpening = null; currentObjectSnap = null;
  document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tool' + t.charAt(0).toUpperCase() + t.slice(1))?.classList.add('active');
  const labels = { select: 'Выбор', wall: 'Стена', window: 'Окно', door: 'Дверь' };
  if (dom.lblTool) dom.lblTool.textContent = labels[t] || t;
  canvas.style.cursor = t === 'select' ? 'default' : 'crosshair';
  document.getElementById('windowParams')?.classList.toggle('active', t === 'window');
  document.getElementById('doorParams')?.classList.toggle('active', t === 'door');
  if (t !== 'select') clearSelection();
  doRedraw();
}

// ── Edit panel ────────────────────────────────────────────────────

function updateEditPanel() {
  if (!dom.editContent) return;
  if (!selectedItems.length) { dom.editContent.innerHTML = ''; return; }
  if (selectedItems.length > 1) {
    const wc = selectedItems.filter(i => i.type === 'wall').length;
    const oc = selectedItems.filter(i => i.type === 'opening').length;
    dom.editContent.innerHTML = `<div class="edit-row"><label>Выбрано</label><b>${selectedItems.length}</b></div>
      <div class="edit-row"><label>Стены</label><b>${wc}</b></div>
      <div class="edit-row"><label>Проёмы</label><b>${oc}</b></div>`;
    return;
  }
  const it = selectedItems[0];
  if (it.type === 'wall') {
    const w = appState.walls.find(v => v.id === it.id); if (!w) return;
    const len = Math.round(getWallLength(w));
    dom.editContent.innerHTML = `
      <div class="param-group">
        <div class="param-label">Длина <span class="param-unit">мм</span></div>
        <div class="param-input-wrap"><input class="param-input" type="number" min="20" step="1" value="${len}" data-wall-length-input><span class="param-input-unit">мм</span></div>
      </div>
      <div class="param-group">
        <div class="param-label">Фиксировать край</div>
        <div class="choice-grid">
          <button class="choice-btn compact${wallLengthAnchor === 'start' ? ' active' : ''}" type="button" data-wall-anchor="start">Начало</button>
          <button class="choice-btn compact${wallLengthAnchor === 'end' ? ' active' : ''}" type="button" data-wall-anchor="end">Конец</button>
        </div>
      </div>
      <div class="param-group">
        <div class="param-label">Толщина <span class="param-unit">мм</span></div>
        <div class="param-input-wrap"><input class="param-input" type="number" min="50" max="1000" step="10" value="${w.thickness}" data-wall-thick-input><span class="param-input-unit">мм</span></div>
      </div>
      <div class="param-group">
        <div class="param-label">Высота <span class="param-unit">мм</span></div>
        <div class="param-input-wrap"><input class="param-input" type="number" min="1000" max="6000" step="100" value="${w.height}" data-wall-height-input><span class="param-input-unit">мм</span></div>
      </div>
      <div class="edit-note">Длину можно ввести вручную или потянуть маркеры на концах стены.</div>`;
    // Bug #9 fix: attach change listeners for thickness/height
    dom.editContent.querySelector('[data-wall-thick-input]')?.addEventListener('change', e => {
      const v = Math.max(50, Number(e.target.value) || 200); // Bug #10 fix
      w.thickness = v; invalidateJointCache(); computeRooms(getWallHeightFallback());
      updateExpl(dom.explBody, dom.roomCount); recordHistory(); doRedraw();
    });
    dom.editContent.querySelector('[data-wall-height-input]')?.addEventListener('change', e => {
      const v = Math.max(1000, Number(e.target.value) || 2700); // Bug #10 fix
      w.height = v; computeRooms(getWallHeightFallback());
      updateExpl(dom.explBody, dom.roomCount); recordHistory(); doRedraw();
    });
  } else if (it.type === 'opening') {
    const op = appState.openings.find(o => o.id === it.id); if (!op) return;
    const tl = op.type === 'window' ? 'Окно' : 'Дверь';
    let html = `<div class="edit-row"><label>Тип</label><b>${tl}</b></div>
      <div class="edit-row"><label>Ширина</label><b>${op.width} мм</b></div>
      <div class="edit-row"><label>Высота</label><b>${op.height} мм</b></div>`;
    if (op.type === 'door') {
      html += `<div class="param-group" style="margin-top:6px"><div class="param-label">Петля</div>
        <div class="choice-grid"><button class="choice-btn compact" type="button" data-edit-door-hinge="start">Слева</button><button class="choice-btn compact" type="button" data-edit-door-hinge="end">Справа</button></div></div>
        <div class="param-group"><div class="param-label">Открывание</div>
        <div class="choice-grid"><button class="choice-btn compact" type="button" data-edit-door-swing="1">На себя</button><button class="choice-btn compact" type="button" data-edit-door-swing="-1">От себя</button></div></div>`;
    }
    dom.editContent.innerHTML = html;
  }
  syncDoorButtons();
}

function commitWallLengthInput(inputEl) {
  const wall = getSelectedWall(); if (!wall) return;
  // Bug #10 fix: clamp to ≥ 20
  const val = Math.max(20, parseFloat(inputEl.value) || 0);
  inputEl.value = val;
  setWallLength(wall, val, wallLengthAnchor);
  computeRooms(getWallHeightFallback());
  updateExpl(dom.explBody, dom.roomCount);
  recordHistory(); doRedraw();
}

function syncDoorButtons() {
  document.querySelectorAll('[data-default-door-hinge]').forEach(b => b.classList.toggle('active', b.dataset.defaultDoorHinge === defaultDoorHinge));
  document.querySelectorAll('[data-default-door-swing]').forEach(b => b.classList.toggle('active', Number(b.dataset.defaultDoorSwing) === defaultDoorSwing));
  const selDoor = selectedItems.length === 1 && selectedItems[0].type === 'opening'
    ? appState.openings.find(o => o.id === selectedItems[0].id && o.type === 'door') : null;
  if (!selDoor) return;
  document.querySelectorAll('[data-edit-door-hinge]').forEach(b => b.classList.toggle('active', b.dataset.editDoorHinge === (selDoor.hinge || defaultDoorHinge)));
  document.querySelectorAll('[data-edit-door-swing]').forEach(b => b.classList.toggle('active', Number(b.dataset.editDoorSwing) === (selDoor.swing ?? defaultDoorSwing)));
}

// ── Wall preview / finalize ───────────────────────────────────────

function getWallPreviewEnd(world) {
  const screenPt = mouseScreen ? { ...mouseScreen } : toScreen(world.x, world.y);
  const snappedBase = snap(world.x, world.y, { screenPoint: screenPt, includePerpendicular: !!drawStart, startPoint: drawStart });
  let rawEnd = { ...snappedBase };
  if (!snappedBase.snapType && !shiftDown && drawStart) {
    const dx = rawEnd.x - drawStart.x, dy = rawEnd.y - drawStart.y, len = Math.hypot(dx, dy);
    if (len > 20) {
      let angle = Math.atan2(dy, dx);
      for (const sa of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
        const diff = Math.abs(angle - sa);
        if (diff < 0.15 || Math.abs(diff - 2 * Math.PI) < 0.15) { angle = sa; rawEnd = { x: drawStart.x + Math.cos(angle) * len, y: drawStart.y + Math.sin(angle) * len }; break; }
      }
    }
  }
  if (currentGuideLine && !snappedBase.snapType) {
    const nearest = getNearestGuideAxis(screenPt, currentGuideLine);
    const axisGuide = nearest ? { anchor: currentGuideLine.anchor, dir: nearest.dir } : currentGuideLine;
    rawEnd = { ...rawEnd, ...projectPointToGuideLineWorld(rawEnd, axisGuide) };
  }
  if (lengthMode && lengthInput && drawStart) {
    const targetLen = parseFloat(lengthInput);
    if (!isNaN(targetLen) && targetLen > 0) {
      if (currentGuideLine) {
        const nearest = getNearestGuideAxis(screenPt, currentGuideLine);
        const axisDir = nearest ? nearest.dir : currentGuideLine.dir;
        const axisGuide = { anchor: currentGuideLine.anchor, dir: axisDir };
        const ax = axisGuide.anchor.x - drawStart.x, ay = axisGuide.anchor.y - drawStart.y;
        const dot = ax * axisGuide.dir.x + ay * axisGuide.dir.y;
        const dist2 = ax * ax + ay * ay, disc = dot * dot - (dist2 - targetLen * targetLen);
        if (disc >= 0) {
          const sq = Math.sqrt(disc);
          const p1 = { x: axisGuide.anchor.x + axisGuide.dir.x * (-dot + sq), y: axisGuide.anchor.y + axisGuide.dir.y * (-dot + sq) };
          const p2 = { x: axisGuide.anchor.x + axisGuide.dir.x * (-dot - sq), y: axisGuide.anchor.y + axisGuide.dir.y * (-dot - sq) };
          rawEnd = Math.hypot(rawEnd.x - p1.x, rawEnd.y - p1.y) <= Math.hypot(rawEnd.x - p2.x, rawEnd.y - p2.y) ? p1 : p2;
        }
      } else {
        const dx = rawEnd.x - drawStart.x, dy = rawEnd.y - drawStart.y, curLen = Math.hypot(dx, dy);
        if (curLen > 0.1) rawEnd = { x: drawStart.x + (dx / curLen) * targetLen, y: drawStart.y + (dy / curLen) * targetLen };
      }
    }
  }
  rawEnd.snappedToEndpoint = snappedBase.snappedToEndpoint;
  rawEnd.snapType = snappedBase.snapType;
  return rawEnd;
}

function finalizeWall(end) {
  if (!drawStart) return false;
  const len = Math.hypot(end.x - drawStart.x, end.y - drawStart.y);
  if (len <= 20) return false; // Bug #4 fix
  const thick = parseFloat(dom.inpWallThick?.value) || 200;
  const height = parseFloat(dom.inpWallHeight?.value) || 2700;
  addWall(drawStart, end, thick, height, wallOffset);
  computeRooms(getWallHeightFallback());
  updateExpl(dom.explBody, dom.roomCount);
  drawStart = { x: end.x, y: end.y }; drawEnd = { x: end.x, y: end.y };
  currentGuideLine = null; currentObjectSnap = null;
  lengthInput = ''; lengthMode = false; chainMode = true; isDrawing = true;
  recordHistory(); doRedraw(); return true;
}

function updateWallObjectSnap(worldPoint, screenPoint) {
  if (tool !== 'wall') { currentObjectSnap = null; return; }
  currentObjectSnap = findObjectSnapCandidate(worldPoint, screenPoint, {
    includeEndpoint: true, includeCorner: true, includeMidpoint: true,
    includeIntersection: true, includeWallPoint: true,
    includePerpendicular: isDrawing && !!drawStart, startPoint: drawStart,
  });
}

function updateWallGuide(worldPoint, screenPoint) {
  if (tool !== 'wall' || !isDrawing || !drawStart) { currentGuideLine = null; return; }
  const candidate = findGuideCandidate(screenPoint);
  if (candidate) { currentGuideLine = candidate; return; }
  if (currentGuideLine) {
    const nearest = getNearestGuideAxis(screenPoint, currentGuideLine);
    const guideDistance = nearest ? nearest.distance : Infinity;
    const anchorScreen = toScreen(currentGuideLine.anchor.x, currentGuideLine.anchor.y);
    const anchorDistance = Math.hypot(screenPoint.x - anchorScreen.x, screenPoint.y - anchorScreen.y);
    if (guideDistance <= 18 || anchorDistance <= 20) return;
  }
  currentGuideLine = null;
}

// ── Canvas events ─────────────────────────────────────────────────

function getCanvasPos(e) {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

function onMouseDown(e) {
  if (e.button === 2 || e.button === 1) {
    isPanning = true; panStartX = e.clientX; panStartY = e.clientY;
    panStartOffX = panX; panStartOffY = panY;
    canvas.style.cursor = 'grabbing'; e.preventDefault(); return;
  }
  const pos = getCanvasPos(e);
  const world = toWorld(pos.x, pos.y);
  mouseScreen = { x: pos.x, y: pos.y };
  if (tool !== 'select' && selectedItems.length && !shiftDown) clearSelection();

  if (tool === 'wall') {
    if (!isDrawing) {
      const snapped = snap(world.x, world.y, { screenPoint: pos });
      isDrawing = true; chainMode = false;
      drawStart = { x: snapped.x, y: snapped.y }; drawEnd = { ...snapped };
      lengthInput = ''; lengthMode = false; doRedraw();
    } else {
      const end = getWallPreviewEnd(world); finalizeWall(end);
    }
  } else if (tool === 'window' || tool === 'door') {
    if (hoverOpening) {
      addOpening(hoverOpening.wall, hoverOpening.t, hoverOpening.width, hoverOpening.height, tool, hoverOpening);
      computeRooms(getWallHeightFallback()); updateExpl(dom.explBody, dom.roomCount);
      recordHistory(); doRedraw();
    }
  } else if (tool === 'select') {
    const handle = hitTestWallResizeHandle(pos, tool, selectedItems);
    if (handle) {
      wallResizeState = { wallId: handle.wall.id, endpoint: handle.endpoint,
        fixedPoint: getWallContourPoint(handle.wall, handle.endpoint === 'start' ? 'end' : 'start'), changed: false };
      selectBoxStart = null; selectBoxCurrent = null; selectClickCandidate = null;
      canvas.style.cursor = 'grabbing'; return;
    }
    const hit = hitTestObject(world.x, world.y);
    if (hit) { selectClickCandidate = hit; clearSelectionBox(); }
    else { if (!shiftDown) clearSelection(); selectClickCandidate = null; selectBoxStart = { x: pos.x, y: pos.y }; selectBoxCurrent = { x: pos.x, y: pos.y }; doRedraw(); }
  }
}

function hitTestObject(wx, wy) {
  const op = findClosestOpening(wx, wy); if (op) return { type: 'opening', id: op.id };
  const wall = findClosestWallSel(wx, wy); if (wall) return { type: 'wall', id: wall.id };
  return null;
}

// Bug #1 fix: debounce computeRooms during wall resize
let _resizeDebounce = null;
function debouncedComputeRooms() {
  clearTimeout(_resizeDebounce);
  _resizeDebounce = setTimeout(() => {
    computeRooms(getWallHeightFallback());
    updateExpl(dom.explBody, dom.roomCount);
    doRedraw();
  }, 80);
}

function onMouseMove(e) {
  if (isPanning) {
    panX = panStartOffX + (e.clientX - panStartX);
    panY = panStartOffY + (e.clientY - panStartY);
    syncViewport(); doRedraw(); return;
  }
  const pos = getCanvasPos(e), world = toWorld(pos.x, pos.y);
  mouseScreen = { x: pos.x, y: pos.y };
  setModifiers(shiftDown, ctrlDown);

  if (wallResizeState) {
    const wall = appState.walls.find(w => w.id === wallResizeState.wallId);
    if (!wall) { wallResizeState = null; doRedraw(); return; }
    currentGuideLine = null; currentObjectSnap = null;
    const moved = getSnappedWallResizePoint(wallResizeState.fixedPoint, world, pos, shiftDown);
    const ns = wallResizeState.endpoint === 'start' ? moved : wallResizeState.fixedPoint;
    const ne = wallResizeState.endpoint === 'start' ? wallResizeState.fixedPoint : moved;
    if (Math.hypot(ne.x - ns.x, ne.y - ns.y) >= 20) {
      const changed = updateWallGeometry(wall, ns, ne, { preserveFrom: wallResizeState.endpoint === 'start' ? 'end' : 'start' });
      wallResizeState.changed = wallResizeState.changed || changed;
      debouncedComputeRooms(); // Bug #1 fix
    }
    canvas.style.cursor = 'grabbing'; doRedraw(); return;
  }

  if (tool === 'wall') updateWallObjectSnap(world, pos);
  else currentObjectSnap = null;

  if (dom.lblCoords) dom.lblCoords.textContent = `X: ${Math.round(world.x)} мм  Y: ${Math.round(world.y)} мм${tool === 'wall' && currentObjectSnap ? `  ·  ${currentObjectSnap.label}` : ''}`;

  if (tool === 'select' && selectBoxStart) { selectBoxCurrent = { x: pos.x, y: pos.y }; doRedraw(); return; }

  if (tool === 'window' || tool === 'door') {
    const hit = findClosestWall(world.x, world.y);
    if (hit) {
      const thick = parseFloat(dom.inpWallThick?.value) || 200;
      const w = parseFloat(document.getElementById(tool === 'window' ? 'inpWindowWidth' : 'inpDoorWidth')?.value) || (tool === 'window' ? 1200 : 900);
      const h = parseFloat(document.getElementById(tool === 'window' ? 'inpWindowHeight' : 'inpDoorHeight')?.value) || (tool === 'window' ? 1500 : 2100);
      const wlen = Math.hypot(hit.wall.x2 - hit.wall.x1, hit.wall.y2 - hit.wall.y1);
      const angle = Math.atan2(hit.wall.y2 - hit.wall.y1, hit.wall.x2 - hit.wall.x1);
      const nx = -Math.sin(angle), ny = Math.cos(angle);
      const px = hit.wall.x1 + (hit.wall.x2 - hit.wall.x1) * hit.t, py = hit.wall.y1 + (hit.wall.y2 - hit.wall.y1) * hit.t;
      const side = ((world.x - px) * nx + (world.y - py) * ny) >= 0 ? 1 : -1;
      hoverOpening = wlen > w + 1 ? { wall: hit.wall, t: hit.t, width: w, height: h, type: tool, hinge: defaultDoorHinge, swing: defaultDoorSwing, side } : null;
    } else hoverOpening = null;
    doRedraw();
  } else if (hoverOpening) { hoverOpening = null; doRedraw(); }

  if (isDrawing && tool === 'wall' && drawStart) {
    updateWallGuide(world, pos); drawEnd = getWallPreviewEnd(world); doRedraw();
  } else if (tool === 'wall' && !isDrawing) doRedraw();

  if (tool === 'select' && !selectBoxStart) {
    canvas.style.cursor = hitTestWallResizeHandle(pos, tool, selectedItems) ? 'grab' : 'default';
  }
}

function onMouseUp(e) {
  if (wallResizeState) {
    const shouldRecord = wallResizeState.changed; wallResizeState = null;
    canvas.style.cursor = tool === 'select' ? 'default' : 'crosshair';
    if (shouldRecord) {
      computeRooms(getWallHeightFallback()); updateExpl(dom.explBody, dom.roomCount);
      recordHistory();
    }
    doRedraw(); return;
  }
  if (tool === 'select' && selectClickCandidate) {
    const hit = selectClickCandidate; selectClickCandidate = null;
    if (shiftDown) toggleSelection(hit.type, hit.id);
    else selectObject(hit.type, hit.id);
    doRedraw(); return;
  }
  if (tool === 'select' && selectBoxStart) {
    const box = selectBoxStart && selectBoxCurrent ? {
      left: Math.min(selectBoxStart.x, selectBoxCurrent.x), top: Math.min(selectBoxStart.y, selectBoxCurrent.y),
      right: Math.max(selectBoxStart.x, selectBoxCurrent.x), bottom: Math.max(selectBoxStart.y, selectBoxCurrent.y),
    } : null;
    if (box && (box.right - box.left) > 5 && (box.bottom - box.top) > 5) {
      const items = [];
      for (const wall of appState.walls) {
        const wb = { left: Math.min(toScreen(wall.x1, wall.y1).x, toScreen(wall.x2, wall.y2).x) - wall.thickness,
          right: Math.max(toScreen(wall.x1, wall.y1).x, toScreen(wall.x2, wall.y2).x) + wall.thickness,
          top: Math.min(toScreen(wall.x1, wall.y1).y, toScreen(wall.x2, wall.y2).y) - wall.thickness,
          bottom: Math.max(toScreen(wall.x1, wall.y1).y, toScreen(wall.x2, wall.y2).y) + wall.thickness };
        if (boundsIntersect(wb, box)) items.push({ type: 'wall', id: wall.id });
      }
      for (const op of appState.openings) {
        const ob = getOpeningScreenBounds(op);
        if (ob && boundsIntersect(ob, box)) items.push({ type: 'opening', id: op.id });
      }
      if (items.length) setSelection(shiftDown ? [...selectedItems, ...items] : items);
      else if (!shiftDown) clearSelection();
    } else if (!shiftDown) clearSelection();
    clearSelectionBox(); doRedraw(); return;
  }
  if (isPanning) { isPanning = false; canvas.style.cursor = tool === 'select' ? 'default' : 'crosshair'; doRedraw(); }
}

function onWheel(e) {
  e.preventDefault();
  const pos = getCanvasPos(e), factor = e.deltaY < 0 ? 1.12 : 0.88;
  const newScale = Math.min(2, Math.max(0.03, scale * factor));
  panX = pos.x - (pos.x - panX) * (newScale / scale);
  panY = pos.y - (pos.y - panY) * (newScale / scale);
  scale = newScale; syncViewport(); doRedraw();
}

function onKeyDown(e) {
  const editable = isEditableTarget(e.target);
  if (!editable && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault(); if (e.shiftKey) { redoHistory(onHistoryRestore); } else { undoHistory(onHistoryRestore); }
    updateHistoryBtns(); return;
  }
  if (!editable && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
    e.preventDefault(); redoHistory(onHistoryRestore); updateHistoryBtns(); return;
  }
  if (e.key === 'Shift') { shiftDown = true; setModifiers(true, ctrlDown); updateSnapBadge(); }
  if (e.key === 'Control') { ctrlDown = true; setModifiers(shiftDown, true); updateSnapBadge(); }
  if (e.key === 'Escape') {
    if (isDrawing) { resetDrawingState(); doRedraw(); }
    clearSelectionBox(); clearSelection(); hoverOpening = null; doRedraw();
  }
  if (!editable && (e.key === 'Delete' || e.key === 'Backspace') && selectedItems.length) {
    dom.btnDeleteSelected?.click(); e.preventDefault();
  }
  if (!editable && isDrawing && tool === 'wall') {
    if (/^[0-9]$/.test(e.key)) { lengthMode = true; lengthInput += e.key; e.preventDefault(); doRedraw(); }
    else if (e.key === 'Backspace' && lengthMode) {
      lengthInput = lengthInput.slice(0, -1); if (!lengthInput) lengthMode = false; e.preventDefault(); doRedraw();
    } else if (e.key === 'Enter' && lengthMode && lengthInput) { // Bug #7 fix: only if lengthInput non-empty
      const targetLen = parseFloat(lengthInput);
      if (!isNaN(targetLen) && targetLen > 0 && drawEnd && drawStart) {
        const end = getWallPreviewEnd(drawEnd); finalizeWall(end);
      }
      lengthInput = ''; lengthMode = false; e.preventDefault(); doRedraw();
    }
  }
  if (!editable && !e.ctrlKey && !e.metaKey) {
    if (e.key === 'v' || e.key === 'V') setTool('select');
    if (e.key === 'w' || e.key === 'W') setTool('wall');
    if (e.key === 'o' || e.key === 'O') setTool('window');
    if (e.key === 'd' || e.key === 'D') setTool('door');
  }
}

function onKeyUp(e) {
  if (e.key === 'Shift') { shiftDown = false; setModifiers(false, ctrlDown); updateSnapBadge(); }
  if (e.key === 'Control') { ctrlDown = false; setModifiers(shiftDown, false); updateSnapBadge(); }
}

export function forceRedraw() { doRedraw(); }
