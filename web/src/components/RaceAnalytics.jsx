import { useMemo, useState } from 'react';
import { useApi } from '../lib/useApi.js';
import { useSeason } from '../lib/season.jsx';
import { fmtLap, fmtNum, COMPOUND } from '../lib/format.js';
import DriverName from './DriverName.jsx';
import Query from './Query.jsx';
import FeatureLabel from './FeatureLabel.jsx';
import { useRaceNotes } from './Community.jsx';

const compoundColor = (c) => COMPOUND[c]?.color || '#888';
const compoundLabel = (c) => COMPOUND[c]?.label || 'Unknown';

// ---------------------------------------------------------- Race in numbers ($facet)

export function RaceNumbers({ round }) {
  const { data, error } = useApi(`/api/races/${round}/numbers`);
  if (error) return <p className="msg msg-err">{error.message}</p>;
  if (!data) return <div className="skeleton" style={{ height: 260 }} />;
  const s = data.summary;
  const buckets = data.histogram.filter((b) => b._id !== 'slower');
  const slower = data.histogram.find((b) => b._id === 'slower')?.laps || 0;
  const maxBucket = Math.max(1, ...buckets.map((b) => b.laps));
  const totalCompound = data.compounds.reduce((n, c) => n + c.laps, 0) || 1;
  return (
    <div className="numbers">
      {s && (
        <div className="kpis">
          <div><span className="kpi-label">Laps</span><span className="kpi mono">{fmtNum(s.laps)}</span><span className="muted small">{s.drivers} drivers</span></div>
          <div><span className="kpi-label">Fastest</span><span className="kpi mono">{fmtLap(s.fastest)}</span></div>
          <div><span className="kpi-label">Average</span><span className="kpi mono">{fmtLap(s.average)}</span><span className="muted small">± {fmtNum(s.spread, 2)} s</span></div>
          <div><span className="kpi-label">Pit stops</span><span className="kpi mono">{s.pitStops}</span><span className="muted small">top speed {fmtNum(s.topSpeed)} km/h</span></div>
        </div>
      )}
      <div className="two-col numbers-grid">
        <figure className="chart">
          <h3 className="h-small">Racing lap times</h3>
          <div className="histogram" role="img" aria-label="Histogram of racing lap times">
            {buckets.map((b) => (
              <div key={b._id} className="histo-col" title={`${fmtLap(b._id)} to ${fmtLap(b._id + 0.5)}: ${b.laps} laps`}>
                <span className="histo-bar" style={{ height: `${(b.laps / maxBucket) * 100}%` }} />
                <span className="histo-label mono">{fmtLap(b._id).replace(/\.\d+$/, (m) => m.slice(0, 2))}</span>
              </div>
            ))}
          </div>
          <figcaption className="muted small">Half-second buckets, pit laps and lap 1 left out. {slower ? `${slower} slower laps (safety car, traffic) not shown.` : ''}</figcaption>
        </figure>
        <div>
          <h3 className="h-small">Laps per tyre</h3>
          <div className="compound-split" aria-label="Laps per tyre compound">
            {data.compounds.map((c) => (
              <span key={c._id} style={{ flexGrow: c.laps, background: compoundColor(c._id) }} title={`${compoundLabel(c._id)}: ${c.laps} laps`} />
            ))}
          </div>
          <table className="data-table compact">
            <thead><tr><th>Tyre</th><th className="num">Laps</th><th className="num">Share</th><th className="num">Average lap</th></tr></thead>
            <tbody>
              {data.compounds.map((c) => (
                <tr key={c._id}>
                  <td><span className="tyre" style={{ '--tyre': compoundColor(c._id) }}>{compoundLabel(c._id)}</span></td>
                  <td className="num mono">{c.laps}</td>
                  <td className="num mono">{Math.round((c.laps / totalCompound) * 100)}%</td>
                  <td className="num mono">{fmtLap(c.avgLapTime)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <FeatureLabel name="$facet + $bucket: histogram, tyre split and stats in one query" />
      <Query text={data.query} explain={data.explain} />
    </div>
  );
}

// ---------------------------------------------------------- Gap to leader ($setWindowFields)

const GW = 1000, GH = 340, GP = { l: 52, r: 56, t: 12, b: 28 };

export function GapChart({ race }) {
  const { driverById, dashed } = useSeason();
  const { data, error } = useApi(`/api/races/${race.round}/gaps`);
  const notes = useRaceNotes(race.round);
  const [focus, setFocus] = useState(null);
  const model = useMemo(() => {
    if (!data) return null;
    const order = new Map(race.results.map((r, i) => [r.driverId, i]));
    // Top ten finishers keep the chart readable.
    const series = data.results.filter((s) => (order.get(s.driverId) ?? 99) < 10).sort((a, b) => order.get(a.driverId) - order.get(b.driverId));
    const maxLap = Math.max(1, ...series.flatMap((s) => s.gaps.map((g) => g.lap)));
    const all = series.flatMap((s) => s.gaps.map((g) => g.gap)).sort((a, b) => a - b);
    const maxGap = Math.max(5, all[Math.floor(all.length * 0.97)] || 5);
    const x = (lap) => GP.l + ((lap - 1) / Math.max(1, maxLap - 1)) * (GW - GP.l - GP.r);
    const y = (gap) => GP.t + (Math.min(gap, maxGap) / maxGap) * (GH - GP.t - GP.b);
    return { series, maxLap, maxGap, x, y };
  }, [data, race]);
  if (error) return <p className="msg msg-err">{error.message}</p>;
  if (!model) return <div className="skeleton" style={{ height: GH }} />;
  const { series, maxLap, maxGap, x, y } = model;
  const ticks = [0, maxGap / 2, maxGap].map((t) => Math.round(t));
  return (
    <figure className="chart">
      <div className="chart-wrap">
        <svg viewBox={`0 0 ${GW} ${GH}`} role="img" aria-label="Gap to the leader, lap by lap">
          {ticks.map((t) => (
            <g key={t} className="grid">
              <line x1={GP.l} x2={GW - GP.r} y1={y(t)} y2={y(t)} />
              <text x={GP.l - 8} y={y(t) + 4} textAnchor="end">{t === 0 ? 'Leader' : `+${t}s`}</text>
            </g>
          ))}
          <text className="axis" x={x(1)} y={GH - 6}>Lap 1</text>
          <text className="axis" x={x(maxLap)} y={GH - 6} textAnchor="end">Lap {maxLap}</text>
          {(notes.data?.results || []).filter((n) => n.pinned && n.lapNumber && n.lapNumber <= maxLap).map((n) => (
            <a key={n._id} href="#notes" className="note-pin">
              <line x1={x(n.lapNumber)} x2={x(n.lapNumber)} y1={GP.t} y2={GH - GP.b} />
              <circle cx={x(n.lapNumber)} cy={GP.t + 6} r="6" />
              <title>{`Lap ${n.lapNumber} (user note) ${n.author}: ${n.text}`}</title>
            </a>
          ))}
          {series.map((s) => {
            const d = driverById.get(s.driverId);
            const path = s.gaps.map((g, i) => `${i ? 'L' : 'M'}${x(g.lap).toFixed(1)},${y(g.gap).toFixed(1)}`).join('');
            const last = s.gaps[s.gaps.length - 1];
            const dim = focus && focus !== s.driverId;
            return (
              <g key={s.driverId} opacity={dim ? 0.15 : 1} onMouseEnter={() => setFocus(s.driverId)} onMouseLeave={() => setFocus(null)}>
                <path d={path} fill="none" stroke={d?.teamColor || '#888'} strokeWidth={focus === s.driverId ? 3 : 1.8} strokeDasharray={dashed.has(s.driverId) ? '6 4' : undefined} />
                {last && <text x={x(last.lap) + 6} y={y(last.gap) + 4} className="axis">{d?.code}</text>}
                <title>{`${d?.name}: +${last?.gap}s at the flag`}</title>
              </g>
            );
          })}
        </svg>
      </div>
      <figcaption className="muted small">Top ten finishers. Each line is that driver's running race time minus the leader's at the end of every lap. Hover a line to pick it out.</figcaption>
      <FeatureLabel name="Window functions: $setWindowFields running total + $min per lap" />
      <Query text={data.query} explain={data.explain} />
    </figure>
  );
}

// ---------------------------------------------------------- Tyre strategy

export function TyreStrategy({ race }) {
  const { driverById } = useSeason();
  const { data, error } = useApi(`/api/races/${race.round}/stints`);
  if (error) return <p className="msg msg-err">{error.message}</p>;
  if (!data) return <div className="skeleton" style={{ height: 420 }} />;
  const order = new Map(race.results.map((r, i) => [r.driverId, i]));
  const rows = [...data.results].sort((a, b) => (order.get(a.driverId) ?? 99) - (order.get(b.driverId) ?? 99));
  const maxLap = race.laps || Math.max(...rows.flatMap((r) => r.stints.map((s) => s.to)));
  const used = [...new Set(rows.flatMap((r) => r.stints.map((s) => s.compound)))];
  return (
    <div>
      <div className="stints" role="table" aria-label="Tyre strategy">
        {rows.map((r) => (
          <div key={r.driverId} className="stint-row" role="row">
            <span role="cell"><DriverName driver={driverById.get(r.driverId)} short /></span>
            <span role="cell" className="stint-track">
              {r.stints.map((s) => (
                <span
                  key={s.stint}
                  className="stint"
                  style={{ left: `${((s.from - 1) / maxLap) * 100}%`, width: `${((s.to - s.from + 1) / maxLap) * 100}%`, background: compoundColor(s.compound) }}
                  title={`${compoundLabel(s.compound)}: laps ${s.from}–${s.to}`}
                >
                  <span className="mono">{s.to - s.from + 1}</span>
                </span>
              ))}
            </span>
          </div>
        ))}
      </div>
      <p className="legend small">
        {used.map((c) => <span key={c}><span className="sw-dot" style={{ background: compoundColor(c) }} />{compoundLabel(c)}</span>)}
        <span className="muted">Numbers are laps on that set.</span>
      </p>
      <FeatureLabel name="Tyre strategy chart" type="user" />
      <Query text={data.query} explain={data.explain} />
    </div>
  );
}

// ---------------------------------------------------------- Pit stops

export function PitStops({ round }) {
  const { driverById } = useSeason();
  const { data, error } = useApi(`/api/races/${round}/pitstops`);
  if (error) return <p className="msg msg-err">{error.message}</p>;
  if (!data) return <div className="skeleton" style={{ height: 320 }} />;
  return (
    <div>
      <div className="table-wrap">
        <table className="data-table compact">
          <thead><tr><th>Driver</th><th className="num">Stops</th><th>Pit laps</th><th className="num">Time lost</th></tr></thead>
          <tbody>
            {data.results.map((r) => (
              <tr key={r.driverId}>
                <td><DriverName driver={driverById.get(r.driverId)} short /></td>
                <td className="num mono">{r.stops}</td>
                <td className="mono small">{r.pitLaps.join(', ')}</td>
                <td className="num mono">{fmtNum(r.timeLost, 1)} s</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">Time lost is the in-lap plus out-lap, minus two of that driver's average racing laps.</p>
      <FeatureLabel name="Pit stop analysis" type="user" />
      <Query text={data.query} explain={data.explain} />
    </div>
  );
}

// ---------------------------------------------------------- Biggest movers

export function Movers({ round, limit = 5, title }) {
  const { driverById } = useSeason();
  const { data, error } = useApi(round ? `/api/movers?round=${round}` : '/api/movers');
  if (error) return <p className="msg msg-err">{error.message}</p>;
  if (!data) return <div className="skeleton" style={{ height: 240 }} />;
  const gainers = data.results.filter((r) => r.gained > 0).slice(0, limit);
  const losers = data.results.filter((r) => r.gained < 0).slice(-limit).reverse();
  const row = (r) => (
    <li key={r.driverId}>
      <DriverName driver={driverById.get(r.driverId)} short sub={round ? undefined : `${r.races} races`} />
      <span className={`delta mono ${r.gained > 0 ? 'up' : 'down'}`}>{r.gained > 0 ? '▲' : '▼'}{Math.abs(r.gained)}</span>
    </li>
  );
  return (
    <div className="movers">
      {title && <h3 className="h-small">{title}</h3>}
      <div className="two-col">
        <div><p className="kpi-label">Places gained</p><ol className="movers-list">{gainers.map(row)}</ol>{!gainers.length && <p className="muted small">Nobody gained places.</p>}</div>
        <div><p className="kpi-label">Places lost</p><ol className="movers-list">{losers.map(row)}</ol>{!losers.length && <p className="muted small">Nobody lost places.</p>}</div>
      </div>
      <p className="muted small">Grid position minus finishing position{round ? '' : ', added up over every race'}. Retirements and pit-lane starts are left out.</p>
      <FeatureLabel name={round ? 'Biggest movers' : 'Biggest movers (season)'} type="user" />
      <Query text={data.query} explain={data.explain} />
    </div>
  );
}
