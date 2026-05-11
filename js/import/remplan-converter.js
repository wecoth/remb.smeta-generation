// js/import/remplan-converter.js
// Конвертер .plan (RemPlanner) → формат REMB
// Без зависимостей от остального кода приложения

export function convertRemPlanToProject(jsonString) {
  const data = JSON.parse(jsonString);

  if (!data?.plan?.walls) {
    throw new Error('Неверный формат .plan: отсутствует data.plan.walls');
  }

  const walls    = [];
  const openings = [];
  const oldIdToNewId = {}; // строковый id .plan → числовой id REMB

  let nextWallId = 1;
  let nextOpenId = 1;

  // ── Стены ────────────────────────────────────────────────────────
  for (const [oldId, wd] of Object.entries(data.plan.walls)) {
    // Пропускаем архивные, демонтируемые и нулевые
    if (wd.archive === 1 || wd.demount === 1) continue;

    // p1/p2 в .plan — это центральные осевые точки торцов стены (в сантиметрах)
    const p1x = wd.p1.x * 10; // см → мм
    const p1y = wd.p1.y * 10;
    const p2x = wd.p2.x * 10;
    const p2y = wd.p2.y * 10;

    const lenMm = Math.hypot(p2x - p1x, p2y - p1y);
    if (lenMm < 1) continue; // стена короче 1 мм — пропускаем

    const thickness = (wd.depth  || 10)  * 10; // см → мм
    const height    = (wd.height || 270) * 10; // см → мм

    // В .plan p1/p2 — это осевые точки, поэтому используем offset: 'center'
    // x1/y1/x2/y2 = грань (совпадает с осью при center), cx1/cy1/cx2/cy2 = ось
    walls.push({
      id:              nextWallId,
      x1:              p1x,
      y1:              p1y,
      x2:              p2x,
      y2:              p2y,
      cx1:             p1x,
      cy1:             p1y,
      cx2:             p2x,
      cy2:             p2y,
      thickness,
      height,
      offset:          'center',
      horizontalOffset: 0,
      priority:        nextWallId,
      material:        wd.material || null,
    });

    oldIdToNewId[oldId] = nextWallId;
    nextWallId++;
  }

  // ── Проёмы ───────────────────────────────────────────────────────
  // В .plan проёмы хранятся ВНУТРИ стены в поле holes, а не отдельным массивом
  for (const [oldId, wd] of Object.entries(data.plan.walls)) {
    if (wd.archive === 1 || wd.demount === 1) continue;
    if (!wd.holes) continue;

    const newWallId = oldIdToNewId[oldId];
    if (!newWallId) continue; // стена была пропущена выше

    // Длина стены в сантиметрах для вычисления t
    const wallLenCm = Math.hypot(wd.p2.x - wd.p1.x, wd.p2.y - wd.p1.y);
    if (wallLenCm < 0.1) continue;

    for (const [, hole] of Object.entries(wd.holes)) {
      // Определяем тип
      const holeType = hole.type === 'window' ? 'window' : 'door';

      // p1d — расстояние в см от начала стены до начала проёма
      const p1d   = hole.p1d || 0;
      // t — позиция начала проёма вдоль стены (0..1)
      const t     = p1d / wallLenCm;

      const width  = (hole.width  || 80)  * 10; // см → мм
      const height = (hole.height || 200) * 10;

      // opening — сторона открывания: 'r' или 'l'
      // hinge в REMB: 'start' или 'end'
      const hinge = (hole.opening === 'l') ? 'start' : 'end';
      const swing = 1; // по умолчанию

      openings.push({
        id:     nextOpenId++,
        wallId: newWallId,
        t,
        width,
        height,
        type:   holeType,
        hinge,
        swing,
      });
    }
  }

  return {
    walls,
    openings,
    dividers:         [],
    measures:         [],
    rooms:            [],
    roomNameOverrides: {},
    dimensionOffsets: {},
    idWall:           nextWallId,
    idOpen:           nextOpenId,
    idDivider:        1,
    idMeasure:        1,
  };
}
