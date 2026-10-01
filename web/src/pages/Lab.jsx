import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import { useSeason } from '../lib/season.jsx';
import { fmtLap, fmtGap, fmtNum } from '../lib/format.js';
import DriverName from '../components/DriverName.jsx';
import JsonView from '../components/JsonView.jsx';
import Query from '../components/Query.jsx';
import { ValidationError } from '../components/labValidation.jsx';
import Band from '../components/Band.jsx';

const SECTIONS = [
  { id: 'crud', n: '01', title: 'CRUD operations', tag: 'NoSQL Functionality 1' },
  { id: 'aggregation', n: '02', title: 'Aggregation pipeline', tag: 'NoSQL Functionality 2' },
  { id: 'indexes', n: '03', title: 'Indexing', tag: 'NoSQL Functionality 3' },
  { id: 'validation', n: '04', title: 'Schema validation', tag: 'NoSQL Functionality 4' },
  { id: 'model', n: '05', title: 'Embedded documents and referencing', tag: 'NoSQL Functionality 5' },
  { id: 'driver-laps', n: '06', title: 'All laps for a driver', tag: 'User Functionality 1' },
  { id: 'head-to-head', n: '07', title: 'Head-to-head comparison', tag: 'User Functionality 2' },
  { id: 'fastest', n: '08', title: 'Fastest lap leaderboard', tag: 'User Functionality 3' },
  { id: 'speed', n: '09', title: 'Laps above a speed threshold', tag: 'User Functionality 4' },
  { id: 'search', n: '10', title: 'Search by circuit', tag: 'User Functionality 5' },
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
    <article className="page band-page lab-page">
      <Band className="lab-band">
        <p className="band-meta">Data lab · live MongoDB</p>
        <h1 className="display-xl">Under<br />the hood</h1>
        <p className="lede">
          Everything on this site is a live MongoDB query. This page shows the five MongoDB features and the five user-defined features
          built on top of them, each with the exact query it runs. {health && <>The <code>{health.db}</code> database holds {fmtNum(health.counts.laps)} laps, {health.counts.races} races and {health.counts.drivers} drivers.</>}
        </p>
      </Band>
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
          <LabSection s={SECTIONS[1]} intro="$group by driverId with $avg (average lap), $min (fastest lap) and $sum (lap count), $lookup the drivers collection for names, then $sort by average. The MongoDB equivalent of SQL's GROUP BY with AVG(), MIN() and a JOIN."><Aggregation /></LabSection>
          <LabSection s={SECTIONS[2]} intro="db.laps.getIndexes() lists three indexes: the default _id index, a compound index on { driverId, lapNumber } and a text index on circuit. explain() then shows MongoDB using the compound index (IXSCAN) instead of scanning the whole collection (COLLSCAN)."><Indexes /></LabSection>
          <LabSection s={SECTIONS[3]} intro='The laps collection has a $jsonSchema validator. This inserts { circuit: "Monza", lapNumber: "three" } and shows what MongoDB says.'><Validation /></LabSection>
          <LabSection s={SECTIONS[4]} intro="One lap document as raw JSON. The telemetry object (speed, rpm, throttle, brake) is embedded because it belongs only to that lap; driverId is a reference to the drivers collection because one driver has many laps."><DocModel /></LabSection>
          <LabSection s={SECTIONS[5]} intro="Choose a driver and it runs find({ driverId }), sorted by circuit and lap number. This query uses the compound index."><DriverLaps /></LabSection>
          <LabSection s={SECTIONS[6]} intro="Pick two drivers: $match keeps only their laps and $group calculates average lap times overall and per circuit. The per-circuit table keeps it fair, since a Silverstone lap is about 7 seconds longer than a Monza lap."><HeadToHead /></LabSection>
          <LabSection s={SECTIONS[7]} intro="$sort puts every lap in order of lap time, then $group with $first keeps each driver's fastest whole lap, including its circuit, lap number and top speed."><FastestLaps /></LabSection>
          <LabSection s={SECTIONS[8]} intro='Enter a speed and it runs find({ "telemetry.speed": { $gt: N } }). Dot notation queries a field inside the embedded telemetry document directly, with no join.'><SpeedThreshold /></LabSection>
          <LabSection s={SECTIONS[9]} intro='Full-text search with $text: { $search: "..." } on the circuit text index, sorted by relevance score. It ignores case, and several words (e.g. "monza silverstone") match laps at either circuit.'><CircuitSearch /></LabSection>
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

const STAGES = ['$group', '$lookup', '$unwind', '$project', '$sort'];

function Aggregation() {
  const { driverById } = useSeason();
  const [run, setRun] = useState(0);
  const { data, error } = useApi(run ? `/api/nosql/aggregation?run=${run}` : null);
  const best = data?.results[0]?.avgLapTime || 0;
  const maxGap = Math.max(0.001, ...(data?.results || []).map((r) => r.avgLapTime - best));
  return (
    <div className="lab-card">
      <button type="button" className="btn btn-primary" onClick={() => setRun((r) => r + 1)}>Show avg + fastest lap per driver</button>
      <ol className="stages" aria-label="Pipeline stages">
        {STAGES.map((s, i) => <li key={i} className="mono">{s}</li>)}
      </ol>
      {error && <p className="msg msg-err">{error.message}</p>}
      {data && (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th className="num">#</th><th>Driver</th><th className="num">Average lap ($avg)</th><th className="num">Fastest lap ($min)</th><th className="num">Laps ($sum)</th><th className="gap-col">Gap to best average</th></tr></thead>
            <tbody>
              {data.results.map((r, i) => (
                <tr key={r.driverId}>
                  <td className="num pos mono">{i + 1}</td>
                  <td><DriverName driver={driverById.get(r.driverId)} /></td>
                  <td className="num mono strong">{fmtLap(r.avgLapTime)}</td>
                  <td className="num mono">{fmtLap(r.fastestLap)}</td>
                  <td className="num mono">{fmtNum(r.laps)}</td>
                  <td className="gap-col">
                    <span className="gap-bar"><span style={{ transform: `scaleX(${(r.avgLapTime - best) / maxGap})` }} /></span>
                    <span className="mono small">{fmtGap(r.avgLapTime - best)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Query text={data?.query} />
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
      <button type="button" className="btn btn-primary" onClick={() => setRun((r) => r + 1)}>Run db.laps.getIndexes()</button>
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

// ------------------------------------------------------------- 06 All laps for a driver

function DriverLaps() {
  const { drivers } = useSeason();
  const [driverId, setDriverId] = useState('');
  const { data, error } = useApi(driverId ? `/api/user/driver-laps/${driverId}` : null);
  const best = data?.results.reduce((m, l) => (l.lapTime < m ? l.lapTime : m), Infinity);
  return (
    <div className="lab-card">
      <div className="table-toolbar" style={{ marginTop: 0 }}>
        <label className="select">Driver{' '}
          <select value={driverId} onChange={(e) => setDriverId(e.target.value)}>
            <option value="">— choose a driver —</option>
            {drivers.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
          </select>
        </label>
        {data && <span className="muted small">{fmtNum(data.results.length)} laps · personal best {fmtLap(best)}</span>}
      </div>
      {error && <p className="msg msg-err">{error.message}</p>}
      {data && (
        <div className="table-wrap" style={{ maxHeight: 480, overflowY: 'auto' }}>
          <table className="data-table">
            <thead><tr><th>Circuit</th><th className="num">Lap</th><th className="num">Time</th><th className="num">Top speed</th><th className="num">RPM</th><th className="num">Throttle</th><th className="num">Brake</th></tr></thead>
            <tbody>
              {data.results.map((l) => (
                <tr key={l._id} className={l.lapTime === best ? 'best' : ''}>
                  <td className="small">{l.circuit ?? '—'}</td>
                  <td className="num mono">{l.lapNumber}</td>
                  <td className="num mono strong">{fmtLap(l.lapTime)}</td>
                  <td className="num mono">{fmtNum(l.telemetry?.speed, 1)}</td>
                  <td className="num mono">{fmtNum(l.telemetry?.rpm)}</td>
                  <td className="num mono">{fmtNum(l.telemetry?.throttle, 1)}%</td>
                  <td className="num mono">{fmtNum(l.telemetry?.brake, 1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Query text={data?.query} />
    </div>
  );
}

// ------------------------------------------------------------- 07 Head-to-head

function HeadToHead() {
  const { drivers, standings } = useSeason();
  const [pick, setPick] = useState({ a: '', b: '' });
  const [run, setRun] = useState(null);
  const a = pick.a || standings[0]?.driverId || '';
  const b = pick.b || standings[1]?.driverId || '';
  const { data, error } = useApi(run ? `/api/user/compare?a=${run.a}&b=${run.b}` : null);
  const [ra, rb] = data?.results || [];
  const perCircuit = ra && rb
    ? (ra.stats?.perRace || []).map((r) => ({ ...r, b: (rb.stats?.perRace || []).find((x) => x.round === r.round) })).filter((r) => r.b)
    : [];
  const avgA = ra?.stats?.avgLapTime, avgB = rb?.stats?.avgLapTime;
  const faster = avgA && avgB ? (avgA <= avgB ? ra : rb) : null;
  const card = (side) => (
    <div className="h2h-card" style={{ '--team': side.driver.teamColor }}>
      <DriverName driver={side.driver} />
      <p className="h2h-big mono">{side.stats ? fmtLap(side.stats.avgLapTime) : '—'}</p>
      <p className="muted small">Average racing lap over {fmtNum(side.stats?.laps ?? 0)} laps</p>
      {faster === side && <p className="strong">Faster by {Math.abs(avgA - avgB).toFixed(3)}s</p>}
    </div>
  );
  const select = (side, value) => (
    <label className="select">Driver {side.toUpperCase()}{' '}
      <select value={value} onChange={(e) => setPick((p) => ({ ...p, [side]: e.target.value }))}>
        {drivers.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
      </select>
    </label>
  );
  return (
    <div className="lab-card">
      <div className="table-toolbar" style={{ marginTop: 0 }}>
        {select('a', a)}
        {select('b', b)}
        <button type="button" className="btn btn-primary" disabled={!a || !b || a === b} onClick={() => setRun({ a, b })}>Compare</button>
      </div>
      {a && a === b && <p className="msg msg-err">Pick two different drivers.</p>}
      {error && <p className="msg msg-err">{error.message}</p>}
      {data && (
        <>
          <div className="h2h">
            {card(ra)}
            <div className="h2h-vs">VS</div>
            {card(rb)}
          </div>
          <div className="table-wrap" style={{ marginTop: 20 }}>
            <table className="data-table">
              <thead><tr><th>Circuit</th><th className="num">{ra.driver.code} average</th><th className="num">{rb.driver.code} average</th><th className="num">Gap</th><th>Faster</th></tr></thead>
              <tbody>
                {perCircuit.map((r) => (
                  <tr key={r.round}>
                    <td className="small">{r.circuit ?? r.race}</td>
                    <td className="num mono">{fmtLap(r.avgLapTime)}</td>
                    <td className="num mono">{fmtLap(r.b.avgLapTime)}</td>
                    <td className="num mono">{Math.abs(r.avgLapTime - r.b.avgLapTime).toFixed(3)}s</td>
                    <td className="strong">{r.avgLapTime <= r.b.avgLapTime ? ra.driver.code : rb.driver.code}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!perCircuit.length && <p className="muted">These two never raced at the same circuit.</p>}
        </>
      )}
      <Query text={data?.query} />
    </div>
  );
}

// ------------------------------------------------------------- 08 Fastest lap leaderboard

function FastestLaps() {
  const { driverById } = useSeason();
  const [run, setRun] = useState(0);
  const { data, error } = useApi(run ? `/api/user/leaderboard?run=${run}` : null);
  const leader = data?.results[0]?.lapTime || 0;
  const maxGap = Math.max(0.001, ...(data?.results || []).map((r) => r.lapTime - leader));
  return (
    <div className="lab-card">
      <button type="button" className="btn btn-primary" onClick={() => setRun((r) => r + 1)}>Show fastest lap per driver</button>
      {error && <p className="msg msg-err">{error.message}</p>}
      {data && (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th className="num">Pos</th><th>Driver</th><th className="num">Fastest lap</th><th>Circuit</th><th className="num">Lap</th><th className="num">Top speed</th><th className="gap-col">Gap to leader</th></tr></thead>
            <tbody>
              {data.results.map((r, i) => (
                <tr key={r.driverId}>
                  <td className="num pos mono">P{i + 1}</td>
                  <td><DriverName driver={driverById.get(r.driverId)} /></td>
                  <td className="num mono strong">{fmtLap(r.lapTime)}</td>
                  <td className="small">{r.circuit}</td>
                  <td className="num mono">{r.lapNumber}</td>
                  <td className="num mono">{fmtNum(r.topSpeed, 1)}</td>
                  <td className="gap-col">
                    <span className="gap-bar"><span style={{ transform: `scaleX(${(r.lapTime - leader) / maxGap})` }} /></span>
                    <span className="mono small">{fmtGap(r.lapTime - leader)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Query text={data?.query} />
    </div>
  );
}

// ------------------------------------------------------------- 09 Speed threshold

function SpeedThreshold() {
  const { driverById } = useSeason();
  const [min, setMin] = useState('340');
  const [run, setRun] = useState(null);
  const { data, error } = useApi(run !== null ? `/api/user/speed?min=${encodeURIComponent(run)}&limit=50` : null);
  return (
    <div className="lab-card">
      <form className="table-toolbar" style={{ marginTop: 0 }} onSubmit={(e) => { e.preventDefault(); setRun(min); }}>
        <label className="lap-form" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, padding: 0 }}>
          Top speed greater than <input type="number" min="0" step="1" value={min} onChange={(e) => setMin(e.target.value)} style={{ width: 96 }} /> km/h
        </label>
        <button type="submit" className="btn btn-primary">Find laps</button>
        {data && <span className="muted small">{fmtNum(data.total)} laps{data.total > data.results.length ? ` · fastest ${data.results.length} shown` : ''}</span>}
      </form>
      {error && <p className="msg msg-err">{error.message}</p>}
      {data && (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Driver</th><th>Circuit</th><th className="num">Lap</th><th className="num">Time</th><th className="num">telemetry.speed</th></tr></thead>
            <tbody>
              {data.results.map((l) => (
                <tr key={l._id}>
                  <td><DriverName driver={driverById.get(l.driverId)} short /></td>
                  <td className="small">{l.circuit}</td>
                  <td className="num mono">{l.lapNumber}</td>
                  <td className="num mono">{fmtLap(l.lapTime)}</td>
                  <td className="num mono strong">{fmtNum(l.telemetry.speed, 1)} km/h</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Query text={data?.query} />
    </div>
  );
}

// ------------------------------------------------------------- 10 Search by circuit

function CircuitSearch() {
  const [q, setQ] = useState('Monza');
  const [run, setRun] = useState(null);
  const { data, error } = useApi(run ? `/api/user/search?q=${encodeURIComponent(run)}` : null);
  return (
    <div className="lab-card">
      <form className="table-toolbar" style={{ marginTop: 0 }} onSubmit={(e) => { e.preventDefault(); setRun(q.trim() || ' '); }}>
        <label className="lap-form" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, padding: 0 }}>
          Circuit <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Monza" style={{ width: 220 }} />
        </label>
        <button type="submit" className="btn btn-primary">Search</button>
        {data && <span className="muted small">{fmtNum(data.results.reduce((n, r) => n + r.laps, 0))} matching laps</span>}
      </form>
      {error && <p className="msg msg-err">{error.message}</p>}
      {data && (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Circuit</th><th>Race</th><th className="num">Laps matched</th><th className="num">Fastest lap</th><th className="num">Top speed</th><th className="num">Score (textScore)</th></tr></thead>
            <tbody>
              {data.results.map((r) => (
                <tr key={r.round}>
                  <td className="strong">{r.circuit}</td>
                  <td className="small">{r.race}</td>
                  <td className="num mono">{fmtNum(r.laps)}</td>
                  <td className="num mono">{fmtLap(r.fastestLap)}</td>
                  <td className="num mono">{fmtNum(r.topSpeed, 1)}</td>
                  <td className="num mono">{r.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && !data.results.length && <p className="muted">No laps at a circuit matching “{run}”.</p>}
      <Query text={data?.query} />
    </div>
  );
}
