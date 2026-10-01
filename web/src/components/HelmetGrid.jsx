import { useSeason } from '../lib/season.jsx';
import { Link } from '../lib/router.jsx';
import Helmet from './Helmet.jsx';

// The 2025 grid as a wall of helmets, in championship order.
export default function HelmetGrid({ num }) {
  const { standings, driverById } = useSeason();
  return (
    <section className="section container" id="grid">
      <div className="section-head row">
        <div>
          <p className="eyebrow">{num && <span className="num">{num}</span>}The grid</p>
          <h2 className="display-lg">Twenty-one lids</h2>
        </div>
        <p className="lede">Every driver who raced in 2025, in championship order. Pick a helmet for that driver's season.</p>
      </div>
      <ol className="helmet-grid">
        {standings.map((s, i) => {
          const d = driverById.get(s.driverId);
          if (!d) return null;
          return (
            <li key={s.driverId}>
              <Link to={`/driver/${d.key}`} className="helmet-card" style={{ '--team': d.teamColor }}>
                <span className="helmet-pos mono">{String(i + 1).padStart(2, '0')}</span>
                <Helmet driver={d} className="helmet-card-svg" />
                <span className="helmet-name">{d.firstName} <strong>{d.lastName}</strong></span>
                <span className="helmet-meta mono">{d.code} · {s.points} pts</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
