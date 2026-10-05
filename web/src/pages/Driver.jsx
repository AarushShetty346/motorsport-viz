import { useEffect, useMemo, useState } from 'react';
import { useSeason } from '../lib/season.jsx';
import { useApi } from '../lib/useApi.js';
import { Link } from '../lib/router.jsx';
import { fmtLap, fmtNum, ordinal, COMPOUND } from '../lib/format.js';
import LapChart from '../components/LapChart.jsx';
import Flag from '../components/Flag.jsx';
import Query from '../components/Query.jsx';
import Band from '../components/Band.jsx';
import DriverPortrait from '../components/DriverPortrait.jsx';
import ScrollWords from '../components/ScrollWords.jsx';
import { useDriverPhotos } from '../lib/photos.js';
import { teamPath } from '../lib/teams.js';
import { lapTags, lapRowClass } from '../lib/steward.js';

export default function Driver({ driverKey }) {
  const { driverByKey, standings, raceByRound, races, ready } = useSeason();
  const driver = driverByKey.get(driverKey);
  const season = useApi(driver ? `/api/drivers/${driver._id}/season` : null);
  const [round, setRound] = useState(null);
  const photos = useDriverPhotos();
  const laps = useApi(driver && round ? `/api/user/driver-laps/${driver._id}?round=${round}` : null);

  const raceRows = useMemo(() => (season.data?.results || []).filter((r) => r.kind === 'race'), [season.data]);
  const sprintByRound = useMemo(() => new Map((season.data?.results || []).filter((r) => r.kind === 'sprint').map((r) => [r.round, r.result])), [season.data]);
  useEffect(() => {
    if (raceRows.length && !round) setRound(raceRows[raceRows.length - 1].round);
  }, [raceRows, round]);

  if (!ready) return <div className="page" />;
  if (!driver) return <section className="page container"><h1 className="display-md">Driver not found</h1></section>;
  const idx = standings.findIndex((s) => s.driverId === driver._id);
  const st = standings[idx];
  const lapRows = laps.data?.results || [];
  const best = lapRows.filter((l) => !l.deleted && l.source !== 'steward').reduce((a, b) => (!a || b.lapTime < a.lapTime ? b : a), null);
  const race = raceByRound.get(round);

  return (
    <article className="page band-page driver-page" style={{ '--team': driver.teamColor }}>
      <Band className="driver-band">
        <span className="driver-number" aria-hidden="true">{driver.number}</span>
        <div className="driver-hero">
        <div className="driver-hero-copy">
          <p className="band-meta"><Flag code={driver.countryCode} /> {driver.nationality} · <Link to={teamPath(driver.team)} className="band-link">{driver.team}</Link> · No. {driver.number}</p>
          <h1 className="display-xl"><span className="driver-first">{driver.firstName}</span><br />{driver.lastName}</h1>
          <div className="driver-actions">
            <Link to={`/compare?a=${driver.key}`} className="btn btn-primary">Compare with…</Link>
          </div>
        {st && (
          <dl className="driver-stats">
            <div><dt>Championship</dt><dd className="display-md">{ordinal(idx + 1)}</dd></div>
            <div><dt>Points</dt><dd className="display-md mono">{st.points}</dd></div>
            <div><dt>Wins</dt><dd className="display-md mono">{st.wins}</dd></div>
            <div><dt>Podiums</dt><dd className="display-md mono">{st.podiums}</dd></div>
            <div><dt>Average finish</dt><dd className="display-md mono">{st.avgFinish ?? '—'}</dd></div>
          </dl>
        )}
        </div>
        <DriverPortrait driver={driver} photo={photos[driver.key]} />
        </div>
        <span className="band-team" aria-hidden="true" />
      </Band>

      {st && (
        <section className="container section-tight">
          <ScrollWords text={`${driver.firstName} ${driver.lastName} finished ${ordinal(idx + 1)} in 2025 for ${driver.team}, with ${st.points} points, ${st.wins} ${st.wins === 1 ? 'win' : 'wins'} and ${st.podiums} ${st.podiums === 1 ? 'podium' : 'podiums'} from ${st.starts} starts.`} />
        </section>
      )}

      <section className="container section-tight">
        <h2 className="h-small">Season at a glance</h2>
        <div className="season-strip" role="list">
          {races.map((r) => {
            const row = raceRows.find((x) => x.round === r.round);
            const res = row?.result;
            const pos = res?.position;
            const cls = !row ? 'none' : !pos ? 'dnf' : pos === 1 ? 'win' : pos <= 3 ? 'podium' : pos <= 10 ? 'points' : 'out';
            const sprint = sprintByRound.get(r.round);
            return (
              <button
                key={r.round}
                type="button"
                role="listitem"
                disabled={!row}
                className={`strip-cell ${cls} ${round === r.round ? 'selected' : ''}`}
                onClick={() => setRound(r.round)}
                title={`${r.name}: ${row ? (pos ? `P${pos}` : res.positionText) : 'did not take part'}${sprint ? ` · Sprint P${sprint.position ?? sprint.positionText}` : ''}`}
              >
                <span className="strip-round mono">{r.abbreviation}</span>
                <span className="strip-pos mono">{row ? (pos ? pos : res.positionText) : '·'}</span>
                {sprint && <span className="strip-sprint" aria-label="Sprint weekend" />}
              </button>
            );
          })}
        </div>
        <p className="legend small">
          <span><span className="sw-cell win" />Win</span><span><span className="sw-cell podium" />Podium</span>
          <span><span className="sw-cell points" />Points</span><span><span className="sw-cell out" />No points</span>
          <span><span className="sw-cell dnf" />Did not finish</span><span><span className="strip-sprint inline" />Sprint weekend</span>
        </p>
        <Query text={season.data?.query} label="This driver's results (aggregation on races)" />
      </section>

      <section className="container section">
        <div className="section-head row">
          <div>
            <p className="eyebrow"><span className="num">01</span>Lap explorer</p>
            <h2 className="display-md">{race ? race.name : 'Pick a race'}</h2>
          </div>
          <label className="select">
            <span className="sr-only">Race</span>
            <select value={round || ''} onChange={(e) => setRound(Number(e.target.value))}>
              {raceRows.map((r) => <option key={r.round} value={r.round}>R{r.round} · {r.name}</option>)}
            </select>
          </label>
        </div>
        {laps.error && <p className="msg msg-err">{laps.error.message}</p>}
        {laps.data && (
          <>
            <div className="kpis">
              <div><span className="kpi-label">Laps</span><span className="kpi mono">{lapRows.length}</span></div>
              <div><span className="kpi-label">Personal best</span><span className="kpi mono">{best ? fmtLap(best.lapTime) : '—'}</span><span className="muted small">{best ? `lap ${best.lapNumber}` : ''}</span></div>
              <div><span className="kpi-label">Top speed</span><span className="kpi mono">{fmtNum(Math.max(0, ...lapRows.map((l) => l.telemetry.speed)), 1)}</span><span className="muted small">km/h</span></div>
              <div><span className="kpi-label">Pit stops</span><span className="kpi mono">{lapRows.filter((l) => l.pitIn).length}</span></div>
            </div>
            <LapChart laps={lapRows} />
            <details className="lap-table-toggle">
              <summary>All {lapRows.length} laps with telemetry</summary>
              <div className="table-wrap" data-lenis-prevent>
                <table className="data-table">
                  <thead><tr><th className="num">Lap</th><th className="num">Pos</th><th className="num">Time</th><th>Tyre</th><th className="num">Top speed</th><th className="num">Peak RPM</th><th>Throttle</th><th>Braking</th><th>DRS</th></tr></thead>
                  <tbody>
                    {lapRows.map((l) => (
                      <tr key={l._id} className={`${best && l._id === best._id ? 'best' : ''} ${lapRowClass(l)}`}>
                        <td className="num mono">{l.lapNumber}{(l.pitIn || l.pitOut) && <span className="pit-tag">PIT</span>}{lapTags(l).map((t) => <span key={t} className={`lap-tag ${t}`}>({t})</span>)}</td>
                        <td className="num mono">{l.position ?? '—'}</td>
                        <td className="num mono strong">{fmtLap(l.lapTime)}</td>
                        <td>{l.compound && <span className="tyre" style={{ '--tyre': COMPOUND[l.compound]?.color }}>{COMPOUND[l.compound]?.label}</span>}</td>
                        <td className="num mono">{fmtNum(l.telemetry.speed, 1)}</td>
                        <td className="num mono">{fmtNum(l.telemetry.rpm)}</td>
                        <td><Meter value={l.telemetry.throttle} /></td>
                        <td><Meter value={l.telemetry.brake} tone="brake" /></td>
                        <td><Meter value={l.telemetry.drs ?? 0} tone="drs" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
            <Query text={laps.data.query} explain={laps.data.explain} />
          </>
        )}
      </section>
    </article>
  );
}

function Meter({ value, tone = '' }) {
  return (
    <span className={`meter ${tone}`} title={`${fmtNum(value, 1)}%`}>
      <span className="meter-track"><span style={{ transform: `scaleX(${Math.min(100, value) / 100})` }} /></span>
      <span className="mono small">{fmtNum(value, 0)}%</span>
    </span>
  );
}
