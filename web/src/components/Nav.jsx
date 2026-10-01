import { useEffect, useState } from 'react';
import { Link, useRouter } from '../lib/router.jsx';
import { useSeason } from '../lib/season.jsx';
import Account from './Account.jsx';

const LINKS = [
  { to: '/', label: 'Season', match: (p) => p === '/' },
  { to: '/#calendar', label: 'Races', match: (p) => p.startsWith('/race') },
  { to: '/#standings', label: 'Drivers', match: (p) => p.startsWith('/driver') },
  { to: '/compare', label: 'Head to head', match: (p) => p.startsWith('/compare') },
  { to: '/lab', label: 'Data lab', match: (p) => p.startsWith('/lab') },
];

export default function Nav({ onSearch }) {
  const { path } = useRouter();
  const { health, healthError } = useSeason();
  const [scrolled, setScrolled] = useState(false);
  const [onLight, setOnLight] = useState(false);
  const [menu, setMenu] = useState(false);

  // Dark ink whenever the bar sits over a yellow block (hero, page bands, calendar, footer).
  useEffect(() => {
    const update = () => {
      setScrolled(scrollY > 24);
      const mid = 32;
      let light = false;
      for (const el of document.querySelectorAll('.tone-light')) {
        const r = el.getBoundingClientRect();
        if (r.top <= mid && r.bottom >= mid && r.width >= innerWidth * 0.9) { light = true; break; }
      }
      setOnLight(light);
    };
    update();
    const timers = [setTimeout(update, 60), setTimeout(update, 400), setTimeout(update, 1200)];
    addEventListener('scroll', update, { passive: true });
    addEventListener('resize', update);
    return () => {
      timers.forEach(clearTimeout);
      removeEventListener('scroll', update);
      removeEventListener('resize', update);
    };
  }, [path]);
  useEffect(() => setMenu(false), [path]);

  return (
    <header className={`nav ${scrolled || path !== '/' ? 'nav-solid' : ''} ${onLight ? 'on-light' : ''} ${menu ? 'nav-open' : ''}`}>
      <div className="nav-inner">
        <Link to="/" className="brand" aria-label="Lap by Lap home">
          <svg viewBox="0 0 32 32" className="brand-mark" aria-hidden="true"><path d="M7 22 L15 10 H25 L17 22 Z" /><path d="M3 22 H10" className="brand-line" /></svg>
          <span>Lap by Lap</span>
        </Link>
        <nav className="nav-links" aria-label="Main">
          {LINKS.map((l) => (
            <Link key={l.to} to={l.to} className={l.match(path) ? 'active' : ''}>{l.label}</Link>
          ))}
        </nav>
        <div className="nav-tools">
          <button type="button" className="search-trigger" onClick={onSearch}>
            <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="9" cy="9" r="6" /><path d="M14 14 L18 18" /></svg>
            <span>Search circuits</span>
            <kbd>/</kbd>
          </button>
          <span
            className={`db-dot ${healthError ? 'bad' : health ? 'ok' : ''}`}
            title={healthError ? 'MongoDB unreachable' : health ? `MongoDB connected · ${health.db} · ${health.counts.laps.toLocaleString('en-GB')} laps` : 'Connecting to MongoDB'}
          />
          <Account />
          <button type="button" className="menu-btn" aria-expanded={menu} aria-label="Menu" onClick={() => setMenu((m) => !m)}>
            <span /><span />
          </button>
        </div>
      </div>
    </header>
  );
}
