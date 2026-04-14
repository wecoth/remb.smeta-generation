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
