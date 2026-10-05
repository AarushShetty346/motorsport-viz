import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import { useSeason } from '../lib/season.jsx';
import { fmtLap, fmtNum, COMPOUND } from '../lib/format.js';
import { useSteward, setSteward, lapTags, lapRowClass } from '../lib/steward.js';
import DriverName from './DriverName.jsx';
import Query from './Query.jsx';
import FeatureLabel from './FeatureLabel.jsx';
import { ValidationError } from './labValidation.jsx';

const EMPTY = { id: '', driverId: '', lapNumber: '', lapTime: '', position: '', compound: '', speed: '', rpm: '', throttle: '', brake: '' };

// Every lap of one race. Steward mode adds, edits, penalises, hides and deletes laps.
export default function RaceLaps({ race, onOpenLap }) {
  const { drivers, driverById, health } = useSeason();
  const steward = useSteward();
  const [driverId, setDriverId] = useState('');
  const [page, setPage] = useState(1);
  const [form, setForm] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const qs = new URLSearchParams({ round: race.round, page, limit: 20, ...(driverId && { driverId }), ...(steward && { steward: '1' }) });
  const { data, error } = useApi(`/api/laps?${qs}`);
  useEffect(() => setPage(1), [driverId, steward]);
  useEffect(() => { if (!steward) setForm(null); }, [steward]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const run = async (fn, ok) => {
    setBusy(true);
    try {
      const r = await fn();
      setMsg({ ok: true, text: ok(r), query: r.query });
      return r;
    } catch (err) {
      setMsg({ ok: false, text: err.message, payload: err.payload });
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    const body = {
      driverId: form.driverId, round: race.round, lapNumber: form.lapNumber, lapTime: form.lapTime, position: form.position, compound: form.compound,
      telemetry: { speed: form.speed, rpm: form.rpm, throttle: form.throttle, brake: form.brake },
    };
    const r = form.id
      ? await run(() => api(`/api/laps/${form.id}`, { method: 'PUT', body }), (r) => `Lap updated with updateOne + $set (modifiedCount: ${r.modifiedCount}).`)
      : await run(() => api('/api/laps', { method: 'POST', body }), (r) => `Lap added with insertOne, _id: ObjectId("${r.insertedId}").`);
    if (r) setForm(null);
  };

  const startAdd = () => {
    setMsg(null);
    setForm({ ...EMPTY, driverId: driverId || drivers[0]?._id || '' });
  };
  const startEdit = (l) => {
    const t = l.telemetry || {};
    setMsg(null);
    setForm({ id: l._id, driverId: l.driverId, lapNumber: l.lapNumber ?? '', lapTime: l.lapTime ?? '', position: l.position ?? '', compound: l.compound ?? '', speed: t.speed ?? '', rpm: t.rpm ?? '', throttle: t.throttle ?? '', brake: t.brake ?? '' });
  };
  const code = (l) => driverById.get(l.driverId)?.code;

  const penalty = (l) => run(() => api(`/api/laps/${l._id}/penalty`, { method: 'POST', body: { seconds: 5 } }), () => `5 s penalty applied to ${code(l)} lap ${l.lapNumber}: the lap ($inc) and the race result were updated in one transaction.`);
  const hide = (l, hidden) => run(() => api(`/api/laps/${l._id}/hidden`, { method: 'PATCH', body: { hidden } }), () => `${hidden ? 'Hid' : 'Restored'} ${code(l)} lap ${l.lapNumber} with $set: { deleted: ${hidden} }.`);
  const remove = (l) => run(() => api(`/api/laps/${l._id}`, { method: 'DELETE' }), (r) => `Deleted the added lap (deletedCount: ${r.deletedCount}).`);
  const restoreAll = () => run(() => api(`/api/races/${race.round}/restore`, { method: 'POST' }), (r) => `Restored ${r.modifiedCount} hidden ${r.modifiedCount === 1 ? 'lap' : 'laps'} with updateMany.`);
  const reset = async () => {
    if (!confirm('Reload the whole 2025 season? Every steward change is lost.')) return;
    await run(() => api('/api/reset', { method: 'POST' }), (r) => `Reloaded ${fmtNum(r.laps)} laps from the season file.`);
  };

  return (
    <div className={`race-laps ${steward ? 'is-steward' : ''}`}>
      <div className="table-toolbar">
        <label className="select"><span className="sr-only">Driver</span>
          <select value={driverId} onChange={(e) => setDriverId(e.target.value)}>
            <option value="">All drivers</option>
            {drivers.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
          </select>
        </label>
        <span className="muted small">{data ? `${fmtNum(data.total)} laps` : ''}</span>
        <label className="steward-toggle">
          <input type="checkbox" checked={steward} onChange={(e) => setSteward(e.target.checked)} />
          <span>Steward mode</span>
        </label>
      </div>

      {steward && (
        <div className="steward-bar">
          <p className="small">Steward mode: changes here are not real race data. Added laps are tagged <span className="lap-tag added">added</span>, changed real laps <span className="lap-tag edited">edited</span>. Neither counts towards leaderboards or stats.</p>
          <div className="steward-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={startAdd} disabled={busy}>Add lap</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={restoreAll} disabled={busy}>Restore all hidden laps</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={reset} disabled={busy}>Reset demo data</button>
          </div>
          <FeatureLabel name="CRUD: insertOne, find, updateOne, deleteOne" />
          <FeatureLabel name="Update operators: $inc, $set, updateMany" />
          <FeatureLabel name={`Transactions: lap + race result in one session${health && !health.transactions ? ' (unavailable: not a replica set)' : ''}`} />
        </div>
      )}

      {form && (
        <form className={`lap-form ${form.id ? 'editing' : ''}`} onSubmit={submit} noValidate autoComplete="off">
          <label>Driver<select value={form.driverId} onChange={set('driverId')} disabled={!!form.id}>{drivers.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}</select></label>
          <label>Lap number<input type="text" inputMode="numeric" value={form.lapNumber} onChange={set('lapNumber')} placeholder="12" /></label>
          <label>Lap time (s)<input type="text" inputMode="decimal" value={form.lapTime} onChange={set('lapTime')} placeholder="84.512" /></label>
          <label>Position<input type="text" inputMode="numeric" value={form.position} onChange={set('position')} placeholder="4" /></label>
          <label>Tyre<select value={form.compound} onChange={set('compound')}><option value="">—</option>{Object.entries(COMPOUND).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}</select></label>
          <fieldset>
            <legend>Embedded <code>telemetry</code></legend>
            <label>Top speed (km/h)<input type="text" inputMode="decimal" value={form.speed} onChange={set('speed')} placeholder="322.4" /></label>
            <label>Peak RPM<input type="text" inputMode="numeric" value={form.rpm} onChange={set('rpm')} placeholder="11800" /></label>
            <label>Throttle (%)<input type="text" inputMode="decimal" value={form.throttle} onChange={set('throttle')} placeholder="68.2" /></label>
            <label>Braking (%)<input type="text" inputMode="decimal" value={form.brake} onChange={set('brake')} placeholder="17.5" /></label>
          </fieldset>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={busy}>{form.id ? 'Save lap' : 'Add lap'}</button>
            <button type="button" className="btn btn-ghost" onClick={() => { setForm(null); setMsg(null); }}>Cancel</button>
          </div>
          {msg && !msg.ok && msg.payload?.mongoError && (
            <div className="form-error">
              <ValidationError payload={msg.payload} />
              <FeatureLabel name="Schema validation: $jsonSchema (code 121)" />
            </div>
          )}
        </form>
      )}

      {msg && !(form && msg.payload?.mongoError) && (
        <div className={`msg ${msg.ok ? 'msg-ok' : 'msg-err'}`} role="status">
          {msg.payload?.mongoError ? <ValidationError payload={msg.payload} /> : msg.text}
          {msg.query && <Query text={msg.query} label="Query that ran" />}
        </div>
      )}

      {error && <p className="msg msg-err">{error.message}</p>}
      <div className="table-wrap">
        <table className="data-table lap-table">
          <thead><tr><th className="num">Lap</th><th>Driver</th><th className="num">Pos</th><th className="num">Time</th><th>Tyre</th><th className="num">Top speed</th>{steward && <th />}</tr></thead>
          <tbody>
            {data?.results.map((l) => {
              const added = l.source === 'steward';
              return (
                <tr key={l._id} className={`clickable ${lapRowClass(l)}`} onClick={() => onOpenLap?.(l._id)}>
                  <td className="num mono">{l.lapNumber}</td>
                  <td><DriverName driver={driverById.get(l.driverId)} short sub={lapTags(l).map((t) => `(${t})`).join(' ') || undefined} /></td>
                  <td className="num mono">{l.position ?? '—'}</td>
                  <td className="num mono strong">{fmtLap(l.lapTime)}{l.penaltySeconds ? <span className="pen-tag">+{l.penaltySeconds}s</span> : null}</td>
                  <td>{l.compound && <span className="tyre" style={{ '--tyre': COMPOUND[l.compound]?.color }}>{COMPOUND[l.compound]?.label}</span>}</td>
                  <td className="num mono">{fmtNum(l.telemetry?.speed, 1)}</td>
                  {steward && (
                    <td className="row-actions" onClick={(e) => e.stopPropagation()}>
                      <button type="button" className="btn-link" onClick={() => startEdit(l)} disabled={busy}>Edit</button>
                      {!added && <button type="button" className="btn-link" onClick={() => penalty(l)} disabled={busy || l.deleted}>Apply 5 s penalty</button>}
                      {added
                        ? <button type="button" className="btn-link danger" onClick={() => remove(l)} disabled={busy}>Delete</button>
                        : <button type="button" className="btn-link danger" onClick={() => hide(l, !l.deleted)} disabled={busy}>{l.deleted ? 'Restore' : 'Hide'}</button>}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="pager">
        <button type="button" className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
        <span className="mono small">Page {page} of {fmtNum(totalPages)}</span>
        <button type="button" className="btn btn-ghost btn-sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
      </div>
      <Query text={data?.query} explain={data?.explain} />
    </div>
  );
}
