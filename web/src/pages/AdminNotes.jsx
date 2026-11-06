import { useState } from 'react';
import { api } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import { useDisplayName } from '../lib/displayName.js';
import { Link } from '../lib/router.jsx';
import SignInPrompt from '../components/SignInPrompt.jsx';

// Admin-only queue: notes stay private to their author until they are approved here.
export default function AdminNotes() {
  const me = useDisplayName();
  if (!me.ready) return <div className="page" />;
  return (
    <section className="page container me-page">
      <p className="eyebrow">Admin</p>
      <h1 className="display-xl">Review notes</h1>
      {!me.configured && <p className="lede">Sign-in is off on this copy of the app, so there is nothing to review.</p>}
      {me.configured && !me.signedIn && <SignInPrompt>Sign in with Google to review notes.</SignInPrompt>}
      {me.signedIn && !me.isAdmin && <p className="lede">This page is for admins only.</p>}
      {me.isAdmin && <Queue />}
    </section>
  );
}

function Queue() {
  const [status, setStatus] = useState('pending');
  const { data, error } = useApi(`/api/admin/notes?status=${status}`);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const act = async (fn) => {
    setBusy(true); setErr(null);
    try { await fn(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const approve = (n, approved) => act(() => api(`/api/admin/notes/${n._id}/approve`, { method: 'POST', body: { approved } }));
  const remove = (n) => confirm('Delete this note?') && act(() => api(`/api/notes/${n._id}`, { method: 'DELETE' }));
  const list = data?.results || [];
  return (
    <>
      <p className="lede">Approved notes are visible to everyone, including visitors who are not signed in.</p>
      <div className="review-tabs">
        <button type="button" className={`btn btn-sm ${status === 'pending' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setStatus('pending')}>Waiting</button>
        <button type="button" className={`btn btn-sm ${status === 'approved' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setStatus('approved')}>Approved</button>
      </div>
      {(error || err) && <p className="msg msg-err">{error?.message || err}</p>}
      {data && !list.length && <p className="muted">{status === 'pending' ? 'Nothing waiting for review.' : 'No approved notes yet.'}</p>}
      <ul className="review-list">
        {list.map((n) => (
          <li key={n._id}>
            <span className="small"><strong>{n.author}</strong> on <Link to={`/race/${n.round}#notes`}>{n.race || `Round ${n.round}`}</Link>{n.lapNumber ? `, lap ${n.lapNumber}` : ''} · <span className="muted">{new Date(n.createdAt).toLocaleString()}</span></span>
            <p>{n.text}</p>
            <div className="review-actions">
              <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => approve(n, !n.approved)}>{n.approved ? 'Unapprove' : 'Approve'}</button>
              <button type="button" className="btn-link danger" disabled={busy} onClick={() => remove(n)}>Delete</button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
