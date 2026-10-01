import { useEffect, useState } from 'react';
import { Link, useRouter } from '../lib/router.jsx';
import { useSeason } from '../lib/season.jsx';

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
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(scrollY > 24);
    onScroll();
    addEventListener('scroll', onScroll, { passive: true });
    return () => removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => setMenu(false), [path]);

  return (
    <header className={`nav ${scrolled || path !== '/' ? 'nav-solid' : ''} ${menu ? 'nav-open' : ''}`}>
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
          <button type="button" className="menu-btn" aria-expanded={menu} aria-label="Menu" onClick={() => setMenu((m) => !m)}>
            <span /><span />
          </button>
        </div>
      </div>
    </header>
  );
}
