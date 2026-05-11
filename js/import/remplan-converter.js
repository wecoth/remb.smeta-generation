// js/import/remplan-converter.js
// Конвертер .plan (RemPlanner v3) → формат REMB
// Без зависимостей от остального кода приложения
//
// Стратегия:
//   r1/r2 (внутренняя грань, БЕЗ суффикса f) = чистый внутренний размер комнаты.
//   l1/l2 (внешняя грань) = снаружи.
//   cx/cy = r1/r2 * 10  (базовая линия, жёлтая — идёт по внутреннему контуру)
//   x/y   = l1/l2 * 10  (внешняя грань)
//   offset = 'right'
//
//   fixOffsets в import-handler НЕ НУЖЕН — убери его.

export function convertRemPlanToProject(jsonString) {
  console.log('[converter] START — длина строки:', jsonString.length);

  let data;
  try {
    data = JSON.parse(jsonString);
  } catch (e) {
    console.error('[converter] JSON.parse упал:', e);
    throw e;
  }

  if (!data?.plan?.walls) {
    throw new Error('Неверный формат .plan: отсутствует data.plan.walls');
  }

  const wallEntries = Object.entries(data.plan.walls);
  console.log('[converter] Стен в файле:', wallEntries.length);

  const walls        = [];
  const openings     = [];
  const oldIdToNewId = {};

  let nextWallId = 1;
  let nextOpenId = 1;

  // ── Стены ────────────────────────────────────────────────────────
  for (const [oldId, wd] of wallEntries) {
    if (wd.archive === 1 || wd.demount === 1) continue;

    const p1x = wd.p1.x * 10;
    const p1y = wd.p1.y * 10;
    const p2x = wd.p2.x * 10;
    const p2y = wd.p2.y * 10;

    const lenMm = Math.hypot(p2x - p1x, p2y - p1y);
    if (lenMm < 1) {
      console.log('[converter] ПРОПУСК стены ' + oldId + ' (нулевая длина)');
      continue;
    }

    const thickness = Math.round((wd.depth  || 10) * 10);
    const height    = Math.round((wd.height || 270) * 10);

    // r1/r2 — внутренняя грань (без 'f', без подрезок по пересечениям)
    // l1/l2 — внешняя грань
    const L1 = wd.l1;
    const L2 = wd.l2;
    const R1 = wd.r1;
    const R2 = wd.r2;

    let x1, y1, x2, y2, cx1, cy1, cx2, cy2, offset;

    if (L1 && L2 && R1 && R2) {
      x1  = L1.x * 10;  y1  = L1.y * 10;
      x2  = L2.x * 10;  y2  = L2.y * 10;
      cx1 = R1.x * 10;  cy1 = R1.y * 10;
      cx2 = R2.x * 10;  cy2 = R2.y * 10;
      offset = 'right';
    } else {
      // Fallback: нет данных о гранях — ставим по оси
      x1 = p1x; y1 = p1y; x2 = p2x; y2 = p2y;
      cx1 = p1x; cy1 = p1y; cx2 = p2x; cy2 = p2y;
      offset = 'center';
    }

    walls.push({
      id:               nextWallId,
      x1, y1, x2, y2,
      cx1, cy1, cx2, cy2,
      thickness,
      height,
      offset,
      horizontalOffset: 0,
      priority:         nextWallId,
      material:         wd.material || null,
    });

    console.log('[converter] стена ' + oldId + ' → id=' + nextWallId
      + ' offset=' + offset + ' thickness=' + thickness
      + ' cx1=(' + cx1.toFixed(0) + ',' + cy1.toFixed(0) + ')'
      + ' cx2=(' + cx2.toFixed(0) + ',' + cy2.toFixed(0) + ')');

    oldIdToNewId[oldId] = nextWallId;
    nextWallId++;
  }

  console.log('[converter] Итого стен:', walls.length);

  // ── Проёмы ───────────────────────────────────────────────────────
  for (const [oldId, wd] of wallEntries) {
    if (wd.archive === 1 || wd.demount === 1) continue;
    if (!wd.holes) continue;

    const newWallId = oldIdToNewId[oldId];
    if (!newWallId) continue;

    const wallLenCm = Math.hypot(wd.p2.x - wd.p1.x, wd.p2.y - wd.p1.y);
    if (wallLenCm < 0.1) continue;

    for (const [holeId, hole] of Object.entries(wd.holes)) {
      const holeType    = hole.type === 'window' ? 'window' : 'door';
      const holeWidthCm = hole.width || (holeType === 'window' ? 120 : 80);

      // p1d — расстояние от p1 до НАЧАЛА проёма (см). t = центр (0..1)
      const p1d = hole.p1d || 0;
      const t   = (p1d + holeWidthCm / 2) / wallLenCm;

      const width  = Math.round(holeWidthCm * 10);
      const height = Math.round((hole.height || (holeType === 'window' ? 150 : 200)) * 10);
      const hinge  = (hole.opening === 'l') ? 'start' : 'end';

      console.log('[converter] проём ' + holeId + ': ' + holeType
        + ' t=' + t.toFixed(3) + ' w=' + width + ' h=' + height);

      const opening = {
        id:     nextOpenId++,
        wallId: newWallId,
        t,
        width,
        height,
        type:   holeType,
      };

      if (holeType === 'door') {
        opening.hinge = hinge;
        opening.swing = 1;
        if (hole.type === 'double') opening.isDouble = true;
      }

      if (holeType === 'window' && hole.floor_height != null) {
        opening.sillHeight = Math.round(hole.floor_height * 10);
      }

      openings.push(opening);
    }
  }

  console.log('[converter] Итого проёмов:', openings.length);

  return {
    walls,
    openings,
    dividers:          [],
    measures:          [],
    rooms:             [],
    roomNameOverrides: {},
    dimensionOffsets:  {},
    idWall:            nextWallId,
    idOpen:            nextOpenId,
    idDivider:         1,
    idMeasure:         1,
  };
}
