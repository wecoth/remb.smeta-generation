// ─── CORE.JS — BIM-ядро: управление зависимостями и реактивностью ─
//
// Принцип: любое изменение объекта проходит через core.notifyChange(),
// который автоматически запускает обновление всех зависимых объектов.
//
// Текущая реализация — лёгкая версия поверх EventBus.
// Будущая версия (когда стен > 200) может добавить инкрементальный
// пересчёт только затронутых комнат через wallIds.
//
// Использование:
//   core.notifyChange('wall', wallId, { action: 'update', fields: ['geometry'] });
//   core.notifyChange('wall', wallId, { action: 'create' });
//   core.notifyChange('wall', wallId, { action: 'delete' });
//   core.notifyChange('opening', openingId, { action: 'create' });

import { EventBus } from './eventBus.js';
import { appState } from './state.js';
import { invalidateJointCache } from './wall.js';

class BIMCore {
  constructor() {
    // Реестр зависимостей: sourceKey → [handler]
    // sourceKey = '*' означает «любой объект данного типа»
    this._handlers = new Map();
    // Очередь изменений для batch-обновлений
    this._pendingChanges = [];
    this._batchMode = false;
  }

  // ── Регистрация зависимости ───────────────────────────────────────
  // Пример: core.on('wall', '*', handler) — реагировать на любое изменение стен
  // Пример: core.on('wall', 42, handler)  — только на стену с id=42
  on(type, id, handler) {
    const key = `${type}:${id === '*' ? '*' : String(id)}`;
    if (!this._handlers.has(key)) this._handlers.set(key, []);
    this._handlers.get(key).push(handler);
    return () => this.off(type, id, handler); // возвращает функцию отписки
  }

  off(type, id, handler) {
    const key = `${type}:${id === '*' ? '*' : String(id)}`;
    const arr = this._handlers.get(key);
    if (arr) {
      const idx = arr.indexOf(handler);
      if (idx >= 0) arr.splice(idx, 1);
    }
  }

  // ── Уведомление об изменении ──────────────────────────────────────
  // type:   'wall' | 'opening' | 'room'
  // id:     числовой идентификатор объекта
  // change: { action: 'create'|'update'|'delete', fields?: string[] }
  notifyChange(type, id, change = {}) {
    if (this._batchMode) {
      this._pendingChanges.push({ type, id, change });
      return;
    }
    this._dispatch(type, id, change);
  }

  // ── Групповое обновление нескольких объектов ───────────────────────
  // Все изменения накапливаются, обработчики вызываются один раз в конце.
  batch(fn) {
    this._batchMode = true;
    this._pendingChanges = [];
    try {
      fn();
    } finally {
      this._batchMode = false;
      const changes = this._pendingChanges;
      this._pendingChanges = [];
      // Дедуплицируем по type:id
      const seen = new Set();
      for (const { type, id, change } of changes) {
        const key = `${type}:${id}`;
        if (!seen.has(key)) {
          seen.add(key);
          this._dispatch(type, id, change);
        }
      }
    }
  }

  _dispatch(type, id, change) {
    // Вызываем специфичные обработчики (для конкретного id)
    const specific = this._handlers.get(`${type}:${id}`);
    if (specific) for (const h of specific) h(change, id);

    // Вызываем wildcard обработчики (для любого объекта данного типа)
    const wildcard = this._handlers.get(`${type}:*`);
    if (wildcard) for (const h of wildcard) h(change, id);

    // Проброс в EventBus для обратной совместимости
    // Это позволяет ui-planner.js и room.js продолжать слушать walls:changed
    if (type === 'wall' || type === 'opening') {
      EventBus.emit('walls:changed', { type, id, ...change });
    }
    if (type === 'room') {
      EventBus.emit('rooms:computed', { type, id, ...change });
    }
  }
}

export const core = new BIMCore();

// ── Встроенные реакции системы ────────────────────────────────────
//
// При изменении стены → инвалидируем кэш геометрии.
// room.js подписан на EventBus('walls:changed') и пересчитывает комнаты сам.
//
// В будущем здесь можно заменить на инкрементальный пересчёт:
//   core.on('wall', '*', (change, wallId) => {
//     recomputeAffectedRooms(wallId);  // только затронутые комнаты
//   });

core.on('wall', '*', (change) => {
  // geometry/create/delete — всегда инвалидируем кэш стыков и union
  if (['create', 'delete', 'update'].includes(change.action)) {
    invalidateJointCache(); // сбрасывает и _jointRectsCache и _unionCache
  }
});

// ── Вспомогательные функции для Commands ─────────────────────────
//
// Команды должны вызывать core.notifyChange() вместо прямого EventBus.emit().
// Это обеспечивает централизованный контроль зависимостей.

export function notifyWallCreated(wallId) {
  core.notifyChange('wall', wallId, { action: 'create' });
}

export function notifyWallUpdated(wallId, fields = []) {
  core.notifyChange('wall', wallId, { action: 'update', fields });
}

export function notifyWallDeleted(wallId) {
  core.notifyChange('wall', wallId, { action: 'delete' });
}

export function notifyOpeningCreated(openingId, wallId) {
  core.notifyChange('opening', openingId, { action: 'create', wallId });
}

export function notifyOpeningDeleted(openingId, wallId) {
  core.notifyChange('opening', openingId, { action: 'delete', wallId });
}
