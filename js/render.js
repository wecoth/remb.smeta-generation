// ─── RENDER.JS ────────────────────────────────────────────────────
import { appState, DRAW_COLORS, ROOM_COLORS, ROOM_STROKES } from './state.js';
import {
  getWallWorldGeometry, getWallCornerPoints, getWallLength,
  getWallContourPoint, isWallEndpointCoveredByAnotherWall,
  buildWallJointMap, getWallJointItemsForEndpoint, getWallJointRects,
  getJointBoundaryCornerPoints, getJointLocalCornerPoints, getJointBoundaryPaths,
} from './wall.js';
import { toScreen, toWorld, getGuideAxes, getGuideLineScreenEndpoints } from './snapping.js';

let _canvas, _ctx, _hatchPat = null;
let _getScale = () => 0.12;

export function initRenderer(canvas, ctx, getScaleFn) {
  _canvas = canvas; _ctx = ctx;
  _getScale = getScaleFn || (() => 0.12);
  _hatchPat = null;
}

// ── Utilities ─────────────────────────────────────────────────────

function sel(type, id, list) { return list.some(i => i.type === type && i.id === id); }

function wallStyle(isSelected) {
  return {
    fill:   isSelected ? DRAW_COLORS.wallFillSelected : DRAW_COLORS.wallFill,
    stroke: isSelected ? DRAW_COLORS.wallStrokeSelected : DRAW_COLORS.wallStroke,
  };
}

function sg(wall) { // screen geometry
  const w = getWallWorldGeometry(wall);
  const sc = p => toScreen(p.x, p.y);
  return { p1: sc(w.p1), p2: sc(w.p2), angle: w.angle, halfT: w.halfT,
           a: sc(w.a), b: sc(w.b), c: sc(w.c), d: sc(w.d) };
}

function hatch() {
  if (_hatchPat) return _hatchPat;
  const pc = document.createElement('canvas'); pc.width = 12; pc.height = 12;
  const px = pc.getContext('2d');
  px.strokeStyle = DRAW_COLORS.wallHatch; px.lineWidth = 1;
  px.beginPath(); px.moveTo(-2, 12); px.lineTo(12, -2); px.moveTo(4, 12); px.lineTo(12, 4); px.stroke();
  _hatchPat = _ctx.createPattern(pc, 'repeat'); return _hatchPat;
}

function fillWall(pathFn, fill) {
  _ctx.save(); pathFn(); _ctx.fillStyle = fill; _ctx.fill();
  const h = hatch(); if (h) { pathFn(); _ctx.fillStyle = h; _ctx.fill(); }
  _ctx.restore();
}

function wallInteriorSide(wall, fallback = 1) {
  const mid = { x: (wall.x1 + wall.x2) / 2, y: (wall.y1 + wall.y2) / 2 };
  const angle = Math.atan2(wall.y2 - wall.y1, wall.x2 - wall.x1);
  const normal = { x: -Math.sin(angle), y: Math.cos(angle) };
  let best = null;
  for (const r of appState.rooms) {
    if (!r.boundarySegments.some(s => s.wall && s.wall.id === wall.id)) continue;
    const dot = (r.center.x - mid.x) * normal.x + (r.center.y - mid.y) * normal.y;
    if (Math.abs(dot) < 1) continue;
    if (best === null || Math.abs(dot) > Math.abs(best)) best = dot;
  }
  return best === null ? fallback : best >= 0 ? 1 : -1;
}

// ── Exported helpers ──────────────────────────────────────────────

export function drawAlignedTextBox(text, pos, angle, opts = {}) {
  let a = angle;
  if (a > Math.PI / 2 || a < -Math.PI / 2) a += Math.PI;
  _ctx.save(); _ctx.translate(pos.x, pos.y); _ctx.rotate(a);
  _ctx.font = opts.font || '600 10px Onest, Inter, sans-serif';
  const tw = _ctx.measureText(text).width, bw = tw + 12, bh = 16;
  _ctx.fillStyle = opts.background || 'rgba(255,255,255,0.95)';
  _ctx.beginPath();
  if (_ctx.roundRect) _ctx.roundRect(-bw / 2, -bh / 2, bw, bh, 5);
  else _ctx.rect(-bw / 2, -bh / 2, bw, bh);
  _ctx.fill(); _ctx.fillStyle = opts.textColor || '#0f172a';
  _ctx.textAlign = 'center'; _ctx.textBaseline = 'middle'; _ctx.fillText(text, 0, 0); _ctx.restore();
}

export function getWallResizeHandles(wall) {
  return ['start', 'end'].map(ep => ({
    wall, endpoint: ep, point: getWallContourPoint(wall, ep),
    screen: toScreen(getWallContourPoint(wall, ep).x, getWallContourPoint(wall, ep).y),
  }));
}

export function getOpeningScreenBounds(op) {
  const wall = appState.walls.find(w => w.id === op.wallId); if (!wall) return null;
  const wlen = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1); if (wlen < 1) return null;
  const angle = Math.atan2(wall.y2 - wall.y1, wall.x2 - wall.x1);
  const halfT = wall.thickness / 2;
  const t1 = Math.max(0, Math.min(1, op.t - op.width / 2 / wlen));
  const t2 = Math.max(0, Math.min(1, op.t + op.width / 2 / wlen));
  const p1 = toScreen(wall.x1 + (wall.x2 - wall.x1) * t1, wall.y1 + (wall.y2 - wall.y1) * t1);
  const p2 = toScreen(wall.x1 + (wall.x2 - wall.x1) * t2, wall.y1 + (wall.y2 - wall.y1) * t2);
  const sdx = -Math.sin(angle) * halfT, sdy = Math.cos(angle) * halfT;
  const corners = [{ x: p1.x + sdx, y: p1.y + sdy }, { x: p2.x + sdx, y: p2.y + sdy },
                   { x: p2.x - sdx, y: p2.y - sdy }, { x: p1.x - sdx, y: p1.y - sdy }];
  return { left: Math.min(...corners.map(p => p.x)), top:  Math.min(...corners.map(p => p.y)),
           right: Math.max(...corners.map(p => p.x)), bottom: Math.max(...corners.map(p => p.y)) };
}

export function boundsIntersect(a, b) {
  return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
}

export function hitTestWallResizeHandle(sp, tool, selectedItems) {
  if (tool !== 'select') return null;
  const wall = selectedItems.length === 1 && selectedItems[0].type === 'wall'
    ? appState.walls.find(w => w.id === selectedItems[0].id) : null;
  if (!wall) return null;
  for (const h of getWallResizeHandles(wall))
    if (Math.hypot(sp.x - h.screen.x, sp.y - h.screen.y) <= 10) return h;
  return null;
}

// ── MAIN REDRAW ───────────────────────────────────────────────────

export function redraw(ps) {
  _ctx.clearRect(0, 0, _canvas.width, _canvas.height);
  drawGrid();
  drawRoomFills(ps.selectedItems);
  drawWalls(ps.selectedItems);
  drawWallJoints(ps.selectedItems);
  drawOpenings(ps.selectedItems, ps.defaultDoorHinge, ps.defaultDoorSwing);
  drawSelectedHandles(ps.tool, ps.selectedItems, ps.wallResizeState);
  if (ps.hoverOpening) drawOpening(ps.hoverOpening, ps.hoverOpening.wall, true, false, ps.defaultDoorHinge, ps.defaultDoorSwing);
  if (ps.isDrawing && ps.drawStart && ps.drawEnd) drawTempWall(ps);
  if (ps.tool === 'wall' && ps.currentGuideLine)  drawGuideLine(ps.currentGuideLine);
  if (ps.tool === 'wall' && ps.currentObjectSnap) drawCornerHotspots(ps.currentObjectSnap);
  if (ps.tool === 'wall' && ps.currentObjectSnap) drawObjectSnap(ps.currentObjectSnap);
  drawSelectionBox(ps.selectBoxStart, ps.selectBoxCurrent);
  drawCursorGhost(ps);
}

function drawGrid() {
  const W = _canvas.width, H = _canvas.height;
  const stepMin = 100, stepMaj = 1000;
  const wMin = toWorld(0, 0), wMax = toWorld(W, H);
  _ctx.save();
  _ctx.strokeStyle = '#e8eaee'; _ctx.lineWidth = 0.5;
  for (let x = Math.floor(wMin.x / stepMin) * stepMin; x <= wMax.x + stepMin; x += stepMin) {
    const sx = toScreen(x, 0).x; _ctx.beginPath(); _ctx.moveTo(sx, 0); _ctx.lineTo(sx, H); _ctx.stroke();
  }
  for (let y = Math.floor(wMin.y / stepMin) * stepMin; y <= wMax.y + stepMin; y += stepMin) {
    const sy = toScreen(0, y).y; _ctx.beginPath(); _ctx.moveTo(0, sy); _ctx.lineTo(W, sy); _ctx.stroke();
  }
  _ctx.strokeStyle = '#c8cdd8'; _ctx.lineWidth = 1;
  for (let x = Math.floor(wMin.x / stepMaj) * stepMaj; x <= wMax.x + stepMaj; x += stepMaj) {
    const sx = toScreen(x, 0).x; _ctx.beginPath(); _ctx.moveTo(sx, 0); _ctx.lineTo(sx, H); _ctx.stroke();
  }
  for (let y = Math.floor(wMin.y / stepMaj) * stepMaj; y <= wMax.y + stepMaj; y += stepMaj) {
    const sy = toScreen(0, y).y; _ctx.beginPath(); _ctx.moveTo(0, sy); _ctx.lineTo(W, sy); _ctx.stroke();
  }
  _ctx.fillStyle = '#a0aab8'; _ctx.font = '10px Onest, Inter, sans-serif'; _ctx.textAlign = 'left';
  for (let x = Math.floor(wMin.x / stepMaj) * stepMaj; x <= wMax.x + stepMaj; x += stepMaj) {
    const sx = toScreen(x, 0).x; if (sx > 2 && sx < W - 2) _ctx.fillText((x / 1000).toFixed(0) + 'м', sx + 2, 12);
  }
  for (let y = Math.floor(wMin.y / stepMaj) * stepMaj; y <= wMax.y + stepMaj; y += stepMaj) {
    const sy = toScreen(0, y).y; if (sy > 14 && sy < H - 2) _ctx.fillText((y / 1000).toFixed(0) + 'м', 2, sy - 2);
  }
  _ctx.restore();
}

function drawRoomFills(selectedItems) {
  const scale = _getScale();
  for (let i = 0; i < appState.rooms.length; i++) {
    const r = appState.rooms[i]; if (!r.cells?.length) continue;
    _ctx.save();
    _ctx.beginPath();
    for (const c of r.cells) { const p = toScreen(c.x1, c.y1); _ctx.rect(p.x, p.y, (c.x2 - c.x1) * scale, (c.y2 - c.y1) * scale); }
    _ctx.fillStyle = ROOM_COLORS[i % ROOM_COLORS.length]; _ctx.fill();
    _ctx.strokeStyle = ROOM_STROKES[i % ROOM_STROKES.length]; _ctx.lineWidth = 1; _ctx.setLineDash([4, 3]);
    for (const s of r.boundarySegments) {
      const p1 = toScreen(s.x1, s.y1), p2 = toScreen(s.x2, s.y2);
      _ctx.beginPath(); _ctx.moveTo(p1.x, p1.y); _ctx.lineTo(p2.x, p2.y); _ctx.stroke();
    }
    _ctx.setLineDash([]);
    if (scale > 0.08) { // Bug #6 fix
      const sc = toScreen(r.center.x, r.center.y);
      _ctx.fillStyle = DRAW_COLORS.roomLabel;
      _ctx.font = `600 ${Math.max(10, Math.min(14, scale * 200))}px Onest, Inter, sans-serif`;
      _ctx.textAlign = 'center'; _ctx.textBaseline = 'middle'; _ctx.fillText(r.name, sc.x, sc.y);
      _ctx.font = `500 ${Math.max(9, Math.min(12, scale * 160))}px Onest, Inter, sans-serif`;
      _ctx.fillStyle = DRAW_COLORS.roomMeta; _ctx.fillText(`${r.area.toFixed(1)} м²`, sc.x, sc.y + Math.max(10, scale * 180));
    }
    _ctx.restore();
  }
}

function drawWalls(selectedItems) {
  const scale = _getScale(); const jmap = buildWallJointMap();
  for (const w of appState.walls) {
    const g = sg(w), isSel = sel('wall', w.id, selectedItems), style = wallStyle(isSel);
    const sj = getWallJointItemsForEndpoint(jmap, w, 'start').length > 1 || isWallEndpointCoveredByAnotherWall(w, 'start');
    const ej = getWallJointItemsForEndpoint(jmap, w, 'end').length   > 1 || isWallEndpointCoveredByAnotherWall(w, 'end');
    const trace = () => { _ctx.beginPath(); _ctx.moveTo(g.a.x, g.a.y); _ctx.lineTo(g.b.x, g.b.y); _ctx.lineTo(g.c.x, g.c.y); _ctx.lineTo(g.d.x, g.d.y); _ctx.closePath(); };
    _ctx.save(); fillWall(trace, style.fill);
    _ctx.strokeStyle = style.stroke; _ctx.lineWidth = isSel ? 1.5 : 1; _ctx.lineCap = 'square'; _ctx.lineJoin = 'miter'; _ctx.miterLimit = 4;
    _ctx.beginPath();
    _ctx.moveTo(g.a.x, g.a.y); _ctx.lineTo(g.b.x, g.b.y); _ctx.moveTo(g.d.x, g.d.y); _ctx.lineTo(g.c.x, g.c.y);
    if (!ej) { _ctx.moveTo(g.b.x, g.b.y); _ctx.lineTo(g.c.x, g.c.y); }
    if (!sj) { _ctx.moveTo(g.d.x, g.d.y); _ctx.lineTo(g.a.x, g.a.y); }
    _ctx.stroke();
    if (scale > 0.08) { // Bug #6 fix
      const len = getWallLength(w), mx = (g.p1.x + g.p2.x) / 2, my = (g.p1.y + g.p2.y) / 2;
      const side = wallInteriorSide(w), off = g.halfT * scale + 18;
      drawAlignedTextBox(`${Math.round(len)} мм`,
        { x: mx + (-Math.sin(g.angle) * off * side), y: my + (Math.cos(g.angle) * off * side) },
        g.angle, { textColor: isSel ? DRAW_COLORS.wallStrokeSelected : DRAW_COLORS.roomMeta });
    }
    _ctx.restore();
  }
}

function drawWallJoints(selectedItems) {
  for (const jr of getWallJointRects()) {
    const isSel = jr.wallIds.some(id => sel('wall', id, selectedItems)); const style = wallStyle(isSel);
    const tl = toScreen(jr.left, jr.top), br = toScreen(jr.right, jr.bottom);
    const rl = Math.min(tl.x, br.x), rt = Math.min(tl.y, br.y), rr = Math.max(tl.x, br.x), rb = Math.max(tl.y, br.y);
    fillWall(() => { _ctx.beginPath(); _ctx.rect(rl, rt, rr - rl, rb - rt); }, style.fill);
    _ctx.save(); _ctx.strokeStyle = style.stroke; _ctx.lineWidth = isSel ? 1.5 : 1; _ctx.lineCap = 'square'; _ctx.lineJoin = 'miter'; _ctx.miterLimit = 4;
    _ctx.beginPath();
    for (const path of getJointBoundaryPaths(jr)) {
      if (!path.length) continue; const s = toScreen(path[0].x, path[0].y); _ctx.moveTo(s.x, s.y);
      for (let i = 1; i < path.length; i++) { const p = toScreen(path[i].x, path[i].y); _ctx.lineTo(p.x, p.y); }
    }
    _ctx.stroke(); _ctx.restore();
  }
}

function drawOpenings(selectedItems, dh, ds) {
  for (const op of appState.openings) {
    const wall = appState.walls.find(w => w.id === op.wallId); if (!wall) continue;
    drawOpening(op, wall, false, sel('opening', op.id, selectedItems), dh, ds);
  }
}

function drawOpening(op, wall, isHover, isSel, dh, ds) {
  const wlen = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1); if (wlen < 1) return;
  const angle = Math.atan2(wall.y2 - wall.y1, wall.x2 - wall.x1);
  const halfW = op.width / 2;
  const t1 = Math.max(0, Math.min(1, op.t - halfW / wlen)), t2 = Math.max(0, Math.min(1, op.t + halfW / wlen));
  const ax1 = wall.x1 + (wall.x2 - wall.x1) * t1, ay1 = wall.y1 + (wall.y2 - wall.y1) * t1;
  const ax2 = wall.x1 + (wall.x2 - wall.x1) * t2, ay2 = wall.y1 + (wall.y2 - wall.y1) * t2;
  const p1 = toScreen(ax1, ay1), p2 = toScreen(ax2, ay2);
  const sdx = -Math.sin(angle) * wall.thickness / 2, sdy = Math.cos(angle) * wall.thickness / 2;
  const color = op.type === 'window' ? DRAW_COLORS.windowStroke : DRAW_COLORS.doorStroke;
  const fillColor = op.type === 'window' ? (isHover ? DRAW_COLORS.windowHover : DRAW_COLORS.windowFill)
    : (isHover ? DRAW_COLORS.doorHover : DRAW_COLORS.doorFill);
  const doorHinge = op.hinge || dh, doorSwing = op.swing ?? ds;
  _ctx.save();
  _ctx.beginPath(); _ctx.moveTo(p1.x + sdx, p1.y + sdy); _ctx.lineTo(p2.x + sdx, p2.y + sdy);
  _ctx.lineTo(p2.x - sdx, p2.y - sdy); _ctx.lineTo(p1.x - sdx, p1.y - sdy); _ctx.closePath();
  _ctx.fillStyle = '#fcfcfd'; _ctx.fill(); _ctx.fillStyle = fillColor; _ctx.fill();
  _ctx.strokeStyle = color; _ctx.lineWidth = isSel ? 2 : 1.5; _ctx.stroke();
  if (op.type === 'window') {
    _ctx.beginPath();
    _ctx.moveTo(p1.x + sdx, p1.y + sdy); _ctx.lineTo(p1.x - sdx, p1.y - sdy);
    _ctx.moveTo(p2.x + sdx, p2.y + sdy); _ctx.lineTo(p2.x - sdx, p2.y - sdy); _ctx.stroke();
    for (let t = 0.25; t <= 0.75; t += 0.25) {
      const mx = p1.x + (p2.x - p1.x) * t, my = p1.y + (p2.y - p1.y) * t;
      _ctx.beginPath(); _ctx.moveTo(mx + sdx, my + sdy); _ctx.lineTo(mx - sdx, my - sdy); _ctx.stroke();
    }
  } else {
    const scale = _getScale();
    const hp = doorHinge === 'start' ? p1 : p2;
    const ep = doorHinge === 'start' ? p2 : p1;
    // Радиус = ширина проёма на экране, но не больше толщины стены
    const openingRadius = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const wallThickScreen = wall.thickness * scale;
    const radius = Math.min(openingRadius, wallThickScreen);
    const baseAngle = doorHinge === 'start' ? angle : angle + Math.PI;
    const openAngle = baseAngle + doorSwing * Math.PI / 2;
    // Линия двери (полотно) — от петли вдоль проёма
    const doorEndX = hp.x + Math.cos(baseAngle) * openingRadius;
    const doorEndY = hp.y + Math.sin(baseAngle) * openingRadius;
    // Открытое положение — внутрь стены (ограничено толщиной)
    const le = { x: hp.x + Math.cos(openAngle) * radius, y: hp.y + Math.sin(openAngle) * radius };
    _ctx.beginPath();
    // Вертикальная линия петли через всю толщину
    _ctx.moveTo(hp.x + sdx, hp.y + sdy); _ctx.lineTo(hp.x - sdx, hp.y - sdy);
    // Полотно двери
    _ctx.moveTo(hp.x, hp.y); _ctx.lineTo(doorEndX, doorEndY);
    _ctx.strokeStyle = color; _ctx.lineWidth = isSel ? 2 : 1.5; _ctx.stroke();
    // Дуга траектории открывания
    _ctx.beginPath(); _ctx.arc(hp.x, hp.y, radius, baseAngle, openAngle, doorSwing < 0);
    _ctx.lineWidth = 1; _ctx.setLineDash([3, 3]); _ctx.stroke(); _ctx.setLineDash([]);
  }
  if (isHover) drawOpeningDimensions(op, wall, angle, { x1: ax1, y1: ay1, x2: ax2, y2: ay2 });
  _ctx.restore();
}

function drawOpeningDimensions(op, wall, angle, seg) {
  const ws = toScreen(wall.x1, wall.y1), we = toScreen(wall.x2, wall.y2);
  const os = toScreen(seg.x1, seg.y1), oe = toScreen(seg.x2, seg.y2);
  const normal = { x: -Math.sin(angle), y: Math.cos(angle) };
  const side = wallInteriorSide(wall, 1), off = wall.thickness / 2 + 18;
  const oP = p => ({ x: p.x + normal.x * off * side, y: p.y + normal.y * off * side });
  const dim = (from, to, label, color) => {
    if (Math.hypot(to.x - from.x, to.y - from.y) < 8) return;
    const fo = oP(from), to2 = oP(to);
    _ctx.save(); _ctx.strokeStyle = color; _ctx.lineWidth = 1;
    _ctx.beginPath(); _ctx.moveTo(from.x, from.y); _ctx.lineTo(fo.x, fo.y);
    _ctx.moveTo(to.x, to.y); _ctx.lineTo(to2.x, to2.y); _ctx.moveTo(fo.x, fo.y); _ctx.lineTo(to2.x, to2.y); _ctx.stroke(); _ctx.restore();
    drawAlignedTextBox(label, { x: (fo.x + to2.x) / 2, y: (fo.y + to2.y) / 2 }, angle);
  };
  const wlen = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
  dim(ws, os, `${Math.round(op.t * wlen - op.width / 2)} мм`, DRAW_COLORS.dimension);
  dim(os, oe, `${op.width} мм`, op.type === 'window' ? DRAW_COLORS.windowStroke : DRAW_COLORS.doorStroke);
  dim(oe, we, `${Math.round(wlen - (op.t * wlen + op.width / 2))} мм`, DRAW_COLORS.dimension);
}

function drawSelectedHandles(tool, selectedItems, wallResizeState) {
  if (tool !== 'select') return;
  const wall = selectedItems.length === 1 && selectedItems[0].type === 'wall'
    ? appState.walls.find(w => w.id === selectedItems[0].id) : null;
  if (!wall) return;
  for (const h of getWallResizeHandles(wall)) {
    const active = wallResizeState?.wallId === wall.id && wallResizeState?.endpoint === h.endpoint;
    _ctx.save(); _ctx.beginPath(); _ctx.arc(h.screen.x, h.screen.y, active ? 7.5 : 6.5, 0, Math.PI * 2);
    _ctx.fillStyle = DRAW_COLORS.handleFill; _ctx.fill();
    _ctx.strokeStyle = active ? DRAW_COLORS.handleActive : DRAW_COLORS.handleStroke;
    _ctx.lineWidth = active ? 2.5 : 1.8; _ctx.stroke();
    _ctx.beginPath(); _ctx.arc(h.screen.x, h.screen.y, 2, 0, Math.PI * 2);
    _ctx.fillStyle = active ? DRAW_COLORS.handleActive : DRAW_COLORS.handleStroke; _ctx.fill(); _ctx.restore();
  }
}

function drawTempWall(ps) {
  const { drawStart: ds, drawEnd: de, chainMode, lengthMode, lengthInput, wallOffset, inpWallThick, lengthOverlay, lengthLabel, lblLen, lblLenVal } = ps;
  if (!ds || !de) return;
  const scale = _getScale(), thick = parseFloat(inpWallThick?.value) || 200;
  const angle = Math.atan2(de.y - ds.y, de.x - ds.x);
  const ao = (cx, cy, off) => {
    if (off === 'center') return { x: cx, y: cy };
    const px = -Math.sin(angle), py = Math.cos(angle), sign = off === 'right' ? 1 : -1;
    return { x: cx + sign * px * thick / 2, y: cy + sign * py * thick / 2 };
  };
  const s = ao(ds.x, ds.y, wallOffset), e2 = ao(de.x, de.y, wallOffset);
  const p1 = toScreen(s.x, s.y), p2 = toScreen(e2.x, e2.y);
  const ps1 = toScreen(ds.x, ds.y), ps2 = toScreen(de.x, de.y);
  const halfT = (thick / 2) * scale;
  const ndx = -Math.sin(angle) * halfT, ndy = Math.cos(angle) * halfT;
  const len = Math.hypot(de.x - ds.x, de.y - ds.y);
  _ctx.save();
  _ctx.beginPath(); _ctx.moveTo(p1.x + ndx, p1.y + ndy); _ctx.lineTo(p2.x + ndx, p2.y + ndy);
  _ctx.lineTo(p2.x - ndx, p2.y - ndy); _ctx.lineTo(p1.x - ndx, p1.y - ndy); _ctx.closePath();
  _ctx.fillStyle = DRAW_COLORS.previewFill; _ctx.fill();
  _ctx.strokeStyle = DRAW_COLORS.previewStroke; _ctx.lineWidth = 1.5; _ctx.setLineDash([6, 4]); _ctx.stroke(); _ctx.setLineDash([]);
  _ctx.beginPath(); _ctx.moveTo(ps1.x, ps1.y); _ctx.lineTo(ps2.x, ps2.y);
  _ctx.strokeStyle = DRAW_COLORS.previewCenterLine; _ctx.lineWidth = 0.8; _ctx.setLineDash([3, 4]); _ctx.stroke(); _ctx.setLineDash([]);
  _ctx.beginPath(); _ctx.arc(ps1.x, ps1.y, chainMode ? 6 : 4, 0, Math.PI * 2);
  _ctx.fillStyle = chainMode ? DRAW_COLORS.handleActive : DRAW_COLORS.previewStroke; _ctx.fill(); _ctx.strokeStyle = '#fff'; _ctx.lineWidth = 1.5; _ctx.stroke();
  const snapType = de.snapType, endSnap = !!snapType || de.snappedToEndpoint;
  const scm = { corner: DRAW_COLORS.corner, endpoint: DRAW_COLORS.endpoint, midpoint: DRAW_COLORS.midpoint,
    intersection: DRAW_COLORS.intersection, perpendicular: DRAW_COLORS.perpendicular, wallFace: DRAW_COLORS.wallFace, wallAxis: DRAW_COLORS.wallAxis };
  _ctx.beginPath(); _ctx.arc(ps2.x, ps2.y, endSnap ? 8 : 4, 0, Math.PI * 2);
  _ctx.fillStyle = scm[snapType] || (endSnap ? DRAW_COLORS.endpoint : DRAW_COLORS.previewStroke);
  _ctx.fill(); _ctx.strokeStyle = '#fff'; _ctx.lineWidth = 1.5; _ctx.stroke();
  if (endSnap) { _ctx.beginPath(); _ctx.arc(ps2.x, ps2.y, 14, 0, Math.PI * 2); _ctx.strokeStyle = 'rgba(55,65,81,0.35)'; _ctx.lineWidth = 2; _ctx.stroke(); }
  if (chainMode) {
    _ctx.fillStyle = 'rgba(55,65,81,0.92)'; _ctx.beginPath();
    if (_ctx.roundRect) _ctx.roundRect(8, 32, 130, 20, 4); else _ctx.rect(8, 32, 130, 20); _ctx.fill();
    _ctx.fillStyle = '#fff'; _ctx.font = '600 11px Onest, Inter, sans-serif'; _ctx.textAlign = 'left'; _ctx.textBaseline = 'middle';
    _ctx.fillText('⛓ Цепочка стен · Esc — стоп', 14, 42);
  }
  _ctx.restore();
  const midX = (ps1.x + ps2.x) / 2, midY = (ps1.y + ps2.y) / 2;
  if (lengthOverlay) lengthOverlay.style.display = 'block';
  if (lengthLabel) { lengthLabel.style.left = midX + 'px'; lengthLabel.style.top = (midY - 8) + 'px';
    lengthLabel.textContent = (lengthMode && lengthInput) ? `${lengthInput}_ мм` : `${Math.round(len)} мм`; }
  if (lblLen) lblLen.style.display = 'inline';
  if (lblLenVal) lblLenVal.textContent = Math.round(len);
}

function drawGuideLine(guide) {
  const anchor = toScreen(guide.anchor.x, guide.anchor.y); _ctx.save();
  const axisColors = ['rgba(80,100,180,0.28)', 'rgba(120,140,180,0.18)'];
  getGuideAxes(guide).forEach((axis, i) => {
    const { start, end } = getGuideLineScreenEndpoints({ anchor: guide.anchor, dir: axis.dir });
    _ctx.strokeStyle = axisColors[i]; _ctx.lineWidth = 0.8; _ctx.setLineDash([4, 6]);
    _ctx.beginPath(); _ctx.moveTo(start.x, start.y); _ctx.lineTo(end.x, end.y); _ctx.stroke();
  });
  _ctx.setLineDash([]); _ctx.fillStyle = 'rgba(80,100,180,0.55)';
  _ctx.beginPath(); _ctx.arc(anchor.x, anchor.y, 3, 0, Math.PI * 2); _ctx.fill();
  _ctx.strokeStyle = '#fff'; _ctx.lineWidth = 1; _ctx.stroke(); _ctx.restore();
}

function drawCornerHotspots(snap) {
  const pts = new Map();
  if (Array.isArray(snap.highlightPoints) && snap.highlightPoints.length)
    snap.highlightPoints.forEach(p => { const k = `${Math.round(p.x)},${Math.round(p.y)}`; if (!pts.has(k)) pts.set(k, p); });
  else {
    const ids = snap.wallIds?.length ? snap.wallIds : snap.wallId ? [snap.wallId] : [];
    for (const id of ids) { const w = appState.walls.find(v => v.id === id); if (!w) continue;
      for (const p of getWallCornerPoints(w)) { const k = `${Math.round(p.x)},${Math.round(p.y)}`; if (!pts.has(k)) pts.set(k, p); } }
  }
  _ctx.save();
  for (const p of pts.values()) { const s = toScreen(p.x, p.y), active = Math.hypot(p.x - snap.x, p.y - snap.y) < 1;
    _ctx.beginPath(); _ctx.arc(s.x, s.y, active ? 5 : 4, 0, Math.PI * 2);
    _ctx.fillStyle = '#fff'; _ctx.fill(); _ctx.strokeStyle = active ? DRAW_COLORS.corner : 'rgba(17,24,39,0.35)';
    _ctx.lineWidth = active ? 2 : 1.5; _ctx.stroke(); }
  _ctx.restore();
}

function drawObjectSnap(snap) {
  const p = toScreen(snap.x, snap.y);
  const cm = { corner: DRAW_COLORS.corner, endpoint: DRAW_COLORS.endpoint, midpoint: DRAW_COLORS.midpoint,
    intersection: DRAW_COLORS.intersection, perpendicular: DRAW_COLORS.perpendicular, wallFace: DRAW_COLORS.wallFace, wallAxis: DRAW_COLORS.wallAxis };
  const color = cm[snap.type] || DRAW_COLORS.previewStroke;
  _ctx.save(); _ctx.strokeStyle = color; _ctx.fillStyle = '#fff'; _ctx.lineWidth = 2;
  if (snap.type === 'corner' || snap.type === 'endpoint') { _ctx.beginPath(); _ctx.rect(p.x - 4.5, p.y - 4.5, 9, 9); _ctx.fill(); _ctx.stroke(); }
  else if (snap.type === 'midpoint') { _ctx.beginPath(); _ctx.moveTo(p.x, p.y - 6); _ctx.lineTo(p.x + 6, p.y); _ctx.lineTo(p.x, p.y + 6); _ctx.lineTo(p.x - 6, p.y); _ctx.closePath(); _ctx.fill(); _ctx.stroke(); }
  else if (snap.type === 'intersection') { _ctx.beginPath(); _ctx.arc(p.x, p.y, 6, 0, Math.PI * 2); _ctx.fill(); _ctx.stroke(); }
  else if (snap.type === 'wallFace' || snap.type === 'wallAxis') {
    const wa = snap.wallAngle || 0, ux = Math.cos(wa), uy = Math.sin(wa), nx = -uy, ny = ux;
    _ctx.beginPath(); _ctx.moveTo(p.x - ux * 7, p.y - uy * 7); _ctx.lineTo(p.x + ux * 7, p.y + uy * 7);
    _ctx.moveTo(p.x - nx * 4, p.y - ny * 4); _ctx.lineTo(p.x + nx * 4, p.y + ny * 4); _ctx.stroke();
    _ctx.beginPath(); _ctx.arc(p.x, p.y, snap.type === 'wallFace' ? 4.5 : 3.5, 0, Math.PI * 2); _ctx.fill(); _ctx.stroke();
  }
  drawAlignedTextBox(snap.label, { x: p.x, y: p.y - 18 }, 0, { textColor: color, background: 'rgba(255,255,255,0.96)' });
  _ctx.restore();
}

function drawSelectionBox(start, current) {
  if (!start || !current) return;
  const box = { left: Math.min(start.x, current.x), top: Math.min(start.y, current.y), right: Math.max(start.x, current.x), bottom: Math.max(start.y, current.y) };
  if ((box.right - box.left) <= 5 && (box.bottom - box.top) <= 5) return;
  _ctx.save(); _ctx.fillStyle = DRAW_COLORS.selectionFill; _ctx.strokeStyle = DRAW_COLORS.selectionStroke;
  _ctx.lineWidth = 1; _ctx.setLineDash([6, 4]);
  _ctx.fillRect(box.left, box.top, box.right - box.left, box.bottom - box.top);
  _ctx.strokeRect(box.left, box.top, box.right - box.left, box.bottom - box.top);
  _ctx.setLineDash([]); _ctx.restore();
}

function drawCursorGhost(ps) {
  const { tool, mouseScreen, isPanning, inpWallThick } = ps;
  if (!mouseScreen || isPanning || (tool !== 'window' && tool !== 'door')) return;
  const scale = _getScale(), thick = parseFloat(inpWallThick?.value) || 200;
  const w = parseFloat(document.getElementById(tool === 'window' ? 'inpWindowWidth' : 'inpDoorWidth')?.value) || (tool === 'window' ? 1200 : 900);
  const h = parseFloat(document.getElementById(tool === 'window' ? 'inpWindowHeight' : 'inpDoorHeight')?.value) || (tool === 'window' ? 1500 : 2100);
  const gw = Math.max(36, Math.min(220, w * scale)), gd = Math.max(12, Math.min(40, thick * scale));
  const ox = Math.min(_canvas.width - gw - 84, mouseScreen.x + 18), oy = Math.min(_canvas.height - 62, mouseScreen.y + 18);
  _ctx.save(); _ctx.translate(ox, oy);
  _ctx.fillStyle = 'rgba(255,255,255,0.92)'; _ctx.strokeStyle = tool === 'window' ? DRAW_COLORS.windowStroke : DRAW_COLORS.doorStroke; _ctx.lineWidth = 1.2;
  _ctx.beginPath(); if (_ctx.roundRect) _ctx.roundRect(-8, -8, gw + 16, gd + 34, 10); else _ctx.rect(-8, -8, gw + 16, gd + 34); _ctx.fill(); _ctx.stroke();
  _ctx.beginPath(); _ctx.rect(0, 0, gw, gd);
  _ctx.fillStyle = tool === 'window' ? DRAW_COLORS.windowHover : DRAW_COLORS.doorHover; _ctx.fill();
  _ctx.strokeStyle = tool === 'window' ? DRAW_COLORS.windowStroke : DRAW_COLORS.doorStroke; _ctx.stroke();
  _ctx.fillStyle = DRAW_COLORS.roomLabel; _ctx.font = '600 10px Onest, Inter, sans-serif'; _ctx.textAlign = 'left'; _ctx.textBaseline = 'top';
  _ctx.fillText(`${w} × ${h} мм`, 0, gd + 8); _ctx.restore();
}
