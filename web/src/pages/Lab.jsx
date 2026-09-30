import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import { useSeason } from '../lib/season.jsx';
import { fmtLap, fmtNum } from '../lib/format.js';
import DriverName from '../components/DriverName.jsx';
import JsonView from '../components/JsonView.jsx';
import Query from '../components/Query.jsx';
import { ValidationError } from '../components/labValidation.jsx';

const SECTIONS = [
  { id: 'crud', n: '01', title: 'Lap editor', tag: 'CRUD' },
  { id: 'aggregation', n: '02', title: 'Standings pipeline', tag: 'Aggregation' },
  { id: 'indexes', n: '03', title: 'Indexes', tag: 'Indexing' },
  { id: 'validation', n: '04', title: 'Schema validation', tag: '$jsonSchema' },
  { id: 'model', n: '05', title: 'Document model', tag: 'Embedding & references' },
];

export default function Lab() {
  const { health } = useSeason();
  const [active, setActive] = useState('crud');

  useEffect(() => {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) setActive(e.target.id);
    }, { rootMargin: '-40% 0px -55% 0px' });
    SECTIONS.forEach((s) => { const el = document.getElementById(s.id); if (el) io.observe(el); });
    return () => io.disconnect();
  }, []);

  return (
    <article className="page lab-page">
      <header className="container lab-hero">
        <p className="eyebrow">Data lab</p>
        <h1 className="display-lg">Under the hood</h1>
        <p className="lede">
          Everything on this site is a live MongoDB query. Here you can edit laps, watch the pipelines run, see the indexes at work and
          try to break the schema. {health && <>The <code>{health.db}</code> database holds {fmtNum(health.counts.laps)} laps, {health.counts.races} races and {health.counts.drivers} drivers.</>}
        </p>
      </header>
      <div className="container lab-layout">
        <nav className="lab-nav" aria-label="Data lab sections">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} className={active === s.id ? 'active' : ''} onClick={(e) => { e.preventDefault(); document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth' }); history.replaceState({}, '', `#${s.id}`); }}>
              <span className="mono">{s.n}</span>{s.title}
            </a>
          ))}
          <ResetButton />
        </nav>
        <div className="lab-sections">
          <LabSection s={SECTIONS[0]} intro="Create, read, update and delete lap documents. Leave a required field blank to watch MongoDB's validator reject the write."><LapEditor /></LabSection>
          <LabSection s={SECTIONS[1]} intro="The championship table is computed inside MongoDB: $unwind every race and sprint result, $group by driver to $sum points and $avg / $min finishing positions, $lookup the driver, $sort."><Aggregation /></LabSection>
          <LabSection s={SECTIONS[2]} intro="db.laps.getIndexes(), plus explain() on the same query with and without the compound index."><Indexes /></LabSection>
          <LabSection s={SECTIONS[3]} intro='The laps collection has a $jsonSchema validator. This inserts { circuit: "Monza", lapNumber: "three" } and shows what MongoDB says.'><Validation /></LabSection>
          <LabSection s={SECTIONS[4]} intro="One random lap as stored. The telemetry object is embedded in the lap; driverId and raceId are references to other collections."><DocModel /></LabSection>
        </div>
      </div>
    </article>
  );
}

function LabSection({ s, intro, children }) {
  return (
    <section id={s.id} className="lab-section">
      <div className="lab-section-head">
        <span className="lab-num mono">{s.n}</span>
        <div>
          <p className="eyebrow">{s.tag}</p>
          <h2 className="display-md">{s.title}</h2>
          <p className="lede small-lede">{intro}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function ResetButton() {
  const [state, setState] = useState('');
  const reset = async () => {
    if (!confirm('Drop the laps, races and drivers collections and reload the 2025 season?')) return;
    setState('Reloading…');
    try {
      const r = await api('/api/reset', { method: 'POST' });
      setState(`Reloaded ${fmtNum(r.laps)} laps`);
    } catch (e) {
      setState(e.message);
    }
  };
  return (
    <div className="reset">
      <button type="button" className="btn btn-ghost btn-sm" onClick={reset} disabled={state === 'Reloading…'}>Reset demo data</button>
      {state && <p className="muted small">{state}</p>}
    </div>
  );
}

// ------------------------------------------------------------- 01 CRUD

const EMPTY = { id: '', driverId: '', round: '', lapNumber: '', lapTime: '', position: '', speed: '', rpm: '', throttle: '', brake: '' };

function LapEditor() {
  const { drivers, races, driverById, raceByRound } = useSeason();
  const [filter, setFilter] = useState({ round: '24', driverId: '' });
  const [page, setPage] = useState(1);
  const [form, setForm] = useState({ ...EMPTY, round: '24' });
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const qs = new URLSearchParams({ page, limit: 15, ...(filter.round && { round: filter.round }), ...(filter.driverId && { driverId: filter.driverId }) });
  const { data, error } = useApi(`/api/laps?${qs}`);
  useEffect(() => setPage(1), [filter.round, filter.driverId]);
  useEffect(() => {
    if (!form.driverId && drivers.length) setForm((f) => ({ ...f, driverId: drivers[0]._id }));
  }, [drivers, form.driverId]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const body = () => ({
    driverId: form.driverId, round: form.round, lapNumber: form.lapNumber, lapTime: form.lapTime, position: form.position,
    telemetry: { speed: form.speed, rpm: form.rpm, throttle: form.throttle, brake: form.brake },
  });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = form.id ? await api(`/api/laps/${form.id}`, { method: 'PUT', body: body() }) : await api('/api/laps', { method: 'POST', body: body() });
      setMsg({ ok: true, text: form.id ? `Lap updated with replaceOne (modifiedCount: ${r.modifiedCount}).` : `Lap inserted with _id: ObjectId("${r.insertedId}").`, query: r.query });
      setForm((f) => ({ ...EMPTY, driverId: f.driverId, round: f.round }));
    } catch (err) {
      setMsg({ ok: false, payload: err.payload, text: err.message });
    } finally {
      setBusy(false);
    }
  };

  const edit = (l) => {
    const t = l.telemetry || {};
    setForm({ id: l._id, driverId: l.driverId, round: String(l.round ?? ''), lapNumber: l.lapNumber ?? '', lapTime: l.lapTime ?? '', position: l.position ?? '', speed: t.speed ?? '', rpm: t.rpm ?? '', throttle: t.throttle ?? '', brake: t.brake ?? '' });
    setMsg(null);
    document.getElementById('lap-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const remove = async (l) => {
    try {
      const r = await api(`/api/laps/${l._id}`, { method: 'DELETE' });
      setMsg({ ok: true, text: `Deleted lap ${l.lapNumber} of ${driverById.get(l.driverId)?.code} (deletedCount: ${r.deletedCount}).`, query: r.query });
      if (form.id === l._id) setForm((f) => ({ ...EMPTY, driverId: f.driverId, round: f.round }));
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    }
  };

  const sample = () => {
    const race = raceByRound.get(Number(form.round));
    const pace = (race?.track?.lap?.lapTime || 90) + 1 + Math.random() * 1.5;
    const top = race?.track ? Math.max(...race.track.speed) : 320;
    const r = (a, b, d = 1) => Number((a + Math.random() * (b - a)).toFixed(d));
    setForm((f) => ({ ...f, lapNumber: String(Math.floor(r(2, race?.laps || 50, 0))), lapTime: pace.toFixed(3), position: String(Math.floor(r(1, 20, 0))), speed: String(r(top - 6, top + 2)), rpm: String(Math.round(r(11400, 12100, 0))), throttle: String(r(58, 76)), brake: String(r(12, 24)) }));
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <div className="lab-card">
      <form id="lap-form" className={`lap-form ${form.id ? 'editing' : ''}`} onSubmit={submit} noValidate autoComplete="off">
        <label>Driver<select value={form.driverId} onChange={set('driverId')}>{drivers.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}</select></label>
        <label>Race<select value={form.round} onChange={set('round')}>{races.map((r) => <option key={r.round} value={r.round}>R{r.round} {r.shortName}</option>)}</select></label>
        <label>Lap number<input type="number" min="1" value={form.lapNumber} onChange={set('lapNumber')} placeholder="12" /></label>
        <label>Lap time (s)<input type="number" step="0.001" value={form.lapTime} onChange={set('lapTime')} placeholder="84.512" /></label>
        <label>Position<input type="number" min="1" value={form.position} onChange={set('position')} placeholder="4" /></label>
        <fieldset>
          <legend>Embedded <code>telemetry</code></legend>
          <label>Top speed (km/h)<input type="number" step="0.1" value={form.speed} onChange={set('speed')} placeholder="322.4" /></label>
          <label>Peak RPM<input type="number" value={form.rpm} onChange={set('rpm')} placeholder="11800" /></label>
          <label>Throttle (%)<input type="number" step="0.1" value={form.throttle} onChange={set('throttle')} placeholder="68.2" /></label>
          <label>Braking (%)<input type="number" step="0.1" value={form.brake} onChange={set('brake')} placeholder="17.5" /></label>
        </fieldset>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={busy}>{form.id ? 'Update lap' : 'Insert lap'}</button>
          {form.id && <button type="button" className="btn btn-ghost" onClick={() => setForm((f) => ({ ...EMPTY, driverId: f.driverId, round: f.round }))}>Cancel edit</button>}
          <button type="button" className="btn btn-ghost" onClick={sample}>Fill with sample values</button>
        </div>
      </form>
      {msg && (
        <div className={`msg ${msg.ok ? 'msg-ok' : 'msg-err'}`} role="status">
          {msg.payload?.mongoError ? <><p>Write rejected by MongoDB.</p><ValidationError payload={msg.payload} /></> : msg.text}
          {msg.query && <Query text={msg.query} label="Query that ran" />}
        </div>
      )}

      <div className="table-toolbar">
        <label className="select"><span className="sr-only">Race filter</span>
          <select value={filter.round} onChange={(e) => setFilter((f) => ({ ...f, round: e.target.value }))}>
            <option value="">All races</option>
            {races.map((r) => <option key={r.round} value={r.round}>R{r.round} {r.shortName}</option>)}
          </select>
        </label>
        <label className="select"><span className="sr-only">Driver filter</span>
          <select value={filter.driverId} onChange={(e) => setFilter((f) => ({ ...f, driverId: e.target.value }))}>
            <option value="">All drivers</option>
            {drivers.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
          </select>
        </label>
        <span className="muted small">{data ? `${fmtNum(data.total)} documents` : ''}</span>
      </div>
      {error && <p className="msg msg-err">{error.message}</p>}
      <div className="table-wrap">
        <table className="data-table">
          <thead><tr><th>Driver</th><th>Race</th><th className="num">Lap</th><th className="num">Pos</th><th className="num">Time</th><th className="num">Top speed</th><th className="num">RPM</th><th className="num">Throttle</th><th className="num">Brake</th><th /></tr></thead>
          <tbody>
            {data?.results.map((l) => (
              <tr key={l._id} className={form.id === l._id ? 'best' : ''}>
                <td><DriverName driver={driverById.get(l.driverId)} short /></td>
                <td className="small">{raceByRound.get(l.round)?.shortName ?? l.circuit ?? '—'}</td>
                <td className="num mono">{l.lapNumber}</td>
                <td className="num mono">{l.position ?? '—'}</td>
                <td className="num mono strong">{fmtLap(l.lapTime)}</td>
                <td className="num mono">{fmtNum(l.telemetry?.speed, 1)}</td>
                <td className="num mono">{fmtNum(l.telemetry?.rpm)}</td>
                <td className="num mono">{fmtNum(l.telemetry?.throttle, 1)}%</td>
                <td className="num mono">{fmtNum(l.telemetry?.brake, 1)}%</td>
                <td className="row-actions">
                  <button type="button" className="btn-link" onClick={() => edit(l)}>Edit</button>
                  <button type="button" className="btn-link danger" onClick={() => remove(l)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="pager">
        <button type="button" className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
        <span className="mono small">Page {page} of {fmtNum(totalPages)}</span>
        <button type="button" className="btn btn-ghost btn-sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
      </div>
      <Query text={data?.query} label="Read query" />
    </div>
  );
}

// ------------------------------------------------------------- 02 Aggregation

const STAGES = ['$project', '$unwind', '$group', '$lookup', '$unwind', '$project', '$sort'];

function Aggregation() {
  const { standings, standingsQuery, driverById } = useSeason();
  const top = standings.slice(0, 10);
  return (
    <div className="lab-card">
      <ol className="stages" aria-label="Pipeline stages">
        {STAGES.map((s, i) => <li key={i} className="mono">{s}</li>)}
      </ol>
      <div className="table-wrap">
        <table className="data-table">
          <thead><tr><th className="num">#</th><th>Driver</th><th className="num">Points ($sum)</th><th className="num">Wins</th><th className="num">Podiums</th><th className="num">Avg finish ($avg)</th><th className="num">Best ($min)</th><th className="num">Starts</th></tr></thead>
          <tbody>
            {top.map((s, i) => (
              <tr key={s.driverId}>
                <td className="num pos mono">{i + 1}</td>
                <td><DriverName driver={driverById.get(s.driverId)} /></td>
                <td className="num mono strong">{s.points}</td>
                <td className="num mono">{s.wins}</td>
                <td className="num mono">{s.podiums}</td>
                <td className="num mono">{s.avgFinish}</td>
                <td className="num mono">{s.bestFinish}</td>
                <td className="num mono">{s.starts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">Top 10 of {standings.length}. The full table is on the season page.</p>
      <Query text={standingsQuery} />
    </div>
  );
}

// ------------------------------------------------------------- 03 Indexes

function describeIndex(ix) {
  if (ix.name === '_id_') return ['Default', 'Created automatically on every collection. Enforces a unique _id.'];
  if (ix.weights) return ['Text', `Full-text index on ${Object.keys(ix.weights).join(', ')} (weights ${Object.entries(ix.weights).map(([k, v]) => `${k}:${v}`).join(', ')}). Powers the search box.`];
  const keys = Object.keys(ix.key);
  if (keys.length > 1) return ['Compound', `Sorted by ${keys.join(', then ')}. Serves any query on a prefix of these fields.`];
  return ['Single field', `Index on ${keys[0]}.`];
}

function planStages(plan) {
  const out = [];
  let node = plan?.queryPlan || plan;
  while (node) {
    out.push(node);
    node = node.inputStage || node.inputStages?.[0];
  }
  return out;
}

function Indexes() {
  const [run, setRun] = useState(0);
  const { data, error } = useApi(run ? `/api/nosql/indexes?run=${run}` : null);
  return (
    <div className="lab-card">
      <button type="button" className="btn btn-primary" onClick={() => setRun((r) => r + 1)}>Run db.laps.getIndexes() and explain()</button>
      {error && <p className="msg msg-err">{error.message}</p>}
      {data && (
        <>
          <div className="index-grid">
            {data.results.map((ix) => {
              const [kind, text] = describeIndex(ix);
              return (
                <div key={ix.name} className="index-card">
                  <span className="chip-static">{kind}</span>
                  <h4 className="mono">{ix.name}</h4>
                  <p className="small">{text}</p>
                  <code className="small">{JSON.stringify(ix.key)}</code>
                </div>
              );
            })}
          </div>
          {data.explain && (
            <div className="explain">
              <h3 className="h-small">Same query, with and without the index</h3>
              <pre className="small">{data.explain.query}</pre>
              <ExplainBar label={`IXSCAN on ${data.explain.indexUsed}`} plan={data.explain} total={data.explain.totalDocs} good />
              <ExplainBar label="COLLSCAN (forced with hint({ $natural: 1 }))" plan={data.explain.collscan} total={data.explain.totalDocs} />
              <p className="small">
                winningPlan:{' '}
                {planStages(data.explain.winningPlan).map((s, i, all) => (
                  <span key={i}><span className={`plan-stage ${s.stage === 'IXSCAN' ? 'ix' : ''}`}>{s.stage}{s.indexName ? ` (${s.indexName})` : ''}</span>{i < all.length - 1 ? ' ← ' : ''}</span>
                ))}
              </p>
              <p className="lede small-lede">
                With the index MongoDB reads {fmtNum(data.explain.totalDocsExamined)} documents to return {fmtNum(data.explain.nReturned)}. Without it, it has to scan all {fmtNum(data.explain.collscan.totalDocsExamined)}.
              </p>
            </div>
          )}
          <details className="query"><summary><span className="query-icon">{'{ }'}</span>Raw getIndexes() output</summary><JsonView value={data.results} /></details>
        </>
      )}
    </div>
  );
}

function ExplainBar({ label, plan, total, good }) {
  return (
    <div className={`explain-bar ${good ? 'good' : ''}`}>
      <div className="explain-label"><span>{label}</span><span className="mono small">{fmtNum(plan.totalDocsExamined)} docs examined · {fmtNum(plan.totalKeysExamined)} keys · {plan.executionTimeMillis} ms</span></div>
      <span className="explain-track"><span style={{ transform: `scaleX(${Math.max(0.004, plan.totalDocsExamined / total)})` }} /></span>
    </div>
  );
}

// ------------------------------------------------------------- 04 Validation

function Validation() {
  const [state, setState] = useState(null);
  const run = async () => {
    try {
      setState({ data: await api('/api/nosql/invalid-insert', { method: 'POST' }) });
    } catch (e) {
      setState({ error: e });
    }
  };
  const d = state?.data;
  return (
    <div className="lab-card">
      <button type="button" className="btn btn-danger" onClick={run}>Try inserting an invalid lap</button>
      {state?.error && <p className="msg msg-err">{state.error.message}</p>}
      {d && (
        <>
          <ValidationError payload={d} />
          <div className="two-col">
            <div><h3 className="h-small">Attempted insert</h3><pre className="small">{d.query}</pre></div>
            <div><h3 className="h-small">errInfo returned by MongoDB</h3><JsonView value={d.mongoError.errInfo} className="tall" /></div>
          </div>
          <details className="query"><summary><span className="query-icon">{'{ }'}</span>The collection's $jsonSchema validator</summary><JsonView value={d.validator} /></details>
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------- 05 Document model

function DocModel() {
  const [run, setRun] = useState(1);
  const { data, error } = useApi(`/api/nosql/embedded?run=${run}`);
  return (
    <div className="lab-card">
      <div className="row-between">
        <div className="legend">
          <span><span className="sw sw-embed" />Embedded (stored inside the document)</span>
          <span><span className="sw sw-ref" />Reference (points to another collection)</span>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRun((r) => r + 1)}>Another lap</button>
      </div>
      {error && <p className="msg msg-err">{error.message}</p>}
      {data && (
        <div className="doc-grid">
          <div>
            <h3 className="h-small"><code>laps</code> document</h3>
            <JsonView value={data.lap} embed={['telemetry', 'sectors']} refs={['driverId', 'raceId']} />
          </div>
          <div>
            <h3 className="h-small">Referenced <code>drivers</code> document</h3>
            <JsonView value={data.referencedDriver} refs={['_id']} />
            <h3 className="h-small">Referenced <code>races</code> document <span className="muted small">(first 3 results)</span></h3>
            <JsonView value={data.referencedRace} refs={['_id']} embed={['results']} />
          </div>
          <p className="lede small-lede doc-note">
            A driver is stored once and referenced by hundreds of laps (one-to-many), then joined at query time with <code>$lookup</code>. The telemetry belongs to exactly one lap, so it is embedded and comes back in the same read. Each race embeds its own classification as an array of sub-documents, which is what the standings pipeline unwinds.
          </p>
        </div>
      )}
      <Query text={data?.query} />
    </div>
  );
}
