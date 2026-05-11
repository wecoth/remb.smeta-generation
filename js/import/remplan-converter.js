// js/import/remplan-converter.js
// Конвертер .plan (RemPlanner) → формат REMB
// Без зависимостей от остального кода приложения

export function convertRemPlanToProject(jsonString) {
  console.log('[converter] START — длина строки:', jsonString.length);

  let data;
  try {
    data = JSON.parse(jsonString);
  } catch (e) {
    console.error('[converter] JSON.parse упал:', e);
    throw e;
  }

  console.log('[converter] JSON распарсен. Ключи верхнего уровня:', Object.keys(data));
  console.log('[converter] data.plan существует?', !!data?.plan);
  console.log('[converter] data.plan.walls существует?', !!data?.plan?.walls);

  if (!data?.plan?.walls) {
    throw new Error('Неверный формат .plan: отсутствует data.plan.walls');
  }

  const wallKeys = Object.keys(data.plan.walls);
  console.log('[converter] Стен в файле:', wallKeys.length, '— ключи:', wallKeys);

  const walls    = [];
  const openings = [];
  const oldIdToNewId = {};

  let nextWallId = 1;
  let nextOpenId = 1;

  // ── Стены ────────────────────────────────────────────────────────
  for (const [oldId, wd] of Object.entries(data.plan.walls)) {
    console.log('[converter] стена ' + oldId + ': archive=' + wd.archive + ' demount=' + wd.demount + ' depth=' + wd.depth + ' height=' + wd.height);
    console.log('  p1:', JSON.stringify(wd.p1), 'p2:', JSON.stringify(wd.p2));

    if (wd.archive === 1 || wd.demount === 1) {
      console.log('  → ПРОПУСК (archive/demount)');
      continue;
    }

    const p1x = wd.p1.x * 10;
    const p1y = wd.p1.y * 10;
    const p2x = wd.p2.x * 10;
    const p2y = wd.p2.y * 10;

    const lenMm = Math.hypot(p2x - p1x, p2y - p1y);
    console.log('  длина: ' + lenMm.toFixed(1) + ' мм');

    if (lenMm < 1) {
      console.log('  → ПРОПУСК (нулевая длина)');
      continue;
    }

    const thickness = (wd.depth  || 10)  * 10;
    const height    = (wd.height || 270) * 10;

    walls.push({
      id:               nextWallId,
      x1:               p1x,
      y1:               p1y,
      x2:               p2x,
      y2:               p2y,
      cx1:              p1x,
      cy1:              p1y,
      cx2:              p2x,
      cy2:              p2y,
      thickness,
      height,
      offset:           'center',
      horizontalOffset: 0,
      priority:         nextWallId,
      material:         wd.material || null,
    });

    console.log('  → ДОБАВЛЕНА как id=' + nextWallId + ', thickness=' + thickness + ', height=' + height);
    oldIdToNewId[oldId] = nextWallId;
    nextWallId++;
  }

  console.log('[converter] Итого стен после фильтрации:', walls.length);

  // ── Проёмы ───────────────────────────────────────────────────────
  for (const [oldId, wd] of Object.entries(data.plan.walls)) {
    if (wd.archive === 1 || wd.demount === 1) continue;
    if (!wd.holes) continue;

    const newWallId = oldIdToNewId[oldId];
    if (!newWallId) continue;

    const wallLenCm = Math.hypot(wd.p2.x - wd.p1.x, wd.p2.y - wd.p1.y);
    if (wallLenCm < 0.1) continue;

    console.log('[converter] проёмы стены ' + oldId + ':', Object.keys(wd.holes));

    for (const [holeId, hole] of Object.entries(wd.holes)) {
      const holeType = hole.type === 'window' ? 'window' : 'door';
      const p1d      = hole.p1d || 0;
      const t        = p1d / wallLenCm;
      const width    = (hole.width  || 80)  * 10;
      const height   = (hole.height || 200) * 10;
      const hinge    = (hole.opening === 'l') ? 'start' : 'end';

      console.log('  проём ' + holeId + ': type=' + hole.type + '→' + holeType + ' p1d=' + p1d + ' t=' + t.toFixed(3) + ' width=' + width + ' height=' + height);

      openings.push({
        id:     nextOpenId++,
        wallId: newWallId,
        t,
        width,
        height,
        type:   holeType,
        hinge,
        swing:  1,
      });
    }
  }

  console.log('[converter] Итого проёмов:', openings.length);
  console.log('[converter] РЕЗУЛЬТАТ — walls:', walls.length, 'openings:', openings.length);

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
