// ─── ROOM.JS ──────────────────────────────────────────────────────
import { appState, ROOM_STROKES } from './state.js';
import { openingTouchesSegments } from './opening.js';

// ── Room key — centroid rounded to 50 mm ──────────────────────────
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

// ── Flood-fill room computation ───────────────────────────────────
//
// Алгоритм:
// 1. Определяем bbox всех стен + отступ
// 2. Растеризуем стены в bitmap (каждый пиксель = CELL_MM мм)
// 3. BFS flood fill от каждого свободного пикселя
// 4. Области касающиеся краёв bitmap = внешнее пространство, отбрасываем
// 5. Для каждой внутренней области считаем метрики
//
// Работает с любой геометрией: прямые, диагональные, кривые стены

const CELL_MM = 50; // разрешение сетки в мм

export function computeRooms(wallHeightFallback = 2700) {
  appState.rooms = [];
  if (appState.walls.length < 3) return;

  // ── 1. Bbox всех стен ──────────────────────────────────────────
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const w of appState.walls) {
    const half = w.thickness / 2 + 5;
    minX = Math.min(minX, w.x1 - half, w.x2 - half);
    minY = Math.min(minY, w.y1 - half, w.y2 - half);
    maxX = Math.max(maxX, w.x1 + half, w.x2 + half);
    maxY = Math.max(maxY, w.y1 + half, w.y2 + half);
  }
  // Добавляем отступ в 2 клетки вокруг — чтобы внешнее пространство всегда связано
  const PAD = CELL_MM * 2;
  minX -= PAD; minY -= PAD; maxX += PAD; maxY += PAD;

  const cols = Math.ceil((maxX - minX) / CELL_MM) + 1;
  const rows = Math.ceil((maxY - minY) / CELL_MM) + 1;

  if (cols > 2000 || rows > 2000) return; // защита от слишком большого bitmap

  // ── 2. Растеризуем стены ───────────────────────────────────────
  // bitmap: 0 = свободно, 1 = стена
  const bitmap = new Uint8Array(cols * rows);

  for (const w of appState.walls) {
    rasterizeWall(w, bitmap, cols, rows, minX, minY);
  }

  // ── 3. BFS flood fill ──────────────────────────────────────────
  const regionId = new Int32Array(cols * rows); // 0 = не посещён
  let nextId = 1;
  const regionPixels = new Map(); // id → [[gx,gy], ...]
  const regionTouchesEdge = new Set();

  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const idx = gy * cols + gx;
      if (bitmap[idx] !== 0 || regionId[idx] !== 0) continue;

      const id = nextId++;
      const pixels = [];
      const queue = [idx];
      regionId[idx] = id;
      let touchesEdge = false;

      while (queue.length) {
        const ci = queue.pop();
        const cx = ci % cols, cy = (ci / cols) | 0;
        pixels.push([cx, cy]);

        if (cx === 0 || cy === 0 || cx === cols - 1 || cy === rows - 1) {
          touchesEdge = true;
        }

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

  // ── 4. Фильтруем и считаем метрики ────────────────────────────
  const cellArea = CELL_MM * CELL_MM; // мм²
  const minRoomArea = 100000; // 0.1 м² минимум

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

    // Периметр и граничные стены
    let perimeterMm = 0;
    const boundaryWalls = new Map(); // wallId → wall

    for (const [gx, gy] of pixels) {
      for (const [nx, ny] of [[gx-1,gy],[gx+1,gy],[gx,gy-1],[gx,gy+1]]) {
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) {
          perimeterMm += CELL_MM;
          continue;
        }
        const ni = ny * cols + nx;
        if (bitmap[ni] === 1) {
          perimeterMm += CELL_MM;
          const wx = minX + (nx + 0.5) * CELL_MM;
          const wy = minY + (ny + 0.5) * CELL_MM;
          const wall = findWallAtPoint(wx, wy);
          if (wall && !boundaryWalls.has(wall.id)) {
            boundaryWalls.set(wall.id, wall);
          }
        }
      }
    }

    // Высота помещения
    let roomHeightMm = wallHeightFallback;
    for (const wall of boundaryWalls.values()) {
      if (wall.height && wall.height < roomHeightMm) {
        roomHeightMm = wall.height;
      }
    }

    // Площадь стен
    const grossWallAreaM2 = (perimeterMm * roomHeightMm) / 1e6;

    // Площадь проёмов
    let openingsAreaM2 = 0;
    for (const op of appState.openings) {
      if (boundaryWalls.has(op.wallId)) {
        openingsAreaM2 += (op.width * op.height) / 1e6;
      }
    }

    // Room key
    const key = getRoomKey(pixels, CELL_MM);

    // cells для render.js (drawRoomFills использует cells для заливки)
    const cells = pixels.map(([gx, gy]) => ({
      x1: minX + gx * CELL_MM,
      y1: minY + gy * CELL_MM,
      x2: minX + (gx + 1) * CELL_MM,
      y2: minY + (gy + 1) * CELL_MM,
    }));

    // boundarySegments для обратной совместимости
    const boundarySegments = [];
    for (const wall of boundaryWalls.values()) {
      const seg = {
        orientation: Math.abs(wall.y2 - wall.y1) < Math.abs(wall.x2 - wall.x1) ? 'h' : 'v',
        x1: Math.min(wall.x1, wall.x2), y1: Math.min(wall.y1, wall.y2),
        x2: Math.max(wall.x1, wall.x2), y2: Math.max(wall.y1, wall.y2),
        length: Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1),
        wall,
      };
      boundarySegments.push(seg);
    }

    const defaultName = roomDefaultName(appState.rooms.length);
    appState.rooms.push({
      key, cells, boundarySegments,
      area:        areaMm2 / 1e6,
      volume:      areaMm2 * roomHeightMm / 1e9,
      height:      roomHeightMm / 1000,
      wallArea:    Math.max(0, grossWallAreaM2 - openingsAreaM2),
      perimeter:   perimeterMm / 1000,
      openingsArea: openingsAreaM2,
      center:      centerWorld,
      defaultName,
      name: appState.roomNameOverrides[key] || defaultName,
    });
  }
}

// ── Растеризация стены в bitmap ───────────────────────────────────
function rasterizeWall(wall, bitmap, cols, rows, minX, minY) {
  const angle = Math.atan2(wall.y2 - wall.y1, wall.x2 - wall.x1);
  const half = wall.thickness / 2;
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
    const gx = (c.x - minX) / CELL_MM;
    const gy = (c.y - minY) / CELL_MM;
    gxMin = Math.min(gxMin, gx); gyMin = Math.min(gyMin, gy);
    gxMax = Math.max(gxMax, gx); gyMax = Math.max(gyMax, gy);
  }
  gxMin = Math.max(0, Math.floor(gxMin) - 1);
  gyMin = Math.max(0, Math.floor(gyMin) - 1);
  gxMax = Math.min(cols - 1, Math.ceil(gxMax) + 1);
  gyMax = Math.min(rows - 1, Math.ceil(gyMax) + 1);

  // Edge normals для convex polygon test
  const edges = [];
  for (let i = 0; i < 4; i++) {
    const a = corners[i], b = corners[(i + 1) % 4];
    edges.push({ ax: a.x, ay: a.y, nx: -(b.y - a.y), ny: b.x - a.x });
  }

  for (let gy = gyMin; gy <= gyMax; gy++) {
    for (let gx = gxMin; gx <= gxMax; gx++) {
      const wx = minX + (gx + 0.5) * CELL_MM;
      const wy = minY + (gy + 0.5) * CELL_MM;
      let inside = true;
      for (const e of edges) {
        if ((wx - e.ax) * e.nx + (wy - e.ay) * e.ny > 1) {
          inside = false; break;
        }
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
        Math.abs(normal) <= w.thickness / 2 + CELL_MM) {
      return w;
    }
  }
  return null;
}

// ── DOM update ────────────────────────────────────────────────────

export function updateExpl(explBody, roomCountEl) {
  if (!explBody) return;
  roomCountEl.textContent = appState.rooms.length;
  if (!appState.rooms.length) {
    explBody.innerHTML = '<tr class="empty-row"><td colspan="6">Нарисуйте замкнутый контур, чтобы посчитать пол, объём, стены и периметр</td></tr>';
    return;
  }
  explBody.innerHTML = appState.rooms.map((r, i) => {
    const color = ROOM_STROKES[i % ROOM_STROKES.length].replace('0.4', '0.8');
    return `<tr>
      <td><div class="room-name-cell">
        <span class="room-dot" style="background:${color}"></span>
        <input class="room-name-input" type="text" value="${escHtml(r.name)}"
          data-room-key="${escHtml(r.key)}" data-room-default="${escHtml(r.defaultName)}">
      </div></td>
      <td>${r.area.toFixed(2)}</td>
      <td>${r.volume.toFixed(2)}</td>
      <td>${r.wallArea.toFixed(2)}</td>
      <td>${r.perimeter.toFixed(2)}</td>
      <td>${r.openingsArea.toFixed(2)}</td>
    </tr>`;
  }).join('');
}

function escHtml(s) {
  return String(s || '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

export function getComputedRooms() {
  return appState.rooms.map(r => ({
    name:      r.name,
    floorArea: parseFloat(r.area.toFixed(2)),
    wallsArea: parseFloat(r.wallArea.toFixed(2)),
    perimeter: parseFloat(r.perimeter.toFixed(2)),
  }));
}
