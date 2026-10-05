import { useSeason } from '../lib/season.jsx';
import { useApi } from '../lib/useApi.js';
import { Link } from '../lib/router.jsx';
import Flag from './Flag.jsx';
import Query from './Query.jsx';
import FeatureLabel from './FeatureLabel.jsx';
import { teamPath } from '../lib/teams.js';

export default function Standings() {
  const { standings, standingsQuery, driverById } = useSeason();
  const constructors = useApi('/api/season/constructors');
  const leader = standings[0]?.points || 1;
  const teamColor = (team) => standings.find((s) => s.team === team)?.teamColor;
  const cLeader = constructors.data?.results[0]?.points || 1;

  return (
    <section id="standings" className="section container">
      <div className="section-head">
        <p className="eyebrow"><span className="num">03</span>Final standings</p>
        <h2 className="display-lg">The drivers</h2>
        <p className="lede">Points, wins and podiums are added up inside MongoDB from each race's embedded classification, sprints included.</p>
      </div>
      <div className="standings-grid">
        <ol className="standings">
          {standings.map((s, i) => {
            const d = driverById.get(s.driverId);
            return (
              <li key={s.driverId}>
                <Link to={`/driver/${s.key}`} className="standing-row">
                  <span className="pos mono">{i + 1}</span>
                  <span className="team-bar" style={{ background: s.teamColor }} />
                  <span className="st-name">
                    <span>{d?.firstName} <strong>{d?.lastName}</strong></span>
                    <span className="driver-sub"><Flag code={d?.countryCode} /> {s.team}</span>
                  </span>
                  <span className="st-meter" aria-hidden="true"><span style={{ transform: `scaleX(${s.points / leader})`, background: s.teamColor }} /></span>
                  <span className="st-stats mono">
                    <span title="Wins">{s.wins}<small>W</small></span>
                    <span title="Podiums">{s.podiums}<small>P</small></span>
                  </span>
                  <span className="st-pts mono">{s.points}</span>
                </Link>
              </li>
            );
          })}
        </ol>
        <aside className="constructors" id="teams">
          <h3 className="h-small">Constructors</h3>
          <ol>
            {constructors.data?.results.map((c, i) => (
              <li key={c._id}>
                <span className="pos mono">{i + 1}</span>
                <Link to={teamPath(c._id)} className="c-name">{c._id}</Link>
                <span className="c-bar"><span style={{ transform: `scaleX(${c.points / cLeader})`, background: teamColor(c._id) }} /></span>
                <span className="mono">{c.points}</span>
              </li>
            ))}
          </ol>
          <Query text={constructors.data?.query} label="Constructors pipeline" />
        </aside>
      </div>
      <FeatureLabel name="Aggregation: $unwind + $group + $lookup" />
      <Query text={standingsQuery} label="Standings pipeline ($unwind → $group → $lookup → $sort)" />
    </section>
  );
}
