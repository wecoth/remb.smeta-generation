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
//
// ИСПРАВЛЕНИЕ T-примыканий (тип 'edge'):
//   В RemPlanner T-стена может подключаться к грани несущей стены:
//   - z0='l' → к l-грани хоста = к cx хоста → cx T-стены уже корректен
//   - z0='r' → к r-грани хоста → cx T-стены попадает на r-грань,
//               но должен быть на cx хоста (= l-грань).
//               Фикс: проецируем cx-конец T-стены на cx-линию (l1→l2) хоста.

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

  // Быстрый доступ к сырым RP-стенам по id (нужен для T-фикса)
  const rpWallById = data.plan.walls; // объект { rpId: wallData }

  const walls        = [];
  const openings     = [];
  const oldIdToNewId = {};

  let nextWallId = 1;
  let nextOpenId = 1;

  // ── Вспомогательная: проекция точки на линию A→B ────────────────
  function projectPointOntoLine(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 1e-10) return { x: ax, y: ay };
    const t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
    return { x: ax + t * dx, y: ay + t * dy };
  }

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
      cx1 = L1.x * 10;  cy1 = L1.y * 10;
      cx2 = L2.x * 10;  cy2 = L2.y * 10;

      // ── Фикс T-примыканий z0='r' ──────────────────────────────
      // Если конец стены подключается к r-грани несущей (z0='r'),
      // текущий cx-конец лежит на r-грани хоста, а нужно — на его cx (= l-грани).
      // Проецируем cx-конец на cx-линию (l1→l2) хоста.
      for (const endKey of ['p1', 'p2']) {
        const endPt = wd[endKey];
        const link  = endPt?.link;
        if (!link || link.ct !== 'edge' || link.z0 !== 'r') continue;

        const host = rpWallById[link.id];
        if (!host?.l1 || !host?.l2) continue;

        // cx-линия хоста: l1→l2 (в мм)
        const hL1x = host.l1.x * 10, hL1y = host.l1.y * 10;
        const hL2x = host.l2.x * 10, hL2y = host.l2.y * 10;

        if (endKey === 'p1') {
          // cx1 нужно спроецировать на линию хоста
          const proj = projectPointOntoLine(cx1, cy1, hL1x, hL1y, hL2x, hL2y);
          console.log('[converter] T-фикс ' + oldId + '.p1 (z0=r → ' + link.id + '):'
            + ' cx1 (' + cx1.toFixed(1) + ',' + cy1.toFixed(1) + ')'
            + ' → (' + proj.x.toFixed(1) + ',' + proj.y.toFixed(1) + ')');
          cx1 = proj.x;  cy1 = proj.y;
        } else {
          // cx2
          const proj = projectPointOntoLine(cx2, cy2, hL1x, hL1y, hL2x, hL2y);
          console.log('[converter] T-фикс ' + oldId + '.p2 (z0=r → ' + link.id + '):'
            + ' cx2 (' + cx2.toFixed(1) + ',' + cy2.toFixed(1) + ')'
            + ' → (' + proj.x.toFixed(1) + ',' + proj.y.toFixed(1) + ')');
          cx2 = proj.x;  cy2 = proj.y;
        }
      }
      // ────────────────────────────────────────────────────────────

      // x/y = ось стены = cx + halfT * (l→r единичный вектор)
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
