// ─── GEOMETRY.JS — pure math, no DOM, no appState ─────────────────

/**
 * Segment–segment intersection.
 * Returns {x, y, t, u} or null.
 */
export function segmentIntersection(a, b, epsilon = 0.001) {
  const r = { x: a.x2 - a.x1, y: a.y2 - a.y1 };
  const s = { x: b.x2 - b.x1, y: b.y2 - b.y1 };
  const denom = r.x * s.y - r.y * s.x;
  if (Math.abs(denom) < epsilon) return null;
  const qp = { x: b.x1 - a.x1, y: b.y1 - a.y1 };
  const t = (qp.x * s.y - qp.y * s.x) / denom;
  const u = (qp.x * r.y - qp.y * r.x) / denom;
  if (t < -epsilon || t > 1 + epsilon || u < -epsilon || u > 1 + epsilon) return null;
  return { x: a.x1 + r.x * t, y: a.y1 + r.y * t, t, u };
}

/**
 * Project point onto segment [x1,y1]→[x2,y2].
 * Returns {x, y, t, distance}.
 */
export function projectPointOntoSegment(point, segment) {
  const dx = segment.x2 - segment.x1;
  const dy = segment.y2 - segment.y1;
  const len2 = dx * dx + dy * dy;
  if (len2 < 0.0001) {
    return {
      x: segment.x1, y: segment.y1, t: 0,
      distance: Math.hypot(point.x - segment.x1, point.y - segment.y1)
    };
  }
  let t = ((point.x - segment.x1) * dx + (point.y - segment.y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const proj = { x: segment.x1 + dx * t, y: segment.y1 + dy * t };
  return { ...proj, t, distance: Math.hypot(point.x - proj.x, point.y - proj.y) };
}

/**
 * Clamp v between min and max.
 */
export function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

/**
 * Normalize direction to the dominant axis.
 */
export function normalizeDirection(dir) {
  if (Math.abs(dir.x) >= Math.abs(dir.y)) {
    return dir.x >= 0 ? { x: 1, y: 0 } : { x: -1, y: 0 };
  }
  return dir.y >= 0 ? { x: 0, y: 1 } : { x: 0, y: -1 };
}

/**
 * Do numeric ranges [a1,a2] and [b1,b2] overlap?
 */
export function rangesOverlap(a1, a2, b1, b2, eps = 2) {
  return Math.max(Math.min(a1, a2), Math.min(b1, b2)) <
         Math.min(Math.max(a1, a2), Math.max(b1, b2)) + eps;
}

/**
 * Cluster a sorted list of values: values within `threshold` of each other
 * are merged to their average.  Fixes bug #11 (float coords grid explosion).
 */
export function clusterValues(values, threshold = 5) {
  if (!values.length) return [];
  const sorted = [...values].sort((a, b) => a - b);
  const result = [];
  let group = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - group[group.length - 1] <= threshold) {
      group.push(sorted[i]);
    } else {
      result.push(group.reduce((s, v) => s + v, 0) / group.length);
      group = [sorted[i]];
    }
  }
  result.push(group.reduce((s, v) => s + v, 0) / group.length);
  return result.map(v => Math.round(v));
}

/**
 * Apply wall offset (left / center / right) perpendicular to the draw direction.
 */
export function applyWallOffset(cx, cy, angle, offset, thickness) {
  if (offset === 'center') return { x: cx, y: cy };
  const px = -Math.sin(angle);
  const py =  Math.cos(angle);
  const sign = offset === 'right' ? 1 : -1;
  return { x: cx + sign * px * thickness / 2, y: cy + sign * py * thickness / 2 };
}

// Находит все точки пересечения между двумя стенами (включая концы)
export function findAllIntersections(walls, eps = 0.1) {
  const points = [];
  // Добавляем все концы стен
  for (const w of walls) {
    points.push({ x: w.x1, y: w.y1, wallIds: [w.id] });
    points.push({ x: w.x2, y: w.y2, wallIds: [w.id] });
  }

  // Пересечения каждой пары стен
  for (let i = 0; i < walls.length; i++) {
    for (let j = i + 1; j < walls.length; j++) {
      const w1 = walls[i], w2 = walls[j];
      const seg1 = { x1: w1.x1, y1: w1.y1, x2: w1.x2, y2: w1.y2 };
      const seg2 = { x1: w2.x1, y1: w2.y1, x2: w2.x2, y2: w2.y2 };
      const inter = segmentIntersection(seg1, seg2, eps);
      if (inter) {
        // Проверяем, не совпадает ли с уже существующей точкой
        const exists = points.some(p => Math.hypot(p.x - inter.x, p.y - inter.y) < eps);
        if (!exists) {
          points.push({ x: inter.x, y: inter.y, wallIds: [w1.id, w2.id] });
        } else {
          // Добавляем id стен к существующей точке
          const pt = points.find(p => Math.hypot(p.x - inter.x, p.y - inter.y) < eps);
          if (!pt.wallIds.includes(w1.id)) pt.wallIds.push(w1.id);
          if (!pt.wallIds.includes(w2.id)) pt.wallIds.push(w2.id);
        }
      }
    }
  }
  return points;
}

// Строит граф: вершины (точки) и рёбра (сегменты стен между точками)
export function buildWallGraph(walls, points, eps = 0.5) {
  const vertices = points.map((p, i) => ({ ...p, id: i }));
  const edges = [];

  for (const wall of walls) {
    // Находим все точки, лежащие на этой стене
    const onWall = vertices.filter(v => {
      const len = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
      if (len < 1) return false;
      const u = ((v.x - wall.x1) * (wall.x2 - wall.x1) + (v.y - wall.y1) * (wall.y2 - wall.y1)) / (len * len);
      if (u < -eps || u > 1 + eps) return false;
      const proj = {
        x: wall.x1 + u * (wall.x2 - wall.x1),
        y: wall.y1 + u * (wall.y2 - wall.y1)
      };
      return Math.hypot(v.x - proj.x, v.y - proj.y) < eps;
    });

    // Сортируем точки вдоль стены
    const dirX = wall.x2 - wall.x1, dirY = wall.y2 - wall.y1;
    onWall.sort((a, b) => {
      const dotA = (a.x - wall.x1) * dirX + (a.y - wall.y1) * dirY;
      const dotB = (b.x - wall.x1) * dirX + (b.y - wall.y1) * dirY;
      return dotA - dotB;
    });

    // Создаём рёбра между соседними точками
    for (let i = 0; i < onWall.length - 1; i++) {
      const v1 = onWall[i], v2 = onWall[i+1];
      const length = Math.hypot(v2.x - v1.x, v2.y - v1.y);
      if (length < 1) continue;
      edges.push({
        id: `e${edges.length}`,
        v1: v1.id, v2: v2.id,
        wallId: wall.id,
        length
      });
    }
  }

  return { vertices, edges };
}

// Находит все грани (faces) в планарном графе
export function findFaces(vertices, edges) {
  // Строим списки смежности
  const adj = Array.from({ length: vertices.length }, () => []);
  for (const e of edges) {
    adj[e.v1].push({ to: e.v2, edge: e });
    adj[e.v2].push({ to: e.v1, edge: e });
  }

  // Сортируем соседей по углу для корректного обхода
  for (let i = 0; i < adj.length; i++) {
    adj[i].sort((a, b) => {
      const v = vertices[i];
      const angA = Math.atan2(vertices[a.to].y - v.y, vertices[a.to].x - v.x);
      const angB = Math.atan2(vertices[b.to].y - v.y, vertices[b.to].x - v.x);
      return angA - angB;
    });
  }

  const usedEdges = new Set();
  const faces = [];

  // Обходим каждое ребро в обоих направлениях
  for (const e of edges) {
    for (const dir of ['forward', 'backward']) {
      const start = dir === 'forward' ? e.v1 : e.v2;
      const next = dir === 'forward' ? e.v2 : e.v1;
      const edgeKey = `${e.id}:${dir}`;
      if (usedEdges.has(edgeKey)) continue;

      const path = [{ v: start, e: e.id }];
      let current = start;
      let prev = next;
      usedEdges.add(edgeKey);

      // Идём по грани, выбирая самое левое ребро
      while (true) {
        const neighbors = adj[prev];
        // Находим индекс входящего ребра
        const inIdx = neighbors.findIndex(n => n.to === current);
        // Берём следующее по часовой стрелке (самое левое)
        const outIdx = (inIdx + 1) % neighbors.length;
        const nextEdge = neighbors[outIdx];
        
        path.push({ v: prev, e: nextEdge.edge.id });
        
        if (nextEdge.to === start) break; // замкнули цикл
        
        const dirKey = nextEdge.edge.v1 === prev ? 'forward' : 'backward';
        usedEdges.add(`${nextEdge.edge.id}:${dirKey}`);
        
        current = prev;
        prev = nextEdge.to;
      }

      // Собираем полигон грани
      const polygon = path.map(p => vertices[p.v]);
      faces.push(polygon);
    }
  }

  return faces;
}
