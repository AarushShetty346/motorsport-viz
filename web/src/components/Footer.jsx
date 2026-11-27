import { HERO_PHOTO } from '../content.js';
import { useSeason } from '../lib/season.jsx';
import { Link, useRouter } from '../lib/router.jsx';

export default function Footer() {
  const { health } = useSeason();
  const { season } = useRouter();
  return (
    <footer className="footer tone-light">
      <div className="footer-inner">
        <div>
          <p className="footer-brand">Lap by Lap</p>
          <p className="muted">
            The {season} season in {health ? health.counts.laps.toLocaleString('en-GB') : 'thousands of'} laps, served from MongoDB
            (<code>{health?.db || 'motorsport'}</code> database).
          </p>
        </div>
        <div className="footer-links">
          <Link to="/#calendar">Races</Link>
          <Link to="/#standings">Drivers</Link>
          <Link to="/team/mclaren">Teams</Link>
          <Link to="/compare">Head to head</Link>
          <Link to="/privacy">Privacy</Link>
          <Link to="/credits">Credits</Link>
        </div>
        <div className="footer-credits muted">
          <p>
            Results: <a href="https://github.com/f1db/f1db">F1DB</a> (CC BY 4.0). Lap timing and telemetry:{' '}
            <a href={`https://github.com/TracingInsights/${season}`}>TracingInsights</a> (Apache-2.0), from the official live-timing feed via FastF1.
          </p>
          {HERO_PHOTO.author && (
            <p>
              Hero photo: {HERO_PHOTO.author}
              {HERO_PHOTO.license && <>, {HERO_PHOTO.license}</>}
              {HERO_PHOTO.sourceUrl && <>, via <a href={HERO_PHOTO.sourceUrl}>Wikimedia Commons</a></>}.
            </p>
          )}
          <p>3D car models: Sketchfab artists under CC BY 4.0, <Link to="/credits">credited here</Link>.</p>
          <p>Unofficial fan project. Not associated with Formula 1 or the FIA.</p>
        </div>
      </div>
      <p className="footer-word" aria-hidden="true">Lap by Lap</p>
    </footer>
  );
}
