import { HERO_PHOTO } from '../content.js';
import { useSeason } from '../lib/season.jsx';
import { Link } from '../lib/router.jsx';

export default function Footer() {
  const { health } = useSeason();
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div>
          <p className="footer-brand">Lap by Lap</p>
          <p className="muted">
            The 2025 season in {health ? health.counts.laps.toLocaleString('en-GB') : 'thousands of'} laps, served from your local MongoDB
            (<code>{health?.db || 'motorsport'}</code> database). Nothing leaves this machine.
          </p>
        </div>
        <div className="footer-links">
          <Link to="/#calendar">Races</Link>
          <Link to="/#standings">Drivers</Link>
          <Link to="/compare">Head to head</Link>
          <Link to="/lab">Data lab</Link>
        </div>
        <div className="footer-credits muted">
          <p>
            Results: <a href="https://github.com/f1db/f1db">F1DB</a> (CC BY 4.0). Lap timing and telemetry:{' '}
            <a href="https://github.com/TracingInsights/2025">TracingInsights</a> (Apache-2.0), from the official live-timing feed via FastF1.
          </p>
          {HERO_PHOTO.author && (
            <p>
              Hero photo: {HERO_PHOTO.author}
              {HERO_PHOTO.license && <>, {HERO_PHOTO.license}</>}
              {HERO_PHOTO.sourceUrl && <>, via <a href={HERO_PHOTO.sourceUrl}>Wikimedia Commons</a></>}.
            </p>
          )}
          <p>Unofficial fan project. Not associated with Formula 1 or the FIA.</p>
        </div>
      </div>
    </footer>
  );
}
