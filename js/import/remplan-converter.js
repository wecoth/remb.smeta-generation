// js/import/remplan-converter.js
// Конвертер .plan (RemPlanner v3) → формат REMB
// Без зависимостей от остального кода приложения
//
// Модель координат REMB (из wall.js / geometry.js):
//   cx/cy  = базовая линия (левая нормаль от направления стены)
//   offset = 'right' → wallOppositeFace строит outer = cx + nx*thickness
//                       (nx = левая нормаль = -uy, ny = ux)
//   polygon комнаты строится по outer граням → outer должен смотреть ВНУТРЬ комнаты
//
// RemPlanner:
//   l1/l2 = левая грань (при движении p1→p2)
//   r1/r2 = правая грань = внутри комнаты
//
//   Для offset='right': outer = cx + nx*thick
//   Чтобы outer = r (внутри) → cx = l (левая грань)
//   Проверка: wall1(→): nx=(0,+1), l.y=245см, outer.y = l.y+10 = 255 = r.y ✓
//
//   x/y = ось стены = l + nx*(thick/2) = середина между l и r
//   (x/y используется только рендером для тела стены через getWallWorldGeometry)

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

    const L1 = wd.l1;
    const L2 = wd.l2;
    const R1 = wd.r1;
    const R2 = wd.r2;

    let x1, y1, x2, y2, cx1, cy1, cx2, cy2, offset;

    if (L1 && L2 && R1 && R2) {
      // cx/cy = l (левая грань RemPlanner)
      // Тогда wallOppositeFace('right') строит outer = cx + nx*thick = r (внутри комнаты)
      // и polygon комнаты = 3000мм ✓
      cx1 = L1.x * 10;  cy1 = L1.y * 10;
      cx2 = L2.x * 10;  cy2 = L2.y * 10;

      // x/y = ось стены = l + halfT в сторону r (середина тела стены)
      // Вектор от l к r (перпендикуляр, внутрь):
      const rMidX = (R1.x + R2.x) / 2;
      const rMidY = (R1.y + R2.y) / 2;
      const lMidX = (L1.x + L2.x) / 2;
      const lMidY = (L1.y + L2.y) / 2;
      const lrDX  = rMidX - lMidX;
      const lrDY  = rMidY - lMidY;
      const lrLen = Math.hypot(lrDX, lrDY);

      if (lrLen > 0.01) {
        const nox = lrDX / lrLen;
        const noy = lrDY / lrLen;
        // ось = l + halfT * (l→r)
        x1 = cx1 + nox * halfT;
        y1 = cy1 + noy * halfT;
        x2 = cx2 + nox * halfT;
        y2 = cy2 + noy * halfT;
      } else {
        x1 = cx1; y1 = cy1; x2 = cx2; y2 = cy2;
      }

      offset = 'right';
    } else {
      // Fallback: нет данных о гранях
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
      + ' offset=' + offset + ' thick=' + thickness
      + ' cx=(' + cx1.toFixed(0) + ',' + cy1.toFixed(0) + ')→(' + cx2.toFixed(0) + ',' + cy2.toFixed(0) + ')');

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
