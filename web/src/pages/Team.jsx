import { useMemo } from 'react';
import { useSeason } from '../lib/season.jsx';
import { useApi } from '../lib/useApi.js';
import { Link } from '../lib/router.jsx';
import { ordinal } from '../lib/format.js';
import { teamInfo, teamKey, teamPath } from '../lib/teams.js';
import Band from '../components/Band.jsx';
import CarShowcase from '../components/CarShowcase.jsx';
import ScrollWords from '../components/ScrollWords.jsx';
import Query from '../components/Query.jsx';
import { TyreDegradation } from '../components/DriverTeamStats.jsx';
import { TeammateBattle } from '../components/Community.jsx';
import { TeamProfile } from '../components/Profiles.jsx';

export default function Team({ teamKey: key }) {
  const { driverById, standings, ready } = useSeason();
  const constructors = useApi('/api/season/constructors');
  const list = constructors.data?.results || [];
  const idx = list.findIndex((t) => teamKey(t._id) === key);
  const team = list[idx];
  const season = useApi(team ? `/api/teams/${encodeURIComponent(team._id)}/season` : null);

  const rounds = season.data?.results || [];
  const summary = useMemo(() => {
    const perDriver = new Map();
    let podiums = 0, best = null;
    for (const r of rounds) {
      for (const e of r.entries) {
        const d = perDriver.get(e.driverId) || { driverId: e.driverId, points: 0, starts: 0, best: null };
        d.points += e.points || 0;
        if (e.kind === 'race') {
          d.starts += 1;
          if (e.position && (!d.best || e.position < d.best)) d.best = e.position;
          if (e.position && e.position <= 3) podiums += 1;
          if (e.position && (!best || e.position < best)) best = e.position;
        }
        perDriver.set(e.driverId, d);
      }
    }
    return { drivers: [...perDriver.values()].sort((a, b) => b.points - a.points), podiums, best };
  }, [rounds]);

  if (!ready || !constructors.data) return <div className="page" />;
  if (!team) return <section className="page container"><h1 className="display-md">Team not found</h1></section>;

  const lead = summary.drivers.map((d) => driverById.get(d.driverId)).find(Boolean);
  const color = lead?.teamColor || standings.find((s) => s.team === team._id)?.teamColor || '#888888';
  const info = teamInfo(team._id, color);
  const words = team._id.split(' ');
  const maxPts = Math.max(1, ...rounds.map((r) => r.points));

  return (
    <article className="page band-page team-page" style={{ '--team': color }}>
      <Band className="team-band">
        <p className="band-meta"><span>{ordinal(idx + 1)} in the 2025 constructors' championship</span>{info.base && <span>{info.base}</span>}{info.engine && <span>{info.engine} power</span>}</p>
        <h1 className="display-xl team-title">
          {words.length > 1 ? <><span className="driver-first">{words.slice(0, -1).join(' ')}</span><br />{words.at(-1)}</> : team._id}
        </h1>
        <dl className="driver-stats team-stats">
          <div><dt>Championship</dt><dd className="display-md">{ordinal(idx + 1)}</dd></div>
          <div><dt>Points</dt><dd className="display-md mono">{team.points}</dd></div>
          <div><dt>Wins</dt><dd className="display-md mono">{team.wins}</dd></div>
          <div><dt>Podiums</dt><dd className="display-md mono">{season.data ? summary.podiums : '-'}</dd></div>
          <div><dt>Best finish</dt><dd className="display-md mono">{summary.best ? `P${summary.best}` : '-'}</dd></div>
        </dl>
        <CarShowcase teamKey={key} name={team._id} info={info} />
        <span className="band-team" aria-hidden="true" />
      </Band>

      {season.data && (
        <section className="container section-tight">
          <ScrollWords text={`${team._id} finished ${ordinal(idx + 1)} in the 2025 constructors' championship with ${team.points} points, ${team.wins} ${team.wins === 1 ? 'win' : 'wins'} and ${summary.podiums} ${summary.podiums === 1 ? 'podium' : 'podiums'}, from ${summary.drivers.length} ${summary.drivers.length === 1 ? 'driver' : 'drivers'}.`} />
        </section>
      )}

      <section className="container section">
        <div className="section-head">
          <h2 className="display-lg">Who drove for {team._id}</h2>
        </div>
        <div className="team-drivers">
          {summary.drivers.map((d) => {
            const drv = driverById.get(d.driverId);
            if (!drv) return null;
            return (
              <Link key={d.driverId} to={`/driver/${drv.key}`} className="team-driver" style={{ '--team': drv.teamColor }}>
                <span className="team-driver-name">{drv.firstName}<br /><strong>{drv.lastName}</strong></span>
                <span className="team-driver-stats mono">{d.points} pts, {d.starts} {d.starts === 1 ? 'start' : 'starts'}{d.best ? `, best P${d.best}` : ''}</span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="container section">
        <div className="section-head">
          <h2 className="display-lg">Factory, people and history</h2>
        </div>
        <TeamProfile team={team._id} rounds={rounds} />
      </section>

      <section className="container section">
        <div className="section-head">
          <h2 className="display-lg">Points per weekend</h2>
          <p className="lede">Both cars' race and sprint points, added up per round inside MongoDB.</p>
        </div>
        <div className="team-bars" role="list">
          {rounds.map((r) => (
            <Link key={r.round} to={`/race/${r.round}`} className={`team-bar-col ${r.points === maxPts ? 'is-max' : ''}`} role="listitem" title={`${r.name}: ${r.points} points`}>
              <span className="team-bar-value mono">{r.points}</span>
              <span className="team-bar-fill" style={{ height: `${(r.points / maxPts) * 100}%` }} />
              <span className="team-bar-round mono">R{r.round}</span>
            </Link>
          ))}
        </div>
        <Query text={season.data?.query} explain={season.data?.explain} label="This team's season (aggregation on races)" />
      </section>

      <section className="container section">
        <div className="section-head">
          <h2 className="display-lg">Who won the garage</h2>
          <p className="lede">The whole season between the team's own drivers: who finished ahead, and the median gap in racing pace.</p>
        </div>
        <TeammateBattle team={team._id} />
      </section>

      <section className="container section">
        <div className="section-head">
          <h2 className="display-lg">Pace as the tyres age</h2>
        </div>
        <TyreDegradation team={team._id} color={color} />
      </section>

      <nav className="container section team-nav" aria-label="Other teams">
        <h2 className="h-small">The other teams</h2>
        <ol className="team-list">
          {list.map((t, i) => (
            <li key={t._id}>
              <Link to={teamPath(t._id)} className={t._id === team._id ? 'active' : ''}>
                <span className="mono">{String(i + 1).padStart(2, '0')}</span>
                <span>{t._id}</span>
                <span className="mono">{t.points}</span>
              </Link>
            </li>
          ))}
        </ol>
      </nav>
    </article>
  );
}
