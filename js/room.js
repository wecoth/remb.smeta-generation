// ─── ROOM.JS ──────────────────────────────────────────────────────
import { appState, ROOM_STROKES } from './state.js';
import { clusterValues, rangesOverlap } from './geometry.js';
import { openingTouchesSegments } from './opening.js';

// ── Room key — Bug #5 fix: use centroid rounded to 50 mm ──────────
export function getRoomKey(cells) {
  let ax = 0, ay = 0, area = 0;
  for (const c of cells) {
    const ca = (c.x2 - c.x1) * (c.y2 - c.y1);
    ax += ((c.x1 + c.x2) / 2) * ca;
    ay += ((c.y1 + c.y2) / 2) * ca;
    area += ca;
  }
  if (!area) return cells.map(c => `${Math.round(c.x1)},${Math.round(c.y1)}`).join('|');
  const cx = Math.round((ax / area) / 50) * 50;
  const cy = Math.round((ay / area) / 50) * 50;
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

// ── Main room computation ─────────────────────────────────────────

export function computeRooms(wallHeightFallback = 2700) {
  appState.rooms = [];
  const eps = 2;

  // Включаем ВСЕ стены, не только строго осевые —
  // потому что привязка может идти к внешней кромке соседней стены
  const allWalls = appState.walls;
  if (allWalls.length < 3) return;

  // Собираем координаты: и оси (cx/cy) и физические грани (x/y)
  // Это позволяет замыкать контур при привязке к любой грани стены
  const rawXs = [], rawYs = [];
  for (const w of allWalls) {
    rawXs.push(w.cx1 ?? w.x1, w.cx2 ?? w.x2, w.x1, w.x2);
    rawYs.push(w.cy1 ?? w.y1, w.cy2 ?? w.y2, w.y1, w.y2);
  }
  const xList = clusterValues(rawXs, 5);
  const yList = clusterValues(rawYs, 5);
  if (xList.length < 2 || yList.length < 2) return;

  const horizEdges = new Set();
  const vertEdges  = new Set();

  // Вспомогательная функция — добавляем горизонтальный edge по y-координате
  function addHorizEdge(y, xFrom, xTo) {
    const yIdx = yList.findIndex(v => Math.abs(v - y) < eps);
    if (yIdx < 0) return;
    const xmin = Math.min(xFrom, xTo), xmax = Math.max(xFrom, xTo);
    for (let i = 0; i < xList.length - 1; i++) {
      if (xList[i] >= xmin - eps && xList[i + 1] <= xmax + eps)
        horizEdges.add(`${yIdx},${i}`);
    }
  }

  // Вспомогательная функция — добавляем вертикальный edge по x-координате
  function addVertEdge(x, yFrom, yTo) {
    const xIdx = xList.findIndex(v => Math.abs(v - x) < eps);
    if (xIdx < 0) return;
    const ymin = Math.min(yFrom, yTo), ymax = Math.max(yFrom, yTo);
    for (let j = 0; j < yList.length - 1; j++) {
      if (yList[j] >= ymin - eps && yList[j + 1] <= ymax + eps)
        vertEdges.add(`${xIdx},${j}`);
    }
  }

  // Фильтруем только горизонтальные и вертикальные стены
  const axisWalls = allWalls.filter(w =>
    Math.abs((w.cy1 ?? w.y1) - (w.cy2 ?? w.y2)) < eps ||
    Math.abs((w.cx1 ?? w.x1) - (w.cx2 ?? w.x2)) < eps
  );
  if (axisWalls.length < 3) return;

  for (const w of axisWalls) {
    const cx1 = w.cx1 ?? w.x1, cy1 = w.cy1 ?? w.y1;
    const cx2 = w.cx2 ?? w.x2, cy2 = w.cy2 ?? w.y2;

    // Edges по контурной оси (cx/cy)
    if (Math.abs(cy1 - cy2) < eps) {
      addHorizEdge(cy1, cx1, cx2);
    } else if (Math.abs(cx1 - cx2) < eps) {
      addVertEdge(cx1, cy1, cy2);
    }

    // Edges по физическим граням стены (x/y со смещением offset)
    // Это ключевое: позволяет строить соседние помещения от внешних кромок
    if (Math.abs(w.y1 - w.y2) < eps) {
      addHorizEdge(w.y1, w.x1, w.x2);
    } else if (Math.abs(w.x1 - w.x2) < eps) {
      addVertEdge(w.x1, w.y1, w.y2);
    }
  }

  const rows = yList.length - 1, cols = xList.length - 1;
  const visited = Array.from({ length: rows }, () => new Array(cols).fill(false));

  function cellKey(cy, cx) { return `${cy},${cx}`; }

  function boundaryEdgeForCell(cy, cx, dir) {
    if (dir === 'top')
      return { orientation: 'h', x1: xList[cx], y1: yList[cy], x2: xList[cx+1], y2: yList[cy], edgeKey: `${cy},${cx}` };
    if (dir === 'bottom')
      return { orientation: 'h', x1: xList[cx], y1: yList[cy+1], x2: xList[cx+1], y2: yList[cy+1], edgeKey: `${cy+1},${cx}` };
    if (dir === 'left')
      return { orientation: 'v', x1: xList[cx], y1: yList[cy], x2: xList[cx], y2: yList[cy+1], edgeKey: `${cx},${cy}` };
    return { orientation: 'v', x1: xList[cx+1], y1: yList[cy], x2: xList[cx+1], y2: yList[cy+1], edgeKey: `${cx+1},${cy}` };
  }

  function findWallForSegment(seg) {
    return axisWalls.find(w => {
      const wx1 = w.cx1 ?? w.x1, wy1 = w.cy1 ?? w.y1;
      const wx2 = w.cx2 ?? w.x2, wy2 = w.cy2 ?? w.y2;
      // Проверяем совпадение по контурной оси (cx/cy)
      if (seg.orientation === 'h') {
        if (Math.abs(wy1 - wy2) < eps && Math.abs(wy1 - seg.y1) < eps &&
            rangesOverlap(seg.x1, seg.x2, wx1, wx2)) return true;
      } else {
        if (Math.abs(wx1 - wx2) < eps && Math.abs(wx1 - seg.x1) < eps &&
            rangesOverlap(seg.y1, seg.y2, wy1, wy2)) return true;
      }
      // Проверяем совпадение по физическим граням (x/y со смещением)
      if (seg.orientation === 'h') {
        return Math.abs(w.y1 - w.y2) < eps && Math.abs(w.y1 - seg.y1) < eps &&
               rangesOverlap(seg.x1, seg.x2, w.x1, w.x2);
      }
      return Math.abs(w.x1 - w.x2) < eps && Math.abs(w.x1 - seg.x1) < eps &&
             rangesOverlap(seg.y1, seg.y2, w.y1, w.y2);
    }) || null;
  }

  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      if (visited[i][j]) continue;
      const queue = [[i, j]], region = [], regionSet = new Set();
      visited[i][j] = true;

      while (queue.length) {
        const [cy, cx] = queue.shift();
        region.push([cy, cx]);
        regionSet.add(cellKey(cy, cx));
        if (cy > 0        && !visited[cy-1][cx] && !horizEdges.has(`${cy},${cx}`))   { visited[cy-1][cx] = true; queue.push([cy-1, cx]); }
        if (cy < rows-1   && !visited[cy+1][cx] && !horizEdges.has(`${cy+1},${cx}`)) { visited[cy+1][cx] = true; queue.push([cy+1, cx]); }
        if (cx > 0        && !visited[cy][cx-1] && !vertEdges.has(`${cx},${cy}`))    { visited[cy][cx-1] = true; queue.push([cy, cx-1]); }
        if (cx < cols-1   && !visited[cy][cx+1] && !vertEdges.has(`${cx+1},${cy}`))  { visited[cy][cx+1] = true; queue.push([cy, cx+1]); }
      }

      if (!region.length) continue;

      const boundarySegments = [];
      let enclosed = true, areaMm2 = 0, weightedX = 0, weightedY = 0;
      const cells = [];

      for (const [cy, cx] of region) {
        const cellArea = (xList[cx+1] - xList[cx]) * (yList[cy+1] - yList[cy]);
        areaMm2 += cellArea;
        const midX = (xList[cx] + xList[cx+1]) / 2;
        const midY = (yList[cy] + yList[cy+1]) / 2;
        weightedX += midX * cellArea;
        weightedY += midY * cellArea;
        cells.push({ x1: xList[cx], y1: yList[cy], x2: xList[cx+1], y2: yList[cy+1] });

        const neighbors = [
          { dir: 'top',    exists: regionSet.has(cellKey(cy-1, cx)), edgeSet: horizEdges },
          { dir: 'bottom', exists: regionSet.has(cellKey(cy+1, cx)), edgeSet: horizEdges },
          { dir: 'left',   exists: regionSet.has(cellKey(cy, cx-1)), edgeSet: vertEdges  },
          { dir: 'right',  exists: regionSet.has(cellKey(cy, cx+1)), edgeSet: vertEdges  },
        ];
        for (const nb of neighbors) {
          if (nb.exists) continue;
          const seg = boundaryEdgeForCell(cy, cx, nb.dir);
          if (!nb.edgeSet.has(seg.edgeKey)) { enclosed = false; break; }
          seg.length = Math.hypot(seg.x2 - seg.x1, seg.y2 - seg.y1);
          seg.wall = findWallForSegment(seg);
          boundarySegments.push(seg);
        }
        if (!enclosed) break;
      }

      if (!enclosed || areaMm2 < 50000) continue;

      const centroid = { x: weightedX / areaMm2, y: weightedY / areaMm2 };
      const center = cells.reduce((best, cell) => {
        const cc = { x: (cell.x1 + cell.x2) / 2, y: (cell.y1 + cell.y2) / 2 };
        const dist = Math.hypot(cc.x - centroid.x, cc.y - centroid.y);
        return !best || dist < best.dist ? { ...cc, dist } : best;
      }, null);

      const defaultRoomHeight = wallHeightFallback;
      const roomHeightMm = boundarySegments.reduce((minH, seg) => {
        const wh = seg.wall ? (seg.wall.height || defaultRoomHeight) : defaultRoomHeight;
        return Math.min(minH, wh);
      }, defaultRoomHeight);

      let grossWallArea = 0, perimeter = 0;
      for (const seg of boundarySegments) {
        perimeter += seg.length;
        const wh = seg.wall ? seg.wall.height : defaultRoomHeight;
        grossWallArea += seg.length * wh / 1e6;
      }

      let openingsArea = 0;
      for (const op of appState.openings) {
        if (openingTouchesSegments(op, boundarySegments, appState.walls)) {
          openingsArea += (op.width * op.height) / 1e6;
        }
      }

      const key = getRoomKey(cells);
      const defaultName = roomDefaultName(appState.rooms.length);
      appState.rooms.push({
        key, cells, boundarySegments,
        area:        areaMm2 / 1e6,
        volume:      areaMm2 * roomHeightMm / 1e9,
        height:      roomHeightMm / 1000,
        wallArea:    Math.max(0, grossWallArea - openingsArea),
        perimeter:   perimeter / 1000,
        openingsArea,
        center: { x: center.x, y: center.y },
        defaultName,
        name: appState.roomNameOverrides[key] || defaultName,
      });
    }
  }
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

/** Returns computed rooms in smeta-compatible format for room sync */
export function getComputedRooms() {
  return appState.rooms.map(r => ({
    name:      r.name,
    floorArea: parseFloat(r.area.toFixed(2)),
    wallsArea: parseFloat(r.wallArea.toFixed(2)),
    perimeter: parseFloat(r.perimeter.toFixed(2)),
  }));
}
