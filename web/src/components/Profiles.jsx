import { useApi } from '../lib/useApi.js';
import { useSeason } from '../lib/season.jsx';
import { Link } from '../lib/router.jsx';
import { fmtDate, ordinal } from '../lib/format.js';
import DriverName from './DriverName.jsx';
import Query from './Query.jsx';
import FeatureLabel from './FeatureLabel.jsx';

const SPECIAL = { mclaren: 'McLaren', bar: 'BAR', rb: 'RB', mf1: 'MF1', alphatauri: 'AlphaTauri', 'lotus-f1': 'Lotus', 'bmw-sauber': 'BMW Sauber', 'carlos-sainz-jr': 'Carlos Sainz' };
export const constructorName = (id) => SPECIAL[id] || id.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
const age = (iso) => Math.floor((new Date('2025-12-07') - new Date(iso)) / (365.25 * 864e5));

function SeasonBars({ seasons, label }) {
  // Non-numeric positions (McLaren's 2007 "EX" exclusion) get a stub bar instead of breaking the scale.
  const pos = (s) => (Number.isFinite(s.position) ? s.position : null);
  const worst = Math.max(10, ...seasons.map((s) => pos(s) || 0));
  return (
    <div className="career-bars" role="list" aria-label={label}>
      {seasons.map((s) => (
        <div key={s.year} className={`career-col ${s.position === 1 ? 'champ' : ''}`} role="listitem" title={`${s.year}: ${pos(s) ? ordinal(pos(s)) : s.position === 'EX' ? 'excluded' : 'unclassified'}, ${s.points} pts${s.as || s.teams ? ` · ${(s.teams || [s.as]).map(constructorName).join(', ')}` : ''}`}>
          <span className="career-pos mono">{s.position ?? '-'}</span>
          <span className="career-fill" style={{ height: `${pos(s) ? ((worst + 1 - pos(s)) / worst) * 100 : 4}%` }} />
          <span className="career-year mono">{String(s.year).slice(2)}</span>
        </div>
      ))}
    </div>
  );
}

// Background, career and every 2025 race for one driver.
export function DriverProfile({ driver, raceRows, sprintByRound }) {
  const { raceByRound } = useSeason();
  const { data, error } = useApi(`/api/drivers/${driver.key}/profile`);
  if (error) return <p className="msg msg-err">{error.message}</p>;
  const p = data?.result.profile;
  if (!p) return <div className="skeleton" style={{ height: 320 }} />;
  const past = p.seasons.filter((s) => s.year < 2025);
  const best = past.reduce((a, s) => (s.position && (!a || s.position < a.position) ? s : a), null);
  const titles = p.seasons.filter((s) => s.position === 1).map((s) => s.year);
  return (
    <div className="profile">
      <div className="profile-grid">
        <div>
          {p.bio && <p className="lede">{p.bio}</p>}
          <dl className="facts profile-facts">
            <div><dt>Born</dt><dd>{fmtDate(p.dateOfBirth, { day: 'numeric', month: 'long', year: 'numeric' })} · {p.placeOfBirth}</dd></div>
            <div><dt>Age at the 2025 finale</dt><dd className="mono">{age(p.dateOfBirth)}</dd></div>
            <div><dt>Nationality</dt><dd>{driver.nationality}</dd></div>
            <div><dt>Formula 1 debut</dt><dd className="mono">{p.firstSeason}</dd></div>
            <div><dt>Seasons</dt><dd className="mono">{p.seasons.length}</dd></div>
            <div><dt>World titles</dt><dd className="mono">{titles.length ? `${titles.length} (${titles.join(', ')})` : '0'}</dd></div>
            {best && <div><dt>Best before 2025</dt><dd className="mono">{ordinal(best.position)} in {best.year}</dd></div>}
          </dl>
          <h3 className="h-small">Teams</h3>
          <p className="chips">{p.teams.map((t) => <span key={t} className="chip">{constructorName(t)}</span>)}</p>
        </div>
        <div>
          <h3 className="h-small">Championship position, every season</h3>
          <SeasonBars seasons={p.seasons} label="Championship position by season" />
          <p className="muted small">Taller is better. Hover a bar for the team and points.</p>
        </div>
      </div>
      <FeatureLabel name="Aggregation: $lookup from drivers into driver_profiles" />
      <Query text={data.query} explain={data.explain} />

      <h3 className="h-small profile-sub">2025, race by race</h3>
      <div className="table-wrap">
        <table className="data-table compact">
          <thead><tr><th className="num">Rd</th><th>Grand Prix</th><th className="num">Grid</th><th className="num">Finish</th><th className="num">Sprint</th><th className="num">Pts</th><th>Note</th></tr></thead>
          <tbody>
            {raceRows.map(({ round, result: r }) => {
              const sprint = sprintByRound.get(round);
              const gained = r.grid && r.position ? r.grid - r.position : null;
              return (
                <tr key={round}>
                  <td className="num mono">{round}</td>
                  <td><Link to={`/race/${round}`}>{raceByRound.get(round)?.name.replace(' Grand Prix', '')}</Link></td>
                  <td className="num mono">{r.grid || 'PL'}</td>
                  <td className="num mono strong">{r.position ?? r.positionText}{gained ? <span className={`delta ${gained > 0 ? 'up' : 'down'}`}>{gained > 0 ? '▲' : '▼'}{Math.abs(gained)}</span> : null}</td>
                  <td className="num mono">{sprint ? sprint.position ?? sprint.positionText : ''}</td>
                  <td className="num mono">{(r.points || 0) + (sprint?.points || 0) || ''}</td>
                  <td className="muted small">{r.retired || (r.position === 1 ? r.time : r.gap) || ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Factory, people and history for one team, plus its 2025 race by race.
export function TeamProfile({ team, rounds }) {
  const { driverById } = useSeason();
  const { data, error } = useApi(`/api/teams/${encodeURIComponent(team)}/profile`);
  if (error) return <p className="msg msg-err">{error.message}</p>;
  const t = data?.result;
  if (!t) return <div className="skeleton" style={{ height: 320 }} />;
  return (
    <div className="profile">
      <div className="profile-grid">
        <div>
          <p className="lede">{t.history}</p>
          <dl className="facts profile-facts">
            <div><dt>Factory</dt><dd>{t.factory}</dd></div>
            <div><dt>Founded</dt><dd>{t.founded}</dd></div>
            <div><dt>Team principal</dt><dd>{t.principal}<span className="muted small block">{t.principalNote}</span></dd></div>
            <div><dt>Constructors' titles</dt><dd className="mono">{t.titles.length ? `${t.titles.length}: ${t.titles.join(', ')}` : 'None yet'}</dd></div>
            <div><dt>2025 drivers</dt><dd>{t.lineup.map((d, i) => <span key={d.key}>{i ? ', ' : ''}<Link to={`/driver/${d.key}`}>{d.name}</Link></span>)}</dd></div>
          </dl>
          <h3 className="h-small">Famous names</h3>
          <p className="chips">{t.people.map((n) => <span key={n} className="chip">{n}</span>)}</p>
        </div>
        <div>
          <h3 className="h-small">Constructors' championship, every season</h3>
          <SeasonBars seasons={t.seasons} label="Constructors' championship position by season" />
          <p className="muted small">Includes the team's earlier names ({[...new Set(t.seasons.map((s) => s.as))].map(constructorName).join(', ')}). Taller is better.</p>
          <h3 className="h-small">Who raced here most</h3>
          <ol className="most-list">
            {t.drivers.slice(0, 10).map((d) => <li key={d.id}><span>{d.name}</span><span className="mono muted small">{d.seasons} {d.seasons === 1 ? 'season' : 'seasons'} · {d.from}{d.to !== d.from ? `-${d.to}` : ''}</span></li>)}
          </ol>
        </div>
      </div>
      <FeatureLabel name="Aggregation: team_profiles with $lookup into drivers" />
      <Query text={data.query} explain={data.explain} />

      <h3 className="h-small profile-sub">2025, race by race</h3>
      <div className="table-wrap">
        <table className="data-table compact">
          <thead><tr><th className="num">Rd</th><th>Grand Prix</th><th>Finishes</th><th className="num">Pts</th></tr></thead>
          <tbody>
            {rounds.map((r) => (
              <tr key={r.round}>
                <td className="num mono">{r.round}</td>
                <td><Link to={`/race/${r.round}`}>{r.name.replace(' Grand Prix', '')}</Link></td>
                <td>{r.entries.filter((e) => e.kind === 'race').map((e) => <span key={e.driverId} className="finish"><DriverName driver={driverById.get(e.driverId)} short link={false} /> <span className="mono">{e.position ? `P${e.position}` : e.positionText}</span></span>)}</td>
                <td className="num mono strong">{r.points || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">Career and history facts: {t.source}.</p>
    </div>
  );
}
