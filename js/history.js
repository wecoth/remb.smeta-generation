// ─── HISTORY.JS ───────────────────────────────────────────────────
import { appState } from './state.js';

let historyPast   = [];
let historyFuture = [];
export let isRestoringHistory = false;

export function snapshotState() {
  return {
    walls:              appState.walls.map(w => ({ ...w })),
    openings:           appState.openings.map(o => ({ ...o })),
    roomNameOverrides:  { ...appState.roomNameOverrides },
    idWall:             appState.idWall,
    idOpen:             appState.idOpen,
  };
}

export function restoreSnapshot(snapshot) {
  appState.walls             = snapshot.walls.map(w => ({ ...w }));
  appState.openings          = snapshot.openings.map(o => ({ ...o }));
  appState.roomNameOverrides = { ...(snapshot.roomNameOverrides || {}) };
  appState.idWall            = snapshot.idWall;
  appState.idOpen            = snapshot.idOpen;
}

export function recordHistory() {
  if (isRestoringHistory) return;
  const snapshot = snapshotState();
  const key = JSON.stringify(snapshot);
  const last = historyPast[historyPast.length - 1];
  if (last && last.key === key) return;
  historyPast.push({ key, snapshot });
  if (historyPast.length > 120) historyPast.shift();
  historyFuture = [];
}

export function undoHistory(onRestore) {
  if (historyPast.length <= 1) return;
  const current = historyPast.pop();
  historyFuture.push(current);
  isRestoringHistory = true;
  restoreSnapshot(historyPast[historyPast.length - 1].snapshot);
  isRestoringHistory = false;
  onRestore?.();
}

export function redoHistory(onRestore) {
  if (!historyFuture.length) return;
  const next = historyFuture.pop();
  historyPast.push(next);
  isRestoringHistory = true;
  restoreSnapshot(next.snapshot);
  isRestoringHistory = false;
  onRestore?.();
}

export function canUndo() { return historyPast.length > 1; }
export function canRedo() { return historyFuture.length > 0; }

export function clearHistory() {
  historyPast = [];
  historyFuture = [];
  recordHistory();
}
