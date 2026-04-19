// ─── ROOM.JS (VECTOR + CORRECT INWARD OFFSET) ────────────────────────
import { appState, ROOM_STROKES } from './state.js';
import { EventBus } from './eventBus.js';
import {
  findAllIntersections, buildWallGraph, findFaces,
  polygonArea, polygonCentroid, isPointInPolygon, isPointInWall
} from './geometry.js';

let _wallHeightFallback = 2700;
export function setWallHeight(h) { _wallHeightFallback = (h && h > 0) ? h : 2700; }

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

export let exteriorWallIds = new Set();

// ══════════════════════════════════════════════════════════════════
// ПРАВИЛЬНОЕ СМЕЩЕНИЕ ПОЛИГОНА ВНУТРЬ КОМНАТЫ
// ══════════════════════════════════════════════════════════════════

/**
 * Определяет, с какой стороны от стены находится точка (внутренняя/внешняя)
 * Возвращает 1, если точка со стороны нормали, -1 иначе.
 * Нормаль направлена вправо от направления стены (x1,y1 -> x2,y2).
 */
function wallInteriorSide(wall, point) {
  const mid = { x: (wall.x1 + wall.x2) / 2, y: (wall.y1 + wall.y2) / 2 };
  const angle = Math.atan2(wall.y2 - wall.y1, wall.x2 - wall.x1);
  const normal = { x: -Math.sin(angle), y: Math.cos(angle) }; // вправо от направления
  const dot = (point.x - mid.x) * normal.x + (point.y - mid.y) * normal.y;
  return dot >= 0 ? 1 : -1;
}

/**
 * Смещает полигон внутрь комнаты на половину толщины каждой граничной стены.
 * @param {Array} poly - исходный полигон (по осям стен)
 * @param {Array} boundaryWalls - массив стен, образующих границу комнаты
 * @param {Object} roomCenter - примерный центр комнаты для определения направления смещения
 * @returns {Array} новый полигон, смещённый внутрь
 */
function offsetPolygonInward(poly, boundaryWalls, roomCenter) {
  if (poly.length < 3) return poly;

  // Создаём Map: id стены -> объект стены
  const wallMap = new Map(boundaryWalls.map(w => [w.id, w]));

  // Находим для каждого ребра полигона, какой стене оно принадлежит
  const edgeToWall = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    
    // Ищем стену, на которой лежит эта точка
    let bestWall = null;
    let minDist = Infinity;
    for (const wall of boundaryWalls) {
      const len = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
      if (len < 1) continue;
      // Проекция точки на стену
      const u = ((mid.x - wall.x1) * (wall.x2 - wall.x1) + (mid.y - wall.y1) * (wall.y2 - wall.y1)) / (len * len);
      if (u < -0.1 || u > 1.1) continue;
      const proj = {
        x: wall.x1 + u * (wall.x2 - wall.x1),
        y: wall.y1 + u * (wall.y2 - wall.y1)
      };
      const dist = Math.hypot(mid.x - proj.x, mid.y - proj.y);
      if (dist < minDist) {
        minDist = dist;
        bestWall = wall;
      }
    }
    edgeToWall.push(bestWall);
  }

  const newPoly = [];
  const n = poly.length;

  for (let i = 0; i < n; i++) {
    const prevPt = poly[(i - 1 + n) % n];
    const currPt = poly[i];
    const nextPt = poly[(i + 1) % n];

    const wall1 = edgeToWall[(i - 1 + n) % n]; // стена, входящая в вершину
    const wall2 = edgeToWall[i];               // стена, исходящая из вершины

    if (!wall1 || !wall2) {
      // Если не нашли обе стены, оставляем точку без смещения
      newPoly.push({ x: currPt.x, y: currPt.y });
      continue;
    }

    // Направления рёбер стены (от вершины)
    const getDir = (wall, fromPt) => {
      const d1 = Math.hypot(wall.x1 - fromPt.x, wall.y1 - fromPt.y);
      const d2 = Math.hypot(wall.x2 - fromPt.x, wall.y2 - fromPt.y);
      if (d1 < d2) {
        return { x: wall.x2 - wall.x1, y: wall.y2 - wall.y1 };
      } else {
        return { x: wall.x1 - wall.x2, y: wall.y1 - wall.y2 };
      }
    };

    const dir1 = getDir(wall1, currPt);
    const dir2 = getDir(wall2, currPt);

    // Нормали (перпендикуляры) к направлениям
    let norm1 = { x: -dir1.y, y: dir1.x };
    let norm2 = { x: -dir2.y, y: dir2.x };

    // Определяем внутреннюю сторону для каждой стены относительно центра комнаты
    const side1 = wallInteriorSide(wall1, roomCenter);
    const side2 = wallInteriorSide(wall2, roomCenter);

    // Смещение на половину толщины внутрь
    const offset1 = (wall1.thickness / 2) * side1;
    const offset2 = (wall2.thickness / 2) * side2;

    // Нормализованные нормали
    const len1 = Math.hypot(norm1.x, norm1.y);
    const len2 = Math.hypot(norm2.x, norm2.y);
    if (len1 > 0) { norm1.x /= len1; norm1.y /= len1; }
    if (len2 > 0) { norm2.x /= len2; norm2.y /= len2; }

    // Точки на смещённых линиях
    const p1 = {
      x: currPt.x + norm1.x * offset1,
      y: currPt.y + norm1.y * offset1
    };
    const p2 = {
      x: p1.x + dir1.x,
      y: p1.y + dir1.y
    };
    const p3 = {
      x: currPt.x + norm2.x * offset2,
      y: currPt.y + norm2.y * offset2
    };
    const p4 = {
      x: p3.x + dir2.x,
      y: p3.y + dir2.y
    };

    // Пересечение смещённых линий
    const intersection = lineLineIntersection(p1, p2, p3, p4);
    if (intersection) {
      newPoly.push(intersection);
    } else {
      // Fallback: используем биссектрису
      const bisector = {
        x: norm1.x * offset1 + norm2.x * offset2,
        y: norm1.y * offset1 + norm2.y * offset2
      };
      newPoly.push({
        x: currPt.x + bisector.x,
        y: currPt.y + bisector.y
      });
    }
  }

  return newPoly;
}

function lineLineIntersection(p1, p2, p3, p4) {
  const denom = (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x);
  if (Math.abs(denom) < 0.0001) return null;
  const x = ((p1.x * p2.y - p1.y * p2.x) * (p3.x - p4.x) - (p1.x - p2.x) * (p3.x * p4.y - p3.y * p4.x)) / denom;
  const y = ((p1.x * p2.y - p1.y * p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x * p4.y - p3.y * p4.x)) / denom;
  return { x, y };
}

// ══════════════════════════════════════════════════════════════════
// ВЕКТОРНОЕ ПОСТРОЕНИЕ КОМНАТ
// ══════════════════════════════════════════════════════════════════
export function computeRooms(wallHeightFallback = 2700) {
  appState.rooms = [];
  const walls = appState.walls;
  if (walls.length < 3) {
    EventBus.emit('rooms:computed');
    return;
  }

  const points = findAllIntersections(walls);
  if (points.length < 3) {
    EventBus.emit('rooms:computed');
    return;
  }

  const { vertices, edges } = buildWallGraph(walls, points);
  if (edges.length < 3) {
    EventBus.emit('rooms:computed');
    return;
  }

  const faces = findFaces(vertices, edges);
  const facePolys = faces.map(face => face.map(v => ({ x: v.x, y: v.y })));

  const faceAreas = facePolys.map(poly => polygonArea(poly));
  const exteriorIndex = faceAreas.indexOf(Math.max(...faceAreas));
  const exteriorPoly = facePolys[exteriorIndex];

  exteriorWallIds = new Set();
  for (const edge of edges) {
    const v1 = vertices[edge.v1], v2 = vertices[edge.v2];
    const mid = { x: (v1.x + v2.x) / 2, y: (v1.y + v2.y) / 2 };
    if (isPointOnPolygonBoundary(mid, exteriorPoly, 1.0)) {
      exteriorWallIds.add(edge.wallId);
    }
  }

  for (let i = 0; i < facePolys.length; i++) {
    if (i === exteriorIndex) continue;
    const rawPoly = facePolys[i];
    const rawArea = faceAreas[i];
    if (rawArea < 50000) continue; // 0.05 м²

    const roughCenter = polygonCentroid(rawPoly);
    
    // Исключаем пустоты внутри стен
    let insideWall = false;
    for (const w of walls) {
      if (isPointInWall(roughCenter, w, 5)) { insideWall = true; break; }
    }
    if (insideWall) continue;

    // Определяем граничные стены
    const boundaryWallIds = new Set();
    for (const edge of edges) {
      const v1 = vertices[edge.v1], v2 = vertices[edge.v2];
      const mid = { x: (v1.x + v2.x) / 2, y: (v1.y + v2.y) / 2 };
      if (isPointOnPolygonBoundary(mid, rawPoly, 1.0)) {
        boundaryWallIds.add(edge.wallId);
      }
    }
    const boundaryWalls = walls.filter(w => boundaryWallIds.has(w.id));
    if (boundaryWalls.length < 3) continue;

    // Смещаем полигон внутрь на половину толщины стен
    const poly = offsetPolygonInward(rawPoly, boundaryWalls, roughCenter);
    const area = polygonArea(poly);
    if (area < 50000) continue;

    const center = polygonCentroid(poly);

    let roomHeightMm = wallHeightFallback;
    for (const w of boundaryWalls) {
      if (w.height && w.height < roomHeightMm) roomHeightMm = w.height;
    }

    const roomOpenings = appState.openings.filter(op => boundaryWallIds.has(op.wallId));
    const entranceDoorId = detectEntranceDoor(roomOpenings, exteriorWallIds);

    const metrics = computeRoomMetrics(
      boundaryWalls, roomOpenings, roomHeightMm, center, entranceDoorId
    );

    const key = generateRoomKey(poly);
    const defaultName = roomDefaultName(appState.rooms.length);

    const bbox = getBbox(poly);
    const cells = [{
      x1: bbox.minX, y1: bbox.minY,
      x2: bbox.maxX, y2: bbox.maxY
    }];

    const boundarySegments = boundaryWalls.map(w => ({
      orientation: Math.abs(w.y2 - w.y1) < Math.abs(w.x2 - w.x1) ? 'h' : 'v',
      x1: Math.min(w.x1, w.x2), y1: Math.min(w.y1, w.y2),
      x2: Math.max(w.x1, w.x2), y2: Math.max(w.y1, w.y2),
      length: Math.hypot(w.x2 - w.x1, w.y2 - w.y1),
      wall: w
    }));

    appState.rooms.push({
      key, polygon: poly,
      cells, boundarySegments,
      center,
      defaultName,
      name: appState.roomNameOverrides[key] || defaultName,
      area: area / 1e6,
      volume: area * roomHeightMm / 1e9,
      height: roomHeightMm / 1000,
      perimeter: metrics.perimeterFloorM,
      wallArea: metrics.wallAreaNetM2,
      openingsArea: metrics.openingsAreaM2,
      metrics,
      wallIds: [...boundaryWallIds],
    });
  }

  // Деление площади под дверями
  for (const op of appState.openings) {
    if (op.type !== 'door') continue;
    const wall = walls.find(w => w.id === op.wallId);
    if (!wall || wall.thickness < 1) continue;

    const bordering = appState.rooms.filter(r => r.wallIds.includes(op.wallId));
    if (bordering.length === 2) {
      const halfM2 = (op.width * wall.thickness) / 2 / 1e6;
      bordering[0].area += halfM2;
      bordering[0].volume = bordering[0].area * bordering[0].height;
      bordering[1].area += halfM2;
      bordering[1].volume = bordering[1].area * bordering[1].height;
    }
  }

  EventBus.emit('rooms:computed');
}

// ══════════════════════════════════════════════════════════════════
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ══════════════════════════════════════════════════════════════════
function projectPointOntoSegmentLocal(pt, seg) {
  const dx = seg.x2 - seg.x1, dy = seg.y2 - seg.y1;
  const len2 = dx*dx + dy*dy;
  if (len2 < 0.0001) return { distance: Math.hypot(pt.x - seg.x1, pt.y - seg.y1) };
  const t = ((pt.x - seg.x1)*dx + (pt.y - seg.y1)*dy) / len2;
  const clamped = Math.max(0, Math.min(1, t));
  const proj = { x: seg.x1 + dx*clamped, y: seg.y1 + dy*clamped };
  return { distance: Math.hypot(pt.x - proj.x, pt.y - proj.y) };
}

function isPointOnPolygonBoundary(pt, poly, eps = 1.0) {
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i+1)%poly.length];
    const seg = { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
    const proj = projectPointOntoSegmentLocal(pt, seg);
    if (proj.distance < eps) return true;
  }
  return false;
}

function generateRoomKey(poly) {
  const c = polygonCentroid(poly);
  return `${Math.round(c.x/50)*50},${Math.round(c.y/50)*50}`;
}

function getBbox(poly) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of poly) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

function detectEntranceDoor(openings, exteriorWallIds) {
  for (const op of openings) {
    if (op.type === 'door' && exteriorWallIds.has(op.wallId)) return op.id;
  }
  return null;
}

// ══════════════════════════════════════════════════════════════════
// МЕТРИКИ (без изменений)
// ══════════════════════════════════════════════════════════════════
function round2(v) { return Math.round(v * 100) / 100; }

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

const SNAP_TOL_SQ = 200 * 200;
function orderBoundaryWalls(walls) {
  if (walls.length <= 1) return walls;
  const used = new Array(walls.length).fill(false);
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

function computeRoomMetrics(walls, openings, heightMm, center, entranceDoorId) {
  const heightM = heightMm / 1000;

  const orderedWalls = orderBoundaryWalls(walls);
  const wallSegData  = buildWallSegments(orderedWalls, openings);

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

  let wallAreaGrossM2 = 0;
  let narrowWallsLm   = 0;
  let openingsAreaM2  = 0;

  for (const { wall, segments } of wallSegData) {
    const wallLenM = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1) / 1000;
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

  const cornerStats = computeCornerStats(orderedWalls);

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

  const wallOuterCornersLm = round2(cornerStats.outer * heightM);
  let revealCornersLm = 0;
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
// DOM И СМЕТА (без изменений)
// ══════════════════════════════════════════════════════════════════
export function updateExpl(explBody, roomCountEl) {
  if (!explBody) return;
  if (roomCountEl) roomCountEl.textContent = appState.rooms.length;

  if (!appState.rooms.length) {
    explBody.innerHTML = `<tr class="empty-row"><td colspan="7">Нарисуйте замкнутый контур — появятся все метрики</td></tr>`;
    return;
  }

  explBody.innerHTML = appState.rooms.map((r, i) => {
    const m = r.metrics || {};
    const color = ROOM_STROKES[i % ROOM_STROKES.length].replace('0.4', '0.8');
    const fmt = v => (v != null && v > 0) ? v.toFixed(2) : '—';

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

export function getComputedRooms() {
  return appState.rooms.map(r => {
    const m = r.metrics || {};
    return {
      name:            r.name,
      floorArea:       r.area,
      wallsArea:       m.wallAreaNetM2   ?? r.wallArea,
      perimeter:       m.perimeterFloorM ?? r.perimeter,
      height:          r.height          ?? 0,
      windowAreaM2:    m.windowAreaM2    ?? 0,
      windowCount:     m.windowCount     ?? 0,
      pogonazLm:       m.pogonazLm       ?? 0,
      outerAnglesLm:   m.outerAnglesLm   ?? 0,
      cornersOuter:    m.cornersOuter    ?? 0,
      narrowWallsLm:   m.narrowWallsLm   ?? 0,
      windowRevealsLm: m.windowRevealsLm ?? 0,
    };
  });
}

// ══════════════════════════════════════════════════════════════════
// РЕАКТИВНОСТЬ
// ══════════════════════════════════════════════════════════════════
let debounceTimer = null;
const DEBOUNCE_MS = 80;

EventBus.on('walls:changed', () => {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    computeRooms(_wallHeightFallback);
    debounceTimer = null;
  }, DEBOUNCE_MS);
});
