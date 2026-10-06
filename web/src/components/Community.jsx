import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import { useSeason } from '../lib/season.jsx';
import { Link } from '../lib/router.jsx';
import { fmtNum } from '../lib/format.js';
import DriverName from './DriverName.jsx';
import Query from './Query.jsx';
import FeatureLabel from './FeatureLabel.jsx';
import { ValidationError } from './labValidation.jsx';
import { PushPin, ThumbsUp } from '@phosphor-icons/react';
import { useDisplayName, rememberDisplayName } from '../lib/displayName.js';

const ago = (iso) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
};

export const useRaceNotes = (round) => useApi(`/api/races/${round}/notes`);

// ---------------------------------------------------------- Lap notes (Race page)

export function LapNotes({ race }) {
  const { driverById } = useSeason();
  const notes = useRaceNotes(race.round);
  const me = useDisplayName();
  const [form, setForm] = useState({ author: me.name, lapNumber: '', driverId: '', text: '' });
  useEffect(() => { if (me.signedIn) setForm((f) => ({ ...f, author: me.name })); }, [me]);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null);
  const [tagFor, setTagFor] = useState(null);
  const list = notes.data?.results || [];
  const pinned = list.filter((n) => n.pinned).length;

  const run = async (fn) => {
    setBusy(true);
    try {
      const r = await fn();
      setMsg({ ok: true, query: r.query });
      return r;
    } catch (err) {
      setMsg({ ok: false, text: err.message, payload: err.payload });
    } finally {
      setBusy(false);
    }
  };
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    rememberDisplayName(form.author);
    const r = await run(() => api(`/api/races/${race.round}/notes`, { method: 'POST', body: form }));
    if (r) setForm((f) => ({ ...f, text: '' }));
  };
  const saveEdit = async (e) => {
    e.preventDefault();
    if (await run(() => api(`/api/notes/${editing.id}`, { method: 'PATCH', body: { text: editing.text } }))) setEditing(null);
  };
  const addTag = async (e) => {
    e.preventDefault();
    if (await run(() => api(`/api/notes/${tagFor.id}/tags`, { method: 'POST', body: { tag: tagFor.tag } }))) setTagFor(null);
  };

  return (
    <div className="lap-notes">
      <form className="note-form" onSubmit={submit} noValidate autoComplete="off">
        <label>Your name<input type="text" value={form.author} onChange={set('author')} placeholder="Aarush" maxLength={40} readOnly={me.signedIn} /></label>
        <label>Lap<input type="text" inputMode="numeric" value={form.lapNumber} onChange={set('lapNumber')} placeholder={`1-${race.laps}`} /></label>
        <label>Driver<select value={form.driverId} onChange={set('driverId')}><option value="">Whole race</option>{race.results.map((r) => driverById.get(r.driverId)).filter(Boolean).map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}</select></label>
        <label className="note-text">Note<input type="text" value={form.text} onChange={set('text')} placeholder="The undercut that won it" maxLength={280} /></label>
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>Add note</button>
      </form>
      {msg && !msg.ok && <div className="msg msg-err" role="status">{msg.payload?.mongoError ? <ValidationError payload={msg.payload} /> : msg.text}</div>}

      <div className="notes-toolbar">
        <span className="muted small">{list.length ? `${list.length} ${list.length === 1 ? 'note' : 'notes'} · ${pinned} pinned on the gap chart` : 'No notes on this race yet. Be the first.'}</span>
        {!!list.length && (
          <span className="notes-bulk">
            <button type="button" className="btn-link" disabled={busy || pinned === list.length} onClick={() => run(() => api(`/api/races/${race.round}/notes/pin`, { method: 'POST', body: { pinned: true } }))}>Pin all</button>
            <button type="button" className="btn-link" disabled={busy || !pinned} onClick={() => run(() => api(`/api/races/${race.round}/notes/pin`, { method: 'POST', body: { pinned: false } }))}>Unpin all</button>
          </span>
        )}
      </div>

      <ul className="note-list">
        {list.map((n) => {
          const d = n.driverId && driverById.get(n.driverId);
          return (
            <li key={n._id} className="note">
              <div className="note-head">
                <strong>{n.author}</strong> <span className="user-tag">(user note)</span>
                <span className="muted small">{n.lapNumber ? `Lap ${n.lapNumber}` : 'Whole race'}{d ? ` · ${d.code}` : ''} · {ago(n.createdAt)}{n.editedAt ? ' (edited)' : ''}{n.pinned ? <PushPin size={12} weight="fill" className="inline-icon" aria-label="pinned" /> : null}</span>
              </div>
              {editing?.id === n._id ? (
                <form className="note-inline" onSubmit={saveEdit}>
                  <input type="text" value={editing.text} onChange={(e) => setEditing({ ...editing, text: e.target.value })} maxLength={280} autoFocus />
                  <button type="submit" className="btn-link" disabled={busy}>Save</button>
                  <button type="button" className="btn-link" onClick={() => setEditing(null)}>Cancel</button>
                </form>
              ) : <p className="note-body">{n.text}</p>}
              <div className="note-actions">
                <button type="button" className="btn-link" disabled={busy} onClick={() => run(() => api(`/api/notes/${n._id}/helpful`, { method: 'POST' }))}><ThumbsUp size={14} className="inline-icon" /> Helpful {n.helpful}</button>
                <button type="button" className="btn-link" onClick={() => setEditing({ id: n._id, text: n.text })}>Edit</button>
                {n.tags.map((t) => <span key={t} className="note-tag">#{t}</span>)}
                {tagFor?.id === n._id ? (
                  <form className="note-inline" onSubmit={addTag}>
                    <input type="text" value={tagFor.tag} onChange={(e) => setTagFor({ ...tagFor, tag: e.target.value })} placeholder="overtake" maxLength={24} autoFocus />
                    <button type="submit" className="btn-link" disabled={busy}>Add</button>
                  </form>
                ) : <button type="button" className="btn-link" onClick={() => setTagFor({ id: n._id, tag: '' })}>+ tag</button>}
              </div>
            </li>
          );
        })}
      </ul>
      <FeatureLabel name="Update operators: $inc (helpful), $set (edit), $addToSet (tags), updateMany (pin all)" />
      <Query text={msg?.ok ? msg.query : notes.data?.query} label={msg?.ok ? 'Query that ran' : undefined} />
    </div>
  );
}

// ---------------------------------------------------------- Latest notes (Home, capped collection)

const VERB = { created: 'noted', edited: 'edited a note on', upvoted: 'found a note helpful on' };

export function NotesFeed() {
  const { data, error } = useApi('/api/notes/feed');
  if (error) return <p className="msg msg-err">{error.message}</p>;
  const list = data?.results || [];
  return (
    <div className="notes-feed">
      {!data ? <div className="skeleton" style={{ height: 160 }} /> : !list.length ? (
        <p className="muted">No notes yet. Open any race and add one under “Fan notes”.</p>
      ) : (
        <ul className="feed-list">
          {list.map((f) => (
            <li key={f._id}>
              <span className="user-tag">(user note)</span>{' '}
              <strong>{f.author}</strong> {f.action === 'upvoted' ? 'liked a note on' : VERB[f.action]}{' '}
              <Link to={`/race/${f.round}#notes`}>{f.race?.replace(' Grand Prix', ' GP')}{f.lapNumber ? `, lap ${f.lapNumber}` : ''}</Link>
              <span className="muted small"> · {ago(f.at)}</span>
              <p className="feed-text muted small">“{f.text}”</p>
            </li>
          ))}
        </ul>
      )}
      <FeatureLabel name={`Capped collection: notes_feed keeps the newest ${data?.max || 50} events`} />
      <Query text={data?.query} />
    </div>
  );
}

// ---------------------------------------------------------- Season summary (Home, $merge)

export function SeasonSummary() {
  const { driverById } = useSeason();
  const { data, error } = useApi('/api/season/summary');
  if (error) return <p className="msg msg-err">{error.message}</p>;
  if (!data) return <div className="skeleton" style={{ height: 420 }} />;
  return (
    <div>
      <div className="table-wrap">
        <table className="data-table compact">
          <thead><tr><th className="num">Pos</th><th>Driver</th><th className="num">Pts</th><th className="num">Wins</th><th className="num">Podiums</th><th className="num">Racing laps</th><th className="num">Top speed</th><th className="num">Avg throttle</th></tr></thead>
          <tbody>
            {data.results.map((r) => (
              <tr key={r._id}>
                <td className="num mono">{r.position}</td>
                <td><DriverName driver={driverById.get(r._id)} short sub={r.team} /></td>
                <td className="num mono strong">{r.points}</td>
                <td className="num mono">{r.wins}</td>
                <td className="num mono">{r.podiums}</td>
                <td className="num mono">{fmtNum(r.racingLaps)}</td>
                <td className="num mono">{r.topSpeed ? `${fmtNum(r.topSpeed)} km/h` : '-'}</td>
                <td className="num mono">{r.avgThrottle ? `${r.avgThrottle}%` : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <FeatureLabel name="$merge: season_summary materialised from races + clean_laps" />
      <Query text={data.query} />
    </div>
  );
}

// ---------------------------------------------------------- Share a comparison (Compare, TTL index)

export function ShareComparison({ a, b, sharedDays }) {
  const [share, setShare] = useState(null);
  const [err, setErr] = useState(null);
  const [copied, setCopied] = useState(false);
  const make = async () => {
    setErr(null);
    try {
      setShare(await api('/api/shares', { method: 'POST', body: { a, b } }));
    } catch (e) { setErr(e.message); }
  };
  const url = share && `${location.origin}/compare?s=${share.code}`;
  const copy = () => navigator.clipboard?.writeText(url).then(() => setCopied(true), () => {});
  return (
    <div className="share-box">
      {sharedDays != null && <p className="small">You opened a shared comparison. <span className="muted">This link expires in {sharedDays} {sharedDays === 1 ? 'day' : 'days'}.</span></p>}
      {share ? (
        <p className="small share-link">
          <code>{url}</code>{' '}
          <button type="button" className="btn-link" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
          <span className="muted"> · link expires in {share.expiresInDays} days</span>
        </p>
      ) : <button type="button" className="btn btn-ghost btn-sm" onClick={make}>Share this comparison</button>}
      {err && <p className="msg msg-err">{err}</p>}
      <FeatureLabel name="TTL index: shared links expire after 7 days" />
      {share && <Query text={share.query} label="Query that ran" />}
    </div>
  );
}

// ---------------------------------------------------------- Consistency (Driver page, clean_laps view)

export function Consistency({ driver }) {
  const { data, error } = useApi(`/api/drivers/${driver._id}/consistency`);
  if (error) return <p className="msg msg-err">{error.message}</p>;
  const r = data?.result;
  if (data && !r) return null;
  return (
    <div className="consistency">
      <h3 className="h-small">Consistency</h3>
      <div className="kpis">
        <div><span className="kpi-label">Lap-time spread</span><span className="kpi mono">{r ? `± ${r.stdDev.toFixed(3)} s` : '-'}</span><span className="muted small">average std dev per race</span></div>
        <div><span className="kpi-label">Rank</span><span className="kpi mono">{r ? `${r.rank} / ${r.field}` : '-'}</span><span className="muted small">1 = most consistent</span></div>
        <div><span className="kpi-label">Field average</span><span className="kpi mono">{r ? `± ${r.fieldAvg.toFixed(3)} s` : '-'}</span><span className="muted small">{r ? `over ${r.races} races` : ''}</span></div>
      </div>
      <FeatureLabel name="Driver consistency" type="user" />
      <FeatureLabel name="View: clean_laps (no pit laps, lap 1 or laps over 107%)" />
      <Query text={data?.query} explain={data?.explain} />
    </div>
  );
}

// ---------------------------------------------------------- Teammate battle (Team page)

export function TeammateBattle({ team }) {
  const { driverById } = useSeason();
  const { data, error } = useApi(`/api/teams/${encodeURIComponent(team)}/teammates`);
  if (error) return <p className="msg msg-err">{error.message}</p>;
  if (!data) return <div className="skeleton" style={{ height: 220 }} />;
  return (
    <div className="teammates">
      {!data.results.length && <p className="muted">This team never had two cars classified in the same race.</p>}
      {data.results.map((p) => {
        const A = driverById.get(p.a), B = driverById.get(p.b);
        if (!A || !B) return null;
        const gap = p.medianGap;
        const quicker = gap == null || gap === 0 ? null : gap < 0 ? A : B;
        const total = p.aAhead + p.bAhead || 1;
        return (
          <div key={`${p.a}-${p.b}`} className="mate-pair">
            <div className="mate-score">
              <span className="mate-side"><DriverName driver={A} short /><span className="mate-big mono">{p.aAhead}</span></span>
              <span className="mate-bar" aria-hidden="true">
                <span style={{ flexGrow: p.aAhead / total, background: A.teamColor }} />
                <span style={{ flexGrow: p.bAhead / total, background: B.teamColor, opacity: 0.55 }} />
              </span>
              <span className="mate-side right"><span className="mate-big mono">{p.bAhead}</span><DriverName driver={B} short /></span>
            </div>
            <p className="small">
              Finished ahead in {p.aAhead} and {p.bAhead} of {p.races.length} races together.{' '}
              {quicker ? <>Median racing-lap gap: <strong>{quicker.lastName}</strong> quicker by <span className="mono">{Math.abs(gap).toFixed(3)} s</span>.</> : 'Dead level on median pace.'}
            </p>
            <div className="duel-strip">
              {p.races.map((r) => {
                const aWon = r.aPos && (!r.bPos || r.aPos < r.bPos);
                const bWon = r.bPos && (!r.aPos || r.bPos < r.aPos);
                return (
                  <Link key={r.round} to={`/race/${r.round}`} className="duel-cell" style={{ background: aWon ? A.teamColor : bWon ? B.teamColor : 'var(--surface-2)', opacity: bWon ? 0.6 : 1 }} title={`${r.name}: ${A.code} ${r.aPos ?? 'DNF'} · ${B.code} ${r.bPos ?? 'DNF'}${r.gap != null ? ` · pace gap ${r.gap > 0 ? '+' : ''}${r.gap}s` : ''}`}>
                    <span className="mono">{aWon ? A.code : bWon ? B.code : '-'}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
      <FeatureLabel name="Teammate battle" type="user" />
      <Query text={data.query} explain={data.explain} />
    </div>
  );
}

