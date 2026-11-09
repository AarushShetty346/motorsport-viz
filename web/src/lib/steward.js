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

// Steward changes are kept in this browser only (localStorage), never sent to the
// server, so one visitor's edits never change the race data anyone else sees.
// Per race: added laps, field edits, hidden laps and time penalties.
const CHANGES_KEY = 'steward-changes';
const changeListeners = new Set();
let changes = {};
try { changes = JSON.parse(localStorage.getItem(CHANGES_KEY) || '{}') || {}; } catch { changes = {}; }
const empty = () => ({ added: [], edits: {}, hidden: {}, penalties: {} });

function save(round, next) {
  changes = { ...changes, [round]: next };
  try { localStorage.setItem(CHANGES_KEY, JSON.stringify(changes)); } catch {}
  changeListeners.forEach((fn) => fn());
}
const forRound = (round) => ({ ...empty(), ...changes[round] });

export function useStewardChanges(round) {
  return useSyncExternalStore((fn) => { changeListeners.add(fn); return () => changeListeners.delete(fn); }, () => changes[round] || EMPTY_CHANGES);
}
const EMPTY_CHANGES = empty();

export const isLocalLap = (lap) => String(lap._id).startsWith('local-');

export function addLocalLap(round, lap) {
  const c = forRound(round);
  const doc = { ...lap, _id: `local-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, round, source: 'steward' };
  save(round, { ...c, added: [...c.added, doc] });
  return doc;
}

export function editLocalLap(round, id, fields) {
  const c = forRound(round);
  if (String(id).startsWith('local-')) save(round, { ...c, added: c.added.map((l) => (l._id === id ? { ...l, ...fields, telemetry: { ...l.telemetry, ...fields.telemetry } } : l)) });
  else save(round, { ...c, edits: { ...c.edits, [id]: { ...c.edits[id], ...fields } } });
}

export function removeLocalLap(round, id) {
  const c = forRound(round);
  save(round, { ...c, added: c.added.filter((l) => l._id !== id) });
}

export function hideLocalLap(round, id, hidden) {
  const c = forRound(round);
  const next = { ...c.hidden };
  if (hidden) next[id] = true; else delete next[id];
  save(round, { ...c, hidden: next });
}

export function penaliseLocalLap(round, id, seconds) {
  const c = forRound(round);
  save(round, { ...c, penalties: { ...c.penalties, [id]: (c.penalties[id] || 0) + seconds } });
}

export const restoreLocalLaps = (round) => save(round, { ...forRound(round), hidden: {} });
export const clearLocalChanges = (round) => save(round, empty());

// Apply this browser's changes to laps that came from the server.
export function applyChanges(c, laps) {
  return laps.map((l) => {
    const edit = c.edits[l._id];
    const pen = c.penalties[l._id] || 0;
    if (!edit && !pen && !c.hidden[l._id]) return l;
    const out = { ...l, ...edit, telemetry: { ...l.telemetry, ...edit?.telemetry }, stewardEdited: true };
    if (pen) { out.lapTime = (out.lapTime || 0) + pen; out.penaltySeconds = (l.penaltySeconds || 0) + pen; }
    if (c.hidden[l._id]) out.deleted = true;
    return out;
  });
}

// Light checks in place of the database validator, since nothing is sent to it.
export function checkLap(lap) {
  const errors = [];
  if (!lap.driverId) errors.push('pick a driver');
  if (!(Number.isInteger(lap.lapNumber) && lap.lapNumber > 0)) errors.push('lap number must be a whole number above 0');
  if (!(lap.lapTime > 0)) errors.push('lap time must be a number of seconds above 0');
  return errors;
}
