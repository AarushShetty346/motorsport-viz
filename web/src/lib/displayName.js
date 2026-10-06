import { useEffect, useState } from 'react';

// The name shown on user content (fan notes). This is the one place it comes from:
// a name the visitor typed before, or the signed-in account once sign-in exists
// (/api/auth/me answers 404 until then, so the typed name is used).
const KEY = 'lbl-note-name';
const saved = () => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } };

export function rememberDisplayName(name) {
  try { localStorage.setItem(KEY, name); } catch { /* private mode */ }
}

export function useDisplayName() {
  const [user, setUser] = useState({ name: saved(), signedIn: false });
  useEffect(() => {
    fetch('/api/auth/me').then((r) => (r.ok ? r.json() : null)).then((me) => {
      if (me?.user?.name) setUser({ name: me.user.name, signedIn: true });
    }, () => {});
  }, []);
  return user;
}
