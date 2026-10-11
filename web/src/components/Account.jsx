import { useEffect, useRef, useState } from 'react';
import { Link } from '../lib/router.jsx';
import { useDisplayName, refreshMe } from '../lib/displayName.js';
import { invalidate } from '../lib/api.js';

// Sign in with Google: a button when signed out, the user's avatar and a menu when signed in.
export default function Account() {
  const me = useDisplayName();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    addEventListener('pointerdown', close);
    addEventListener('keydown', esc);
    return () => { removeEventListener('pointerdown', close); removeEventListener('keydown', esc); };
  }, [open]);

  if (!me.configured) return null;

  if (!me.user) {
    return (
      <a className="signin-btn" href="/api/auth/google" aria-label="Sign in with Google">
        <GoogleMark />
        <span>Sign in</span>
      </a>
    );
  }

  const { name, email, picture } = me.user;
  const signOut = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    refreshMe();
    invalidate();
    setOpen(false);
  };

  return (
    <div className="account" ref={ref}>
      <button type="button" className="account-btn" aria-haspopup="menu" aria-expanded={open} aria-label={`Signed in as ${name}`} onClick={() => setOpen((o) => !o)}>
        {picture ? <img src={picture} alt="" referrerPolicy="no-referrer" /> : <span>{name.slice(0, 1).toUpperCase()}</span>}
      </button>
      {open && (
        <div className="account-menu tone-dark" role="menu">
          <p className="account-name">{name}</p>
          <p className="account-email">{email}</p>
          <Link to="/me" role="menuitem" className="account-link" onClick={() => setOpen(false)}>My activity</Link>
          <button type="button" role="menuitem" onClick={signOut}>Sign out</button>
        </div>
      )}
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z" />
    </svg>
  );
}
