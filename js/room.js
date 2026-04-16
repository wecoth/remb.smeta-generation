// ─── ROOM.JS ──────────────────────────────────────────────────────
// Расчёт помещений: flood fill + полные метрики по ТЗ
// ──────────────────────────────────────────────────────────────────
import { appState, ROOM_STROKES } from './state.js';

// ── Room key ──────────────────────────────────────────────────────
export function getRoomKey(pixels, cellMm) {
  if (!pixels.length) return '0,0';
  let sx = 0, sy = 0;
  for (const [px, py] of pixels) { sx += px; sy += py; }
  const cx = Math.round((sx / pixels.length * cellMm) / 50) * 50;
  const cy = Math.round((sy / pixels.length * cellMm) / 50) * 50;
  return `${cx},${cy}`;
}

export function roomDefaultName(index) { return `Комната ${index + 1}`; }

export function renameRoom(roomKey, nextName) {
  const room = appState.rooms.find(r => r.key === roomKey);
  if (!room) return;
  const normalized = (nextName || '').trim();
  if (!normalized || normalized === room.defaultName) {
    delete appState.roomNameOverrides[roomKey];
  } else {
    appState.roomNameOverrides[roomKey] = normalized;
  }
  for (const r of appState.rooms) {
    r.name = appState.roomNameOverrides[r.key] || r.defaultName;
  }
}

// ══════════════════════════════════════════════════════════════════
// FLOOD FILL
// ══════════════════════════════════════════════════════════════════
const CELL_MM = 50;

export function computeRooms(wallHeightFallback = 2700) {
  appState.rooms = [];
  if (appState.walls.length < 3) return;

  // ── 1. Bbox ────────────────────────────────────────────────────
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const w of appState.walls) {
    const half = w.thickness / 2 + 5;
    minX = Math.min(minX, w.x1 - half, w.x2 - half);
    minY = Math.min(minY, w.y1 - half, w.y2 - half);
    maxX = Math.max(maxX, w.x1 + half, w.x2 + half);
    maxY = Math.max(maxY, w.y1 + half, w.y2 + half);
  }
  const PAD = CELL_MM * 2;
  minX -= PAD; minY -= PAD; maxX += PAD; maxY += PAD;

  const cols = Math.ceil((maxX - minX) / CELL_MM) + 1;
  const rows = Math.ceil((maxY - minY) / CELL_MM) + 1;
  if (cols > 2000 || rows > 2000) return;

  // ── 2. Растеризация стен ───────────────────────────────────────
  const bitmap = new Uint8Array(cols * rows);
  for (const w of appState.walls) rasterizeWall(w, bitmap, cols, rows, minX, minY);

  // ── 3. BFS flood fill ──────────────────────────────────────────
  const regionId          = new Int32Array(cols * rows);
  let nextId = 1;
  const regionPixels      = new Map();
  const regionTouchesEdge = new Set();

  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const idx = gy * cols + gx;
      if (bitmap[idx] !== 0 || regionId[idx] !== 0) continue;

      const id = nextId++;
      const pixels = [];
      const queue  = [idx];
      regionId[idx] = id;
      let touchesEdge = false;

      while (queue.length) {
        const ci = queue.pop();
        const cx = ci % cols, cy = (ci / cols) | 0;
        pixels.push([cx, cy]);
        if (cx === 0 || cy === 0 || cx === cols - 1 || cy === rows - 1) touchesEdge = true;
        for (const [nx, ny] of [[cx-1,cy],[cx+1,cy],[cx,cy-1],[cx,cy+1]]) {
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          const ni = ny * cols + nx;
          if (bitmap[ni] !== 0 || regionId[ni] !== 0) continue;
          regionId[ni] = id;
          queue.push(ni);
        }
      }
      regionPixels.set(id, pixels);
      if (touchesEdge) regionTouchesEdge.add(id);
    }
  }

  // ── 4. Метрики ─────────────────────────────────────────────────
  const cellArea    = CELL_MM * CELL_MM;
  const minRoomArea = 100000; // 0.1 м²

  for (const [id, pixels] of regionPixels) {
    if (regionTouchesEdge.has(id)) continue;
    const areaMm2 = pixels.length * cellArea;
    if (areaMm2 < minRoomArea) continue;

    // Центроид
    let sumX = 0, sumY = 0;
    for (const [gx, gy] of pixels) { sumX += gx; sumY += gy; }
    const centerWorld = {
      x: minX + (sumX / pixels.length + 0.5) * CELL_MM,
      y: minY + (sumY / pixels.length + 0.5) * CELL_MM,
    };

    // Граничные стены
    const boundaryWalls = new Map();
    for (const [gx, gy] of pixels) {
      for (const [nx, ny] of [[gx-1,gy],[gx+1,gy],[gx,gy-1],[gx,gy+1]]) {
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        if (bitmap[ny * cols + nx] === 1) {
          const wx = minX + (nx + 0.5) * CELL_MM, wy = minY + (ny + 0.5) * CELL_MM;
          const wall = findWallAtPoint(wx, wy);
          if (wall && !boundaryWalls.has(wall.id)) boundaryWalls.set(wall.id, wall);
        }
      }
    }

    // Высота
    let roomHeightMm = wallHeightFallback;
    for (const wall of boundaryWalls.values()) {
      if (wall.height && wall.height < roomHeightMm) roomHeightMm = wall.height;
    }

    // Проёмы
    const roomOpenings = appState.openings.filter(op => boundaryWalls.has(op.wallId));

    // Полные метрики
    const metrics = computeRoomMetrics(
      [...boundaryWalls.values()], roomOpenings, roomHeightMm, centerWorld
    );

    // cells для render.js
    const cells = pixels.map(([gx, gy]) => ({
      x1: minX + gx * CELL_MM,       y1: minY + gy * CELL_MM,
      x2: minX + (gx + 1) * CELL_MM, y2: minY + (gy + 1) * CELL_MM,
    }));

    // boundarySegments для render.js
    const boundarySegments = [];
    for (const wall of boundaryWalls.values()) {
      boundarySegments.push({
        orientation: Math.abs(wall.y2 - wall.y1) < Math.abs(wall.x2 - wall.x1) ? 'h' : 'v',
        x1: Math.min(wall.x1, wall.x2), y1: Math.min(wall.y1, wall.y2),
        x2: Math.max(wall.x1, wall.x2), y2: Math.max(wall.y1, wall.y2),
        length: Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1),
        wall,
      });
    }

    const key         = getRoomKey(pixels, CELL_MM);
    const defaultName = roomDefaultName(appState.rooms.length);

    appState.rooms.push({
      key, cells, boundarySegments, center: centerWorld,
      defaultName,
      name: appState.roomNameOverrides[key] || defaultName,

      // Базовые поля (обратная совместимость с render.js / smeta.js)
      area:         areaMm2 / 1e6,
      volume:       areaMm2 * roomHeightMm / 1e9,
      height:       roomHeightMm / 1000,
      perimeter:    metrics.perimeterFloorM,
      wallArea:     metrics.wallAreaNetM2,
      openingsArea: metrics.openingsAreaM2,

      // Все метрики по ТЗ
      metrics,
    });
  }
}

// ══════════════════════════════════════════════════════════════════
// РАСЧЁТ МЕТРИК ПОМЕЩЕНИЯ
// ══════════════════════════════════════════════════════════════════
function computeRoomMetrics(walls, openings, heightMm, center) {
  const heightM = heightMm / 1000;

  // Упорядоченный контур стен
  const orderedWalls = orderBoundaryWalls(walls);

  // Сегменты стен (разбитые по проёмам)
  const wallSegData = buildWallSegments(orderedWalls, openings);

  // ── Площадь пола ───────────────────────────────────────────────
  // Считается flood fill-ом (areaMm2) — передаём из caller
  // Здесь пересчитаем из периметра для консистентности не нужно —
  // площадь пола уже есть в appState.rooms[i].area
  // Просто пробрасываем нужные поля.

  // ── Периметр пола (за вычетом дверей) ─────────────────────────
  let perimeterRawMm = 0;
  for (const w of orderedWalls) perimeterRawMm += wallLengthMm(w);
  let doorWidthsMm = 0;
  for (const op of openings) {
    if (op.type === 'door') doorWidthsMm += op.width;
  }
  const perimeterFloorM = Math.max(0, perimeterRawMm - doorWidthsMm) / 1000;

  // ── Площадь стен (чистовая) ────────────────────────────────────
  let wallAreaGrossM2 = 0;
  let narrowWallsLm   = 0;  // простенки < 50 см
  let openingsAreaM2  = 0;

  for (const { wall, segments } of wallSegData) {
    for (const seg of segments) {
      if (seg.widthMm < 500) {
        // Узкий участок — идёт в погонаж, не в площадь
        narrowWallsLm += heightM;
      } else {
        wallAreaGrossM2 += (seg.widthMm / 1000) * heightM;
      }
    }
    // Площадь проёмов на этой стене
    for (const op of openings.filter(op => op.wallId === wall.id)) {
      openingsAreaM2 += (op.width * op.height) / 1e6;
    }
  }
  const wallAreaNetM2 = Math.max(0, wallAreaGrossM2 - openingsAreaM2);

  // ── Углы помещения ─────────────────────────────────────────────
  const cornerStats = computeCornerStats(orderedWalls, center);

  // ── Откосы ─────────────────────────────────────────────────────
  // Оконные: верх + 2 боковины (подоконная сторона не считается)
  // Дверные:  верх + 2 боковины (порог не считается)
  let windowRevealsLm = 0, doorRevealsLm = 0;
  let windowCount = 0, doorCount = 0;
  let windowAreaM2 = 0, doorAreaM2 = 0;

  for (const op of openings) {
    if (op.type === 'window') {
      windowRevealsLm += (op.width + 2 * op.height) / 1000;
      windowAreaM2    += (op.width * op.height) / 1e6;
      windowCount++;
    } else if (op.type === 'door') {
      doorRevealsLm += (op.width + 2 * op.height) / 1000;
      doorAreaM2    += (op.width * op.height) / 1e6;
      doorCount++;
    }
  }

  // ── Внешние углы на откосах ────────────────────────────────────
  // На каждый проём: 2 вертикальных ребра (стык откоса со стеной)
  let revealOuterCornersLm = 0;
  for (const op of openings) {
    revealOuterCornersLm += 2 * op.height / 1000;
  }

  return {
    // Площадь пола — будет заполнена из areaMm2 в caller, здесь плейсхолдер
    floorAreaM2:          0, // overridden below

    // Периметр пола (без дверей)
    perimeterFloorM:      round2(perimeterFloorM),

    // Площадь стен
    wallAreaNetM2:        round2(wallAreaNetM2),
    wallAreaGrossM2:      round2(wallAreaGrossM2),
    openingsAreaM2:       round2(openingsAreaM2),

    // Узкие простенки < 50 см
    narrowWallsLm:        round2(narrowWallsLm),

    // Углы
    cornersInner:         cornerStats.inner,
    cornersOuter:         cornerStats.outer,
    outerCornersLm:       round2(cornerStats.outer * heightM),

    // Откосы
    windowRevealsLm:      round2(windowRevealsLm),
    doorRevealsLm:        round2(doorRevealsLm),
    revealOuterCornersLm: round2(revealOuterCornersLm),

    // Проёмы
    windowCount, doorCount,
    windowAreaM2:         round2(windowAreaM2),
    doorAreaM2:           round2(doorAreaM2),

    heightM:              round2(heightM),
  };
}

// ══════════════════════════════════════════════════════════════════
// УПОРЯДОЧИВАНИЕ ГРАНИЧНЫХ СТЕН В ЦЕПОЧКУ
// ══════════════════════════════════════════════════════════════════
const SNAP_TOL_SQ = 200 * 200; // 200 мм допуск

function orderBoundaryWalls(walls) {
  if (walls.length <= 1) return walls;

  const used   = new Array(walls.length).fill(false);
  const result = [walls[0]];
  used[0] = true;

  for (let step = 1; step < walls.length; step++) {
    const last    = result[result.length - 1];
    const lastEnd = wallEnd(last);
    let bestIdx = -1, bestDist = Infinity;

    for (let i = 0; i < walls.length; i++) {
      if (used[i]) continue;
      const d = Math.min(dist2(lastEnd, wallStart(walls[i])), dist2(lastEnd, wallEnd(walls[i])));
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }

    if (bestIdx < 0 || bestDist > SNAP_TOL_SQ) break;

    const next = walls[bestIdx];
    result.push(dist2(lastEnd, wallEnd(next)) < dist2(lastEnd, wallStart(next))
      ? reversedWall(next) : next);
    used[bestIdx] = true;
  }

  return result;
}

function wallStart(w) { return { x: w.cx1 ?? w.x1, y: w.cy1 ?? w.y1 }; }
function wallEnd(w)   { return { x: w.cx2 ?? w.x2, y: w.cy2 ?? w.y2 }; }
function wallLengthMm(w) {
  const s = wallStart(w), e = wallEnd(w);
  return Math.hypot(e.x - s.x, e.y - s.y);
}
function reversedWall(w) {
  return { ...w,
    cx1: w.cx2 ?? w.x2, cy1: w.cy2 ?? w.y2,
    cx2: w.cx1 ?? w.x1, cy2: w.cy1 ?? w.y1,
    x1: w.x2, y1: w.y2, x2: w.x1, y2: w.y1,
  };
}
function dist2(a, b) { return (a.x - b.x) ** 2 + (a.y - b.y) ** 2; }

// ══════════════════════════════════════════════════════════════════
// СЕГМЕНТЫ СТЕНЫ (разбивка по проёмам)
// ══════════════════════════════════════════════════════════════════
function buildWallSegments(walls, openings) {
  return walls.map(wall => {
    const lenMm = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
    if (lenMm < 1) return { wall, segments: [] };

    const wallOps = openings
      .filter(op => op.wallId === wall.id)
      .map(op => ({
        startMm: (op.t - op.width / 2 / lenMm) * lenMm,
        endMm:   (op.t + op.width / 2 / lenMm) * lenMm,
      }))
      .sort((a, b) => a.startMm - b.startMm);

    const segments = [];
    let cursor = 0;

    for (const op of wallOps) {
      const start = Math.max(0, op.startMm);
      const end   = Math.min(lenMm, op.endMm);
      if (start > cursor + 0.5) {
        segments.push({ startMm: cursor, endMm: start, widthMm: start - cursor });
      }
      cursor = end;
    }
    if (cursor < lenMm - 0.5) {
      segments.push({ startMm: cursor, endMm: lenMm, widthMm: lenMm - cursor });
    }

    return { wall, segments };
  });
}

// ══════════════════════════════════════════════════════════════════
// УГЛЫ ПОМЕЩЕНИЯ
// ══════════════════════════════════════════════════════════════════
// Cross product соседних стен при обходе контура.
// Знак нормируется по знаку площади (Shoelace formula) чтобы
// правильно работать и для CW и для CCW обхода.
function computeCornerStats(walls, center) {
  if (walls.length < 2) return { inner: 0, outer: 0 };

  const n = walls.length;
  let inner = 0, outer = 0;

  // Знак обхода через Shoelace
  let signedArea = 0;
  for (let i = 0; i < n; i++) {
    const s = wallStart(walls[i]), e = wallEnd(walls[i]);
    signedArea += s.x * e.y - e.x * s.y;
  }
  // signedArea > 0 = CCW (математич.), < 0 = CW (экран Y-вниз)

  for (let i = 0; i < n; i++) {
    const curr = walls[i];
    const next = walls[(i + 1) % n];

    const dx1 = wallEnd(curr).x - wallStart(curr).x;
    const dy1 = wallEnd(curr).y - wallStart(curr).y;
    const dx2 = wallEnd(next).x - wallStart(next).x;
    const dy2 = wallEnd(next).y - wallStart(next).y;

    const cross = dx1 * dy2 - dy1 * dx2;
    if (Math.abs(cross) < 0.001) continue; // коллинеарные — не угол

    // При CW обходе (Y-вниз, signedArea < 0):
    //   cross > 0 → CCW поворот → выступ наружу → внешний угол помещения
    //   cross < 0 → CW поворот  → вгиб → внутренний угол
    // При CCW обходе — наоборот
    const isInterior = signedArea < 0 ? cross < 0 : cross > 0;

    if (isInterior) inner++;
    else outer++;
  }

  return { inner, outer };
}

// ══════════════════════════════════════════════════════════════════
// РАСТЕРИЗАЦИЯ СТЕНЫ В BITMAP
// ══════════════════════════════════════════════════════════════════
function rasterizeWall(wall, bitmap, cols, rows, minX, minY) {
  const angle = Math.atan2(wall.y2 - wall.y1, wall.x2 - wall.x1);
  // inflate только поперёк — НЕ вдоль (вдоль inflate убит: он ломал треугольники)
  const INFLATE_PERP = CELL_MM * 0.5;
  const half = wall.thickness / 2 + INFLATE_PERP;
  const sinA = Math.sin(angle), cosA = Math.cos(angle);
  const dx = -sinA * half, dy = cosA * half;

  const corners = [
    { x: wall.x1 + dx, y: wall.y1 + dy },
    { x: wall.x2 + dx, y: wall.y2 + dy },
    { x: wall.x2 - dx, y: wall.y2 - dy },
    { x: wall.x1 - dx, y: wall.y1 - dy },
  ];

  let gxMin = Infinity, gyMin = Infinity, gxMax = -Infinity, gyMax = -Infinity;
  for (const c of corners) {
    const gx = (c.x - minX) / CELL_MM, gy = (c.y - minY) / CELL_MM;
    gxMin = Math.min(gxMin, gx); gyMin = Math.min(gyMin, gy);
    gxMax = Math.max(gxMax, gx); gyMax = Math.max(gyMax, gy);
  }
  gxMin = Math.max(0, Math.floor(gxMin) - 1);
  gyMin = Math.max(0, Math.floor(gyMin) - 1);
  gxMax = Math.min(cols - 1, Math.ceil(gxMax) + 1);
  gyMax = Math.min(rows - 1, Math.ceil(gyMax) + 1);

  const edges = [];
  for (let i = 0; i < 4; i++) {
    const a = corners[i], b = corners[(i + 1) % 4];
    edges.push({ ax: a.x, ay: a.y, nx: -(b.y - a.y), ny: b.x - a.x });
  }

  for (let gy = gyMin; gy <= gyMax; gy++) {
    for (let gx = gxMin; gx <= gxMax; gx++) {
      const wx = minX + (gx + 0.5) * CELL_MM, wy = minY + (gy + 0.5) * CELL_MM;
      let inside = true;
      for (const e of edges) {
        if ((wx - e.ax) * e.nx + (wy - e.ay) * e.ny > 0) { inside = false; break; }
      }
      if (inside) bitmap[gy * cols + gx] = 1;
    }
  }
}

// ── Найти стену в мировой точке ───────────────────────────────────
function findWallAtPoint(wx, wy) {
  for (const w of appState.walls) {
    const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
    if (len < 0.001) continue;
    const ux = (w.x2 - w.x1) / len, uy = (w.y2 - w.y1) / len;
    const nx = -uy, ny = ux;
    const rx = wx - w.x1, ry = wy - w.y1;
    const along  = rx * ux + ry * uy;
    const normal = rx * nx + ry * ny;
    if (along >= -CELL_MM && along <= len + CELL_MM &&
        Math.abs(normal) <= w.thickness / 2 + CELL_MM) return w;
  }
  return null;
}

function round2(v) { return Math.round(v * 100) / 100; }

// ══════════════════════════════════════════════════════════════════
// DOM — ЭКСПЛИКАЦИЯ
// ══════════════════════════════════════════════════════════════════
export function updateExpl(explBody, roomCountEl) {
  if (!explBody) return;
  if (roomCountEl) roomCountEl.textContent = appState.rooms.length;

  if (!appState.rooms.length) {
    explBody.innerHTML = `<tr class="empty-row"><td colspan="9">Нарисуйте замкнутый контур — появятся все метрики</td></tr>`;
    return;
  }

  explBody.innerHTML = appState.rooms.map((r, i) => {
    const m     = r.metrics || {};
    const color = ROOM_STROKES[i % ROOM_STROKES.length].replace('0.4', '0.8');

    const fmt = (v, def = '—') => (v != null && v > 0) ? v.toFixed(2) : def;

    const cornersStr = (m.cornersInner != null)
      ? `${m.cornersInner} / ${m.cornersOuter}`
      : '—';

    return `<tr>
      <td><div class="room-name-cell">
        <span class="room-dot" style="background:${color}"></span>
        <input class="room-name-input" type="text" value="${escHtml(r.name)}"
          data-room-key="${escHtml(r.key)}" data-room-default="${escHtml(r.defaultName)}">
      </div></td>
      <td>${r.area.toFixed(2)}</td>
      <td>${fmt(m.wallAreaNetM2, r.wallArea.toFixed(2))}</td>
      <td>${fmt(m.perimeterFloorM, r.perimeter.toFixed(2))}</td>
      <td>${(r.height || 0).toFixed(2)}</td>
      <td title="вн / нар">${cornersStr}</td>
      <td title="Внешние углы стен, м.п.">${fmt(m.outerCornersLm)}</td>
      <td title="Откосы окон / дверей, м.п.">${fmt(m.windowRevealsLm)} / ${fmt(m.doorRevealsLm)}</td>
      <td title="Простенки < 50 см, м.п.">${fmt(m.narrowWallsLm)}</td>
    </tr>`;
  }).join('');
}

function escHtml(s) {
  return String(s || '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

// ══════════════════════════════════════════════════════════════════
// ЭКСПОРТ В СМЕТУ
// ══════════════════════════════════════════════════════════════════
export function getComputedRooms() {
  return appState.rooms.map(r => {
    const m = r.metrics || {};
    return {
      name:                 r.name,
      floorArea:            r.area,
      wallsArea:            m.wallAreaNetM2        ?? r.wallArea,
      perimeter:            m.perimeterFloorM      ?? r.perimeter,
      height:               r.height               ?? 0,
      cornersInner:         m.cornersInner         ?? 0,
      cornersOuter:         m.cornersOuter         ?? 0,
      outerCornersLm:       m.outerCornersLm       ?? 0,
      windowRevealsLm:      m.windowRevealsLm      ?? 0,
      doorRevealsLm:        m.doorRevealsLm        ?? 0,
      revealOuterCornersLm: m.revealOuterCornersLm ?? 0,
      narrowWallsLm:        m.narrowWallsLm        ?? 0,
      windowCount:          m.windowCount          ?? 0,
      doorCount:            m.doorCount            ?? 0,
      windowAreaM2:         m.windowAreaM2         ?? 0,
      doorAreaM2:           m.doorAreaM2           ?? 0,
    };
  });
}
