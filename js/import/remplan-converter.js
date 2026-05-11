// js/import/remplan-converter.js
// Конвертер .plan (RemPlanner v3) → формат REMB
// Без зависимостей от остального кода приложения
//
// Модель координат REMB (из wall.js):
//   cx/cy = внутренняя грань стены (жёлтая линия, то что рисует пользователь)
//   x/y   = ось стены = cx/cy + halfT * нормаль_наружу
//   getWallWorldGeometry строит тело стены симметрично от x/y на ±halfT
//
// Из RemPlanner:
//   r1/r2 (без 'f') = внутренняя грань, чистый размер → cx/cy
//   нормаль наружу = от r к l стороне
//   x/y = r1/r2 + halfT * нормаль_наружу  (= ось стены)

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
    const halfT     = thickness / 2;

    const R1 = wd.r1;
    const R2 = wd.r2;
    const L1 = wd.l1;
    const L2 = wd.l2;

    let x1, y1, x2, y2, cx1, cy1, cx2, cy2, offset;

    if (R1 && R2 && L1 && L2) {
      // cx/cy = внутренняя грань (r1/r2) — жёлтая линия
      cx1 = R1.x * 10;  cy1 = R1.y * 10;
      cx2 = R2.x * 10;  cy2 = R2.y * 10;

      // Нормаль от внутренней грани (r) наружу (к l):
      // берём середины граней и считаем вектор r→l
      const rMidX = (R1.x + R2.x) / 2;
      const rMidY = (R1.y + R2.y) / 2;
      const lMidX = (L1.x + L2.x) / 2;
      const lMidY = (L1.y + L2.y) / 2;
      const outDX = lMidX - rMidX;
      const outDY = lMidY - rMidY;
      const outLen = Math.hypot(outDX, outDY);

      if (outLen > 0.01) {
        // Единичный вектор наружу
        const nox = outDX / outLen;
        const noy = outDY / outLen;
        // x/y = cx/cy + halfT * нормаль_наружу  (ось стены для рендера)
        x1 = cx1 + nox * halfT;
        y1 = cy1 + noy * halfT;
        x2 = cx2 + nox * halfT;
        y2 = cy2 + noy * halfT;
      } else {
        // Fallback: нет нормали — ставим ось = cx/cy
        x1 = cx1; y1 = cy1; x2 = cx2; y2 = cy2;
      }

      offset = 'right';
    } else {
      // Fallback: нет граней — ось стены
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
      + ' thickness=' + thickness
      + ' cx=(' + cx1.toFixed(0) + '→' + cx2.toFixed(0) + ')'
      + ' x=(' + x1.toFixed(0) + '→' + x2.toFixed(0) + ')');

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

      const p1d = hole.p1d || 0;
      const t   = (p1d + holeWidthCm / 2) / wallLenCm;

      const width  = Math.round(holeWidthCm * 10);
      const height = Math.round((hole.height || (holeType === 'window' ? 150 : 200)) * 10);
      const hinge  = (hole.opening === 'l') ? 'start' : 'end';

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
