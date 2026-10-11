import { useApi } from '../lib/useApi.js';
import { fmtLap, fmtNum } from '../lib/format.js';
import Query from './Query.jsx';
import FeatureLabel from './FeatureLabel.jsx';

// Average lap, fastest lap and lap count over the whole season ($group + $lookup).
export function SeasonStats({ driver }) {
  const { data, error } = useApi(`/api/drivers/${driver._id}/stats`);
  if (error) return <p className="msg msg-err">{error.message}</p>;
  const r = data?.result;
  return (
    <div>
      <div className="kpis">
        <div><span className="kpi-label">Average lap</span><span className="kpi mono">{r ? fmtLap(r.avgLapTime) : '-'}</span><span className="muted small">all circuits</span></div>
        <div><span className="kpi-label">Fastest lap</span><span className="kpi mono">{r ? fmtLap(r.fastestLap) : '-'}</span></div>
        <div><span className="kpi-label">Laps</span><span className="kpi mono">{r ? fmtNum(r.laps) : '-'}</span><span className="muted small">{r ? `${r.races} races` : ''}</span></div>
      </div>
      <FeatureLabel name="Aggregation: $group + $lookup" />
      <Query text={data?.query} explain={data?.explain} />
    </div>
  );
}

// Best sector 1 + best sector 2 + best sector 3 in one race, against the real fastest lap.
export function TheoreticalBest({ driver, round }) {
  const { data, error } = useApi(round ? `/api/drivers/${driver._id}/theoretical?round=${round}` : null);
  if (error) return <p className="msg msg-err">{error.message}</p>;
  const r = data?.result;
  if (!r || r.theoretical == null) return null;
  return (
    <div className="theoretical">
      <h3 className="h-small">Theoretical best lap</h3>
      <div className="kpis">
        <div><span className="kpi-label">Best S1</span><span className="kpi mono">{r.s1.toFixed(3)}</span></div>
        <div><span className="kpi-label">Best S2</span><span className="kpi mono">{r.s2.toFixed(3)}</span></div>
        <div><span className="kpi-label">Best S3</span><span className="kpi mono">{r.s3.toFixed(3)}</span></div>
        <div><span className="kpi-label">Theoretical</span><span className="kpi mono">{fmtLap(r.theoretical)}</span><span className="muted small">actual best {fmtLap(r.fastest)} · {r.difference.toFixed(3)} s left on the table</span></div>
      </div>
      <FeatureLabel name="Theoretical best lap" type="user" />
      <Query text={data.query} explain={data.explain} />
    </div>
  );
}

const W = 1000, H = 280, P = { l: 56, r: 16, t: 14, b: 28 };

// Lap time vs tyre age: this team against the field average.
export function TyreDegradation({ team, color }) {
  const { data, error } = useApi(`/api/teams/${encodeURIComponent(team)}/degradation`);
  if (error) return <p className="msg msg-err">{error.message}</p>;
  if (!data) return <div className="skeleton" style={{ height: H }} />;
  const rows = data.results.filter((r) => r.team != null && r.teamLaps >= 5);
  const vals = rows.flatMap((r) => [r.team, r.field]);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const maxAge = Math.max(...rows.map((r) => r.tyreAge));
  const x = (a) => P.l + ((a - 1) / Math.max(1, maxAge - 1)) * (W - P.l - P.r);
  const y = (v) => P.t + ((v - lo) / (hi - lo || 1)) * (H - P.t - P.b);
  const line = (k) => rows.map((r, i) => `${i ? 'L' : 'M'}${x(r.tyreAge).toFixed(1)},${y(r[k]).toFixed(1)}`).join('');
  return (
    <figure className="chart">
      <div className="chart-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Lap time against tyre age">
          {[lo, (lo + hi) / 2, hi].map((t) => (
            <g key={t} className="grid">
              <line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} />
              <text x={P.l - 8} y={y(t) + 4} textAnchor="end">{t.toFixed(1)}%</text>
            </g>
          ))}
          <text className="axis" x={x(1)} y={H - 6}>Lap 1 on the set</text>
          <text className="axis" x={x(maxAge)} y={H - 6} textAnchor="end">Lap {maxAge}</text>
          <path d={line('field')} fill="none" stroke="var(--muted)" strokeWidth="2" strokeDasharray="6 4" />
          <path d={line('team')} fill="none" stroke={color} strokeWidth="3" />
        </svg>
      </div>
      <figcaption className="legend small">
        <span><span className="sw-dot" style={{ background: color }} />{team}</span>
        <span><span className="sw-dot" style={{ background: 'var(--muted)' }} />Field average</span>
        <span className="muted">Each lap as a % of that race's fastest lap, so higher on the chart is quicker. Dry tyres, no pit laps or safety car laps. Fuel burning off makes cars quicker as a stint goes on, which hides some of the wear.</span>
      </figcaption>
      <FeatureLabel name="Tyre degradation" type="user" />
      <Query text={data.query} explain={data.explain} />
    </figure>
  );
}
