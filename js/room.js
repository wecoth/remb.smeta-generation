// ─── ROOM.JS ──────────────────────────────────────────────────────
import { appState, ROOM_STROKES } from './state.js';
import { EventBus } from './eventBus.js';
import { getUnifiedWallsPolygon } from './wall.js';
import polygonClipping from 'https://cdn.jsdelivr.net/npm/polygon-clipping@0.15.7/+esm';
import { projectPointOntoSegment } from './geometry.js';

// ── Высота стен по умолчанию — обновляется из ui-planner.js ──────
// Хранится здесь, чтобы room.js мог автономно пересчитывать комнаты.
let _wallHeightFallback = 2700;

export function setWallHeight(h) {
  _wallHeightFallback = (h && h > 0) ? h : 2700;
}

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

// Экспортируется для render.js (выноски входной двери)
export let exteriorWallIds = new Set();

export function computeRooms(wallHeightFallback = 2700) {
  _wallHeightFallback = wallHeightFallback > 0 ? wallHeightFallback : 2700;
  appState.rooms = [];
  if (appState.walls.length < 3) { EventBus.emit('rooms:computed'); return; }

  // ── 1. Объединённый полигон всех стен ──────────────────────────
  const unified = getUnifiedWallsPolygon();
  if (!unified || unified.length === 0) { EventBus.emit('rooms:computed'); return; }

  // ── 2. Bounding box + внешний прямоугольник ─────────────────────
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const w of appState.walls) {
    const half = w.thickness / 2;
    minX = Math.min(minX, w.x1 - half, w.x2 - half);
    minY = Math.min(minY, w.y1 - half, w.y2 - half);
    maxX = Math.max(maxX, w.x1 + half, w.x2 + half);
    maxY = Math.max(maxY, w.y1 + half, w.y2 + half);
  }
  const PAD = 2000; // 2м — внешняя пустота всегда касается этого края
  minX -= PAD; minY -= PAD; maxX += PAD; maxY += PAD;

  // ── 3. Пустоты = outerRect − unified ───────────────────────────
  // КЛЮЧЕВОЕ: если стены не замкнуты полностью (есть зазор),
  // polygon-clipping НЕ создаст внутреннюю пустоту → комнаты нет.
  // Это обеспечивает строгое требование "только при полном замыкании".
  const outerRect = [[[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]]];
  let voids;
  try {
    voids = polygonClipping.difference(outerRect, ...unified);
  } catch (e) {
    console.warn('[REMB] room detection failed:', e);
    EventBus.emit('rooms:computed');
    return;
  }

  if (!voids || voids.length === 0) { EventBus.emit('rooms:computed'); return; }

  // ── 4. Exterior walls (нужны для выноски входной двери) ─────────
  exteriorWallIds = _findExteriorWalls(unified);

  // ── 5. Каждая пустота = потенциальная комната ──────────────────
  const MIN_AREA_MM2 = 100000; // 0.1 м² — шумовой фильтр

  for (const voidPoly of voids) {
    // Внешняя пустота касается bbox — пропускаем
    if (_touchesBbox(voidPoly, minX, minY, maxX, maxY, PAD * 0.8)) continue;

    const outerRing = voidPoly[0];
    const area = Math.abs(_ringArea(outerRing));
    if (area < MIN_AREA_MM2) continue;

    const center = _ringCentroid(outerRing);

    // Граничные стены: стены вплотную к краю пустоты
    const boundaryWalls = _findBoundaryWalls(outerRing, appState.walls);

    // Высота комнаты (минимальная из граничных стен)
    let roomHeightMm = _wallHeightFallback;
    for (const w of boundaryWalls) {
      if (w.height && w.height > 0 && w.height < roomHeightMm) roomHeightMm = w.height;
    }

    const boundaryWallIds = new Set(boundaryWalls.map(w => w.id));
    const roomOpenings = appState.openings.filter(op => boundaryWallIds.has(op.wallId));
    const entranceDoorId = detectEntranceDoor(roomOpenings, exteriorWallIds);
    const metrics = computeRoomMetrics(boundaryWalls, roomOpenings, roomHeightMm, center, entranceDoorId);

    // boundarySegments — нужны для render.js (wallInteriorSide, opening leaders)
    const boundarySegments = boundaryWalls.map(wall => ({
      orientation: Math.abs(wall.y2 - wall.y1) < Math.abs(wall.x2 - wall.x1) ? 'h' : 'v',
      x1: Math.min(wall.x1, wall.x2), y1: Math.min(wall.y1, wall.y2),
      x2: Math.max(wall.x1, wall.x2), y2: Math.max(wall.y1, wall.y2),
      length: Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1),
      wall,
    }));

    // Ключ: центроид, округлённый до 50мм — совместимость с roomNameOverrides
    const key = `${Math.round(center.x / 50) * 50},${Math.round(center.y / 50) * 50}`;
    const defaultName = roomDefaultName(appState.rooms.length);

    appState.rooms.push({
      key,
      // Векторный полигон для drawRoomFills
      polygon: [voidPoly],
      cells: null, // не используется в векторном режиме
      boundarySegments,
      center,
      defaultName,
      name: appState.roomNameOverrides[key] || defaultName,
      area:         area / 1e6,
      volume:       area * roomHeightMm / 1e9,
      height:       roomHeightMm / 1000,
      perimeter:    metrics.perimeterFloorM,
      wallArea:     metrics.wallAreaNetM2,
      openingsArea: metrics.openingsAreaM2,
      metrics,
      wallIds: [...boundaryWallIds],
    });
  }

  // ── 6. Площадь пола под дверными проёмами делится пополам ──────
  for (const op of appState.openings) {
    if (op.type !== 'door') continue;
    const wall = appState.walls.find(w => w.id === op.wallId);
    if (!wall || wall.thickness < 1) continue;
    const borderingIndices = appState.rooms.reduce((acc, r, i) => {
      if (r.wallIds.includes(op.wallId)) acc.push(i);
      return acc;
    }, []);
    if (borderingIndices.length === 2) {
      const halfM2 = (op.width * wall.thickness) / 2 / 1e6;
      for (const idx of borderingIndices) {
        appState.rooms[idx].area  += halfM2;
        appState.rooms[idx].volume = appState.rooms[idx].area * appState.rooms[idx].height;
      }
    }
  }

  EventBus.emit('rooms:computed');
}

// ── Вспомогательные функции ───────────────────────────────────────

function _ringArea(ring) {
  let a = 0;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = ring[i], [x2, y2] = ring[(i + 1) % n];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

function _ringCentroid(ring) {
  let cx = 0, cy = 0, area = 0;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = ring[i], [x2, y2] = ring[(i + 1) % n];
    const cross = x1 * y2 - x2 * y1;
    area += cross; cx += (x1 + x2) * cross; cy += (y1 + y2) * cross;
  }
  area /= 2;
  if (Math.abs(area) < 0.001) {
    let sx = 0, sy = 0;
    for (const [x, y] of ring) { sx += x; sy += y; }
    return { x: sx / n, y: sy / n };
  }
  return { x: cx / (6 * area), y: cy / (6 * area) };
}

function _touchesBbox(poly, minX, minY, maxX, maxY, tol) {
  for (const ring of poly) {
    for (const [x, y] of ring) {
      if (x <= minX + tol || x >= maxX - tol || y <= minY + tol || y >= maxY - tol) return true;
    }
  }
  return false;
}

function _findBoundaryWalls(outerRing, walls) {
  const result = [];
  for (const wall of walls) {
    const len = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
    if (len < 1) continue;
    const tol = wall.thickness / 2 + 10; // 10мм допуск для float-погрешностей
    const seg = { x1: wall.x1, y1: wall.y1, x2: wall.x2, y2: wall.y2 };
    let found = false;
    for (const [x, y] of outerRing) {
      if (projectPointOntoSegment({ x, y }, seg).distance <= tol) { found = true; break; }
    }
    if (found) result.push(wall);
  }
  return result;
}

function _findExteriorWalls(unified) {
  const result = new Set();
  for (const wall of appState.walls) {
    const mx = (wall.x1 + wall.x2) / 2, my = (wall.y1 + wall.y2) / 2;
    const len = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
    if (len < 1) continue;
    const nx = -(wall.y2 - wall.y1) / len, ny = (wall.x2 - wall.x1) / len;
    const probe = wall.thickness / 2 + 30;
    for (const sign of [1, -1]) {
      const px = mx + nx * sign * probe, py = my + ny * sign * probe;
      let inside = false;
      for (const poly of unified) {
        if (_pointInRing(px, py, poly[0])) { inside = true; break; }
      }
      if (!inside) { result.add(wall.id); break; }
    }
  }
  return result;
}

function _pointInRing(x, y, ring) {
  let inside = false;
  const n = ring.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}


// ══════════════════════════════════════════════════════════════════
// ДЕТЕКЦИЯ ВХОДНОЙ ДВЕРИ
// ══════════════════════════════════════════════════════════════════
function detectEntranceDoor(openings, exteriorWallIds) {
  for (const op of openings) {
    if (op.type === 'door' && exteriorWallIds.has(op.wallId)) return op.id;
  }
  return null;
}

// ══════════════════════════════════════════════════════════════════
// РАСЧЁТ МЕТРИК
// ══════════════════════════════════════════════════════════════════
function computeRoomMetrics(walls, openings, heightMm, center, entranceDoorId) {
  const heightM = heightMm / 1000;

  const orderedWalls = orderBoundaryWalls(walls);
  const wallSegData  = buildWallSegments(orderedWalls, openings);

  // ── Периметр пола ─────────────────────────────────────────────
  let perimeterRawMm = 0;
  for (const w of orderedWalls) perimeterRawMm += wallLengthMm(w);

  let perimeterDeductMm = 0;
  for (const op of openings) {
    if (op.type === 'door') {
      perimeterDeductMm += op.width;
    } else if (op.type === 'window' && op.height >= heightMm * 0.95) {
      perimeterDeductMm += op.width;
    }
  }
  const perimeterFloorM = Math.max(0, perimeterRawMm - perimeterDeductMm) / 1000;

  // ── Площадь стен ──────────────────────────────────────────────
  // wallAreaGross = полная площадь по длине стены × высоту (включая зоны под проёмами).
  // Узкие участки < 500мм идут в погонаж, но считаем их как часть gross тоже.
  // Потом вычитаем только фактическую площадь проёмов (ширина × высота проёма).
  // Это исключает двойное вычитание которое было раньше (сегменты без проёма + вычет проёма).
  let wallAreaGrossM2 = 0;
  let narrowWallsLm   = 0;
  let openingsAreaM2  = 0;

  for (const { wall, segments } of wallSegData) {
    // Суммируем полную длину стены (все сегменты включая проёмы)
    // через segments мы получаем только куски между проёмами —
    // поэтому добавляем полную длину стены напрямую
    const wallLenM = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1) / 1000;
    // Узкие участки (< 500мм) — в погонаж, остальное в площадь
    // Считаем узкие участки только по сегментам (стена без проёмов)
    for (const seg of segments) {
      if (seg.widthMm < 500) {
        narrowWallsLm += heightM;
      }
    }
    wallAreaGrossM2 += wallLenM * heightM;
  }

  for (const op of openings) {
    openingsAreaM2 += (op.width * op.height) / 1e6;
  }

  const wallAreaNetM2 = Math.max(0, wallAreaGrossM2 - openingsAreaM2);

  // ── Углы ──────────────────────────────────────────────────────
  const cornerStats = computeCornerStats(orderedWalls);

  // ── Проёмы ────────────────────────────────────────────────────
  let windowAreaM2 = 0, windowCount = 0;
  let entranceDoorAreaM2 = 0;
  let windowRevealsLm = 0;

  for (const op of openings) {
    if (op.type === 'window') {
      windowAreaM2    += (op.width * op.height) / 1e6;
      windowRevealsLm += (op.width + 2 * op.height) / 1000;
      windowCount++;
    } else if (op.type === 'door' && op.id === entranceDoorId) {
      entranceDoorAreaM2 = (op.width * op.height) / 1e6;
    }
  }

  const pogonazLm = round2(narrowWallsLm + windowRevealsLm);

  // ── Внешние углы ──────────────────────────────────────────────
  const wallOuterCornersLm = round2(cornerStats.outer * heightM);
  let   revealCornersLm    = 0;
  for (const op of openings) {
    if (op.type === 'window') revealCornersLm += 2 * op.height / 1000;
  }
  const outerAnglesLm = round2(wallOuterCornersLm + revealCornersLm);

  return {
    perimeterFloorM:    round2(perimeterFloorM),
    wallAreaNetM2:      round2(wallAreaNetM2),
    wallAreaGrossM2:    round2(wallAreaGrossM2),
    openingsAreaM2:     round2(openingsAreaM2),
    narrowWallsLm:      round2(narrowWallsLm),
    cornersInner:       cornerStats.inner,
    cornersOuter:       cornerStats.outer,
    outerAnglesLm,
    windowAreaM2:       round2(windowAreaM2),
    windowCount,
    windowRevealsLm:    round2(windowRevealsLm),
    pogonazLm,
    entranceDoorAreaM2: round2(entranceDoorAreaM2),
    entranceDoorId,
    heightM:            round2(heightM),
  };
}

// ══════════════════════════════════════════════════════════════════
// УПОРЯДОЧИВАНИЕ СТЕН В ЦЕПОЧКУ
// ══════════════════════════════════════════════════════════════════
const SNAP_TOL_SQ = 200 * 200;

function orderBoundaryWalls(walls) {
  if (walls.length <= 1) return walls;
  const used   = new Array(walls.length).fill(false);
  const result = [walls[0]];
  used[0] = true;
  for (let step = 1; step < walls.length; step++) {
    const lastEnd = wallEnd(result[result.length - 1]);
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
// СЕГМЕНТЫ СТЕНЫ ПО ПРОЁМАМ
// ══════════════════════════════════════════════════════════════════
function buildWallSegments(walls, openings) {
  return walls.map(wall => {
    const lenMm = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
    if (lenMm < 1) return { wall, segments: [] };

    const wallOps = openings
      .filter(op => op.wallId === wall.id)
      .map(op => ({
        startMm: Math.max(0,     (op.t - op.width / 2 / lenMm) * lenMm),
        endMm:   Math.min(lenMm, (op.t + op.width / 2 / lenMm) * lenMm),
      }))
      .filter(op => op.endMm > op.startMm)
      .sort((a, b) => a.startMm - b.startMm);

    const segments = [];
    let cursor = 0;
    for (const op of wallOps) {
      if (op.startMm > cursor + 0.5) {
        segments.push({ startMm: cursor, endMm: op.startMm, widthMm: op.startMm - cursor });
      }
      cursor = Math.max(cursor, op.endMm);
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
function computeCornerStats(walls) {
  if (walls.length < 2) return { inner: 0, outer: 0 };
  const n = walls.length;
  let inner = 0, outer = 0;

  let signedArea = 0;
  for (let i = 0; i < n; i++) {
    const s = wallStart(walls[i]), e = wallEnd(walls[i]);
    signedArea += s.x * e.y - e.x * s.y;
  }

  for (let i = 0; i < n; i++) {
    const dx1 = wallEnd(walls[i]).x   - wallStart(walls[i]).x;
    const dy1 = wallEnd(walls[i]).y   - wallStart(walls[i]).y;
    const dx2 = wallEnd(walls[(i+1)%n]).x - wallStart(walls[(i+1)%n]).x;
    const dy2 = wallEnd(walls[(i+1)%n]).y - wallStart(walls[(i+1)%n]).y;
    const cross = dx1 * dy2 - dy1 * dx2;
    if (Math.abs(cross) < 0.001) continue;
    const isInterior = signedArea < 0 ? cross < 0 : cross > 0;
    if (isInterior) inner++; else outer++;
  }
  return { inner, outer };
}

// ══════════════════════════════════════════════════════════════════
// РАСТЕРИЗАЦИЯ СТЕНЫ
// Тело: inflate=1мм (площадь точная).
// Caps: radius=thickness/2+2мм — закрывают торцевые зазоры в вершинах.
// ══════════════════════════════════════════════════════════════════
function rasterizeWall(wall, bitmap, cols, rows, minX, minY) {
  const INFLATE = 1;
  const angle = Math.atan2(wall.y2 - wall.y1, wall.x2 - wall.x1);
  const half  = wall.thickness / 2 + INFLATE;
  const sinA  = Math.sin(angle), cosA = Math.cos(angle);
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

  // Круглые caps на концах — закрывают торцевые зазоры в вершинах
  const capRadius = wall.thickness / 2 + 2;
  rasterizeCap(wall.x1, wall.y1, capRadius, bitmap, cols, rows, minX, minY);
  rasterizeCap(wall.x2, wall.y2, capRadius, bitmap, cols, rows, minX, minY);
}

// ══════════════════════════════════════════════════════════════════
// КРУГЛАЯ ЗАГЛУШКА НА КОНЦЕ СТЕНЫ
// ══════════════════════════════════════════════════════════════════
function rasterizeCap(wx, wy, radius, bitmap, cols, rows, minX, minY) {
  const r2 = radius * radius;
  const gxMin = Math.max(0, Math.floor((wx - radius - minX) / CELL_MM) - 1);
  const gyMin = Math.max(0, Math.floor((wy - radius - minY) / CELL_MM) - 1);
  const gxMax = Math.min(cols - 1, Math.ceil((wx + radius - minX) / CELL_MM) + 1);
  const gyMax = Math.min(rows - 1, Math.ceil((wy + radius - minY) / CELL_MM) + 1);
  for (let gy = gyMin; gy <= gyMax; gy++) {
    for (let gx = gxMin; gx <= gxMax; gx++) {
      const px = minX + (gx + 0.5) * CELL_MM;
      const py = minY + (gy + 0.5) * CELL_MM;
      if ((px - wx) ** 2 + (py - wy) ** 2 <= r2) bitmap[gy * cols + gx] = 1;
    }
  }
}

function findWallAtPoint(wx, wy) {
  for (const w of appState.walls) {
    const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
    if (len < 0.001) continue;
    const ux = (w.x2 - w.x1) / len, uy = (w.y2 - w.y1) / len;
    const rx = wx - w.x1, ry = wy - w.y1;
    const along  = rx * ux + ry * uy;
    const normal = rx * (-uy) + ry * ux;
    if (along >= -CELL_MM && along <= len + CELL_MM &&
        Math.abs(normal) <= w.thickness / 2 + CELL_MM) return w;
  }
  return null;
}

function round2(v) { return Math.round(v * 100) / 100; }

// ══════════════════════════════════════════════════════════════════
// DOM — ЭКСПЛИКАЦИЯ
// Колонки: Помещение | Пол м² | Стены м² | Периметр м.п. |
//          Окна м² | Погонаж м.п. | Углы м.п.
// ══════════════════════════════════════════════════════════════════
export function updateExpl(explBody, roomCountEl) {
  if (!explBody) return;
  if (roomCountEl) roomCountEl.textContent = appState.rooms.length;

  if (!appState.rooms.length) {
    explBody.innerHTML = `<tr class="empty-row"><td colspan="7">Нарисуйте замкнутый контур — появятся все метрики</td></tr>`;
    return;
  }

  explBody.innerHTML = appState.rooms.map((r, i) => {
    const m     = r.metrics || {};
    const color = ROOM_STROKES[i % ROOM_STROKES.length].replace('0.4', '0.8');
    const fmt   = v => (v != null && v > 0) ? v.toFixed(2) : '—';

    return `<tr>
      <td><div class="room-name-cell">
        <span class="room-dot" style="background:${color}"></span>
        <input class="room-name-input" type="text" value="${escHtml(r.name)}"
          data-room-key="${escHtml(r.key)}" data-room-default="${escHtml(r.defaultName)}">
      </div></td>
      <td>${r.area.toFixed(2)}</td>
      <td>${fmt(m.wallAreaNetM2 ?? r.wallArea)}</td>
      <td>${fmt(m.perimeterFloorM ?? r.perimeter)}</td>
      <td>${fmt(m.windowAreaM2)}</td>
      <td>${fmt(m.pogonazLm)}</td>
      <td>${fmt(m.outerAnglesLm)}</td>
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
      name:               r.name,
      floorArea:          r.area,
      wallsArea:          m.wallAreaNetM2      ?? r.wallArea,
      perimeter:          m.perimeterFloorM    ?? r.perimeter,
      height:             r.height             ?? 0,
      windowAreaM2:       m.windowAreaM2       ?? 0,
      windowCount:        m.windowCount        ?? 0,
      pogonazLm:          m.pogonazLm          ?? 0,
      outerAnglesLm:      m.outerAnglesLm      ?? 0,
      cornersOuter:       m.cornersOuter       ?? 0,
      narrowWallsLm:      m.narrowWallsLm      ?? 0,
      windowRevealsLm:    m.windowRevealsLm    ?? 0,
    };
  });
}

// ── Stage 2: автономная реактивность ────────────────────────────
// room.js сам подписывается на изменение стен и пересчитывает комнаты.
// Убирает необходимость вызывать computeRooms() из ui-planner.js вручную.
// Цепочка: walls:changed → computeRooms → rooms:computed → updateExpl (в ui-planner)
EventBus.on('walls:changed', () => {
  computeRooms(_wallHeightFallback);
  // computeRooms уже сам вызывает EventBus.emit('rooms:computed') в конце
});
