import { useEffect, useState } from 'react';
import { Link, SEASONS, useRouter } from '../lib/router.jsx';
import { useSeason } from '../lib/season.jsx';
import Account from './Account.jsx';

const LINKS = [
  { to: '/', label: 'Season', match: (p) => p === '/' },
  { to: '/#calendar', label: 'Races', match: (p) => p.startsWith('/race') },
  { to: '/#standings', label: 'Drivers', match: (p) => p.startsWith('/driver') },
  { to: '/teams', label: 'Teams', match: (p) => p.startsWith('/team') },
  { to: '/compare', label: 'Head to head', match: (p) => p.startsWith('/compare') },
];

export default function Nav({ onSearch }) {
  const { path, season, landing } = useRouter();
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
  useEffect(() => setMenu(false), [path, season]);

  return (
    <header className={`nav ${scrolled || (path !== '/' && !landing) ? 'nav-solid' : ''} ${onLight ? 'on-light' : ''} ${menu ? 'nav-open' : ''}`}>
      <div className="nav-inner">
        <Link raw to="/" className="brand" aria-label="Lap by Lap, pick a season">
          <svg viewBox="0 0 32 32" className="brand-mark" aria-hidden="true"><path d="M7 22 L15 10 H25 L17 22 Z" /><path d="M3 22 H10" className="brand-line" /></svg>
          <span>Lap by Lap</span>
        </Link>
        <nav className="nav-links" aria-label="Main">
          {LINKS.map((l) => (
            <Link key={l.to} to={l.to} className={!landing && l.match(path) ? 'active' : ''}>{l.label}</Link>
          ))}
        </nav>
        <div className="nav-tools">
          <SeasonChip path={path} season={season} landing={landing} />
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

// The season chip: shows the year, and switches the page you're on to another season.
function SeasonChip({ path, season, landing }) {
  const { navigate } = useRouter();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!e.target.closest?.('.season-chip')) setOpen(false); };
    addEventListener('pointerdown', close);
    return () => removeEventListener('pointerdown', close);
  }, [open]);
  const go = (y) => {
    setOpen(false);
    navigate(landing ? `/${y}` : `/${y}${path === '/' ? '' : path}`, { raw: true });
  };
  return (
    <div className={`season-chip ${open ? 'is-open' : ''}`}>
      <button type="button" className="season-chip-btn mono" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {landing ? 'Season' : season}
        <svg viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1 L5 5 L9 1" /></svg>
      </button>
      {open && (
        <ul className="season-chip-menu" role="listbox" aria-label="Season">
          {SEASONS.map((y) => (
            <li key={y}>
              <button type="button" role="option" aria-selected={!landing && y === season} className={!landing && y === season ? 'active' : ''} onClick={() => go(y)}>{y}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
