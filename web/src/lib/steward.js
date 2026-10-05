import { useSyncExternalStore } from 'react';

// Steward mode on/off, shared by every page and remembered across reloads.
const KEY = 'steward-mode';
const listeners = new Set();
let on = false;
try { on = localStorage.getItem(KEY) === '1'; } catch {}

export function setSteward(value) {
  on = value;
  try { localStorage.setItem(KEY, value ? '1' : '0'); } catch {}
  listeners.forEach((fn) => fn());
}

export function useSteward() {
  return useSyncExternalStore((fn) => { listeners.add(fn); return () => listeners.delete(fn); }, () => on);
}

// "(added)" / "(edited)" / "(hidden)" tags for laps that are not untouched race data.
export function lapTags(lap) {
  const tags = [];
  if (lap.source === 'steward') tags.push('added');
  else if (lap.stewardEdited) tags.push('edited');
  if (lap.deleted) tags.push('hidden');
  return tags;
}

export function lapRowClass(lap) {
  return [lap.source === 'steward' && 'row-added', lap.source !== 'steward' && lap.stewardEdited && 'row-edited', lap.deleted && 'row-hidden'].filter(Boolean).join(' ');
}
