import { useSeason } from '../lib/season.jsx';
import { useApi } from '../lib/useApi.js';
import { Link } from '../lib/router.jsx';
import { fmtDate, fmtNum } from '../lib/format.js';
import TrackMap from '../components/TrackMap.jsx';
import RaceTrace from '../components/RaceTrace.jsx';
import Leaderboard from '../components/Leaderboard.jsx';
import SpeedTrap from '../components/SpeedTrap.jsx';
import DriverName from '../components/DriverName.jsx';
import Flag from '../components/Flag.jsx';
import Query from '../components/Query.jsx';
import Band from '../components/Band.jsx';
import FeatureLabel from '../components/FeatureLabel.jsx';
import RaceLaps from '../components/RaceLaps.jsx';
import { NearbyCircuits } from '../components/CircuitMap.jsx';
import { RaceNumbers, GapChart, TyreStrategy, PitStops, Movers } from '../components/RaceAnalytics.jsx';

export default function Race({ round }) {
  const { raceByRound, driverById, ready } = useSeason();
  const laps = useApi(`/api/races/${round}/laps`);
  const race = raceByRound.get(round);
  if (!ready) return <div className="page" />;
  if (!race) return <section className="page container"><h1 className="display-md">No round {round} in 2025</h1></section>;

  const prev = raceByRound.get(round - 1);
  const next = raceByRound.get(round + 1);
  const podium = race.results.slice(0, 3);

  return (
    <article className="page band-page race-page">
      <Band className="race-band">
        <div className="race-hero">
        <div className="race-hero-copy">
          <p className="band-meta"><Flag code={race.countryCode} /> Round {race.round} of 24 · {fmtDate(race.date, { day: 'numeric', month: 'long', year: 'numeric' })}</p>
          <h1 className="display-xl race-title">{race.name.replace(' Grand Prix', '')}<br /><span className="light-text">Grand Prix</span></h1>
          <dl className="facts">
            <div><dt>Circuit</dt><dd>{race.circuitFullName}</dd></div>
            <div><dt>Laps</dt><dd className="mono">{race.laps}</dd></div>
            <div><dt>Lap length</dt><dd className="mono">{race.courseLength.toFixed(3)} km</dd></div>
            <div><dt>Corners</dt><dd className="mono">{race.turns}</dd></div>
          </dl>
        </div>
        <TrackMap race={race} variant="full" className="race-map tone-dark" />
        </div>
      </Band>

      <section className="container section-tight">
        <div className="podium">
          {[podium[1], podium[0], podium[2]].map((r) => r && (
            <div key={r.driverId} className={`podium-step p${r.position} ${r.position === 1 ? 'tone-light' : ''}`} style={{ '--team': driverById.get(r.driverId)?.teamColor }}>
              <span className="podium-pos">{r.position}</span>
              <DriverName driver={driverById.get(r.driverId)} />
              <span className="mono muted small">{r.position === 1 ? r.time : r.gap}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="container section">
        <div className="section-head">
          <p className="eyebrow"><span className="num">01</span>Race story</p>
          <h2 className="display-md">Every position change</h2>
        </div>
        {laps.data ? <RaceTrace laps={laps.data.results} results={race.results} /> : <div className="skeleton" style={{ height: 480 }} />}
        <FeatureLabel name="Indexing: { round, lapNumber } index, explain() IXSCAN vs COLLSCAN" />
        <Query text={laps.data?.query} explain={laps.data?.explain} />
      </section>

      <section className="container section">
        <div className="section-head">
          <p className="eyebrow"><span className="num">02</span>Gap to leader</p>
          <h2 className="display-md">How far behind, lap by lap</h2>
        </div>
        <GapChart race={race} />
      </section>

      <section className="container section">
        <div className="section-head">
          <p className="eyebrow"><span className="num">03</span>Race in numbers</p>
          <h2 className="display-md">{race.laps} laps, summed up</h2>
        </div>
        <RaceNumbers round={race.round} />
      </section>

      <section className="container section two-col">
        <div>
          <div className="section-head">
            <p className="eyebrow"><span className="num">04</span>Classification</p>
            <h2 className="display-md">Result</h2>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th className="num">Pos</th><th>Driver</th><th className="num">Grid</th><th className="num">Time / gap</th><th className="num">Pts</th></tr></thead>
              <tbody>
                {race.results.map((r) => {
                  const gained = r.grid && r.position ? r.grid - r.position : null;
                  return (
                    <tr key={r.driverId}>
                      <td className="num pos mono">{r.position ?? r.positionText}</td>
                      <td><DriverName driver={driverById.get(r.driverId)} sub={r.team} /></td>
                      <td className="num mono">
                        {r.grid ?? 'PL'}
                        {gained ? <span className={`delta ${gained > 0 ? 'up' : 'down'}`}>{gained > 0 ? '▲' : '▼'}{Math.abs(gained)}</span> : null}
                      </td>
                      <td className="num mono small">{r.position === 1 ? r.time : r.gap || r.retired || (r.laps ? `${r.laps} laps` : '')}{r.penaltySeconds ? <span className="pen-tag" title="Time penalty added in Steward mode (edited)">+{r.penaltySeconds}s (edited)</span> : null}</td>
                      <td className="num mono">{r.points || ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Query text={`db.races.findOne({ round: ${race.round} }).results   // classification embedded in the race document`} />
        </div>
        <div>
          <div className="section-head">
            <p className="eyebrow"><span className="num">05</span>Fastest laps</p>
            <h2 className="display-md">One lap, flat out</h2>
          </div>
          <Leaderboard round={race.round} />
          <div className="spacer" />
          <NearbyCircuits round={race.round} />
          <div className="spacer" />
          <SpeedTrap round={race.round} defaultMin={Math.round((race.track?.speed ? Math.max(...race.track.speed) : 330) + 4)} title="Speed trap" compact />
        </div>
      </section>

      <section className="container section two-col">
        <div>
          <div className="section-head">
            <p className="eyebrow"><span className="num">06</span>Tyre strategy</p>
            <h2 className="display-md">Who ran what</h2>
          </div>
          <TyreStrategy race={race} />
        </div>
        <div>
          <div className="section-head">
            <p className="eyebrow"><span className="num">07</span>Pit stops</p>
            <h2 className="display-md">Time in the pits</h2>
          </div>
          <PitStops round={race.round} />
          <div className="spacer" />
          <Movers round={race.round} title="Biggest movers" />
        </div>
      </section>

      <section className="container section" id="laps">
        <div className="section-head">
          <p className="eyebrow"><span className="num">08</span>Every lap</p>
          <h2 className="display-md">Lap by lap</h2>
        </div>
        <RaceLaps race={race} />
      </section>

      <nav className="container race-nav" aria-label="Other races">
        {prev ? <Link to={`/race/${prev.round}`} className="race-nav-link"><span className="muted small">← Round {prev.round}</span><span>{prev.name}</span></Link> : <span />}
        {next ? <Link to={`/race/${next.round}`} className="race-nav-link right"><span className="muted small">Round {next.round} →</span><span>{next.name}</span></Link> : <span />}
      </nav>
      <p className="container muted small">{fmtNum(laps.data?.results.length)} laps recorded at this race.</p>
    </article>
  );
}
