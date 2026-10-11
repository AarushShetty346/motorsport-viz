import { useEffect, useState } from 'react';

// Who is using the site. The one place the app asks /api/auth/me, shared by every
// component: whether Google sign-in is on (configured), who is signed in, and the
// name shown on their notes. With sign-in off, the name typed in the note form is used.
const KEY = 'lbl-note-name';
const saved = () => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } };

export function rememberDisplayName(name) {
  try { localStorage.setItem(KEY, name); } catch { /* private mode */ }
}

let request = null;
const listeners = new Set();
const load = () => (request ??= fetch('/api/auth/me').then((r) => (r.ok ? r.json() : null)).catch(() => null));

export function refreshMe() {
  request = null;
  load().then((me) => listeners.forEach((fn) => fn(me)));
}

const toUser = (me) => ({
  ready: true,
  configured: !!me?.configured,
  signedIn: !!me?.user,
  id: me?.user?._id || null,
  name: me?.user?.name || saved(),
  user: me?.user || null,
});

export function useDisplayName() {
  const [user, setUser] = useState({ ready: false, configured: false, signedIn: false, id: null, name: saved(), user: null });
  useEffect(() => {
    const update = (me) => setUser(toUser(me));
    listeners.add(update);
    load().then(update);
    return () => listeners.delete(update);
  }, []);
  return user;
}

// May this visitor write at all? Always, when sign-in is off.
export const canWrite = (me) => !me.configured || me.signedIn;

// May this visitor change or delete something someone added? Only their own,
// once sign-in is on (things added while it was off stay open to everyone).
export const ownsEntry = (me, doc) => !me.configured || (me.signedIn && (!doc.addedBy?.userId || doc.addedBy.userId === me.id));
