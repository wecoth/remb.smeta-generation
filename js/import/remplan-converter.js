// js/import/remplan-converter.js
// Конвертер .plan (RemPlanner v3) → формат REMB
// Без зависимостей от остального кода приложения
//
// Стратегия offset='right':
//   x/y  = внешняя грань (l1/l2 из RemPlanner * 10)
//   cx/cy = ось стены (p1/p2) смещённая на thickness/2 перпендикулярно ВНУТРЬ
//           без удлинений в углах — твой движок сам замыкает углы при рендере.
//
// import-handler.js: fixOffsets НЕ НУЖЕН, убери его.

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

  const walls    = [];
  const openings = [];
  const oldIdToNewId = {};

  let nextWallId = 1;
  let nextOpenId = 1;

  // ── Стены ────────────────────────────────────────────────────────
  for (const [oldId, wd] of wallEntries) {
    if (wd.archive === 1 || wd.demount === 1) continue;

    // Ось стены (сантиметры → миллиметры)
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

    // Единичный вектор вдоль стены
    const dx = (p2x - p1x) / lenMm;
    const dy = (p2y - p1y) / lenMm;

    // Нормаль, повёрнутая на 90° влево (перпендикуляр)
    // В RemPlanner "левая" грань (l) = снаружи, "правая" (r) = внутри комнаты.
    // Нормаль влево: nx = -dy, ny = dx
    const nx = -dy;
    const ny =  dx;

    // Внешняя грань (x/y) = p1/p2 смещённые влево на halfT
    const x1  = p1x + nx * halfT;
    const y1  = p1y + ny * halfT;
    const x2  = p2x + nx * halfT;
    const y2  = p2y + ny * halfT;

    // Базовая линия (cx/cy) = p1/p2 смещённые вправо (внутрь) на halfT
    // БЕЗ удлинений в углах — чистое геометрическое смещение оси.
    const cx1 = p1x - nx * halfT;
    const cy1 = p1y - ny * halfT;
    const cx2 = p2x - nx * halfT;
    const cy2 = p2y - ny * halfT;

    walls.push({
      id:               nextWallId,
      x1, y1, x2, y2,
      cx1, cy1, cx2, cy2,
      thickness,
      height,
      offset:           'right',
      horizontalOffset: 0,
      priority:         nextWallId,
      material:         wd.material || null,
    });

    console.log('[converter] стена ' + oldId + ' → id=' + nextWallId
      + ' thickness=' + thickness
      + ' p1=(' + p1x.toFixed(0) + ',' + p1y.toFixed(0) + ')'
      + ' cx1=(' + cx1.toFixed(0) + ',' + cy1.toFixed(0) + ')');

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

    // Длина стены по оси (сантиметры) — для расчёта t
    const wallLenCm = Math.hypot(wd.p2.x - wd.p1.x, wd.p2.y - wd.p1.y);
    if (wallLenCm < 0.1) continue;

    for (const [holeId, hole] of Object.entries(wd.holes)) {
      const holeType    = hole.type === 'window' ? 'window' : 'door';
      const holeWidthCm = hole.width || (holeType === 'window' ? 120 : 80);

      // p1d — расстояние от p1 до НАЧАЛА проёма (см).
      // t = центр проёма вдоль стены (0..1)
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
