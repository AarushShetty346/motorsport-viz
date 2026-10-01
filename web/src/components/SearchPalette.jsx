import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { api } from '../lib/api.js';
import { useSeason } from '../lib/season.jsx';
import { useRouter } from '../lib/router.jsx';
import { fmtLap, fmtNum } from '../lib/format.js';
import { EASE_OUT } from '../lib/motion.js';
import Flag from './Flag.jsx';
import Query from './Query.jsx';

// Search: MongoDB full-text search ($text on the laps text index) finds
// Grands Prix by circuit, race or country; drivers are matched by name in the page.
export default function SearchPalette({ open, onClose }) {
  const { drivers, raceByRound } = useSeason();
  const { navigate } = useRouter();
  const [q, setQ] = useState('');
  const [res, setRes] = useState({ results: [], query: '', error: null, loading: false });
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setQ('');
      setActive(0);
      setRes({ results: [], query: '', error: null, loading: false });
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  useEffect(() => {
    const term = q.trim();
    if (!term) return setRes({ results: [], query: '', error: null, loading: false });
    setRes((r) => ({ ...r, loading: true }));
    const t = setTimeout(() => {
      api(`/api/user/search?q=${encodeURIComponent(term)}`).then(
        (d) => setRes({ results: d.results, query: d.query, error: null, loading: false }),
        (e) => setRes({ results: [], query: '', error: e, loading: false })
      );
    }, 160);
    return () => clearTimeout(t);
  }, [q]);

  const driverHits = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (term.length < 2) return [];
    return drivers.filter((d) => `${d.name} ${d.code} ${d.team}`.toLowerCase().includes(term)).slice(0, 4);
  }, [q, drivers]);

  const items = [
    ...res.results.map((r) => ({ type: 'race', to: `/race/${r.round}`, r })),
    ...driverHits.map((d) => ({ type: 'driver', to: `/driver/${d.key}`, d })),
  ];

  const go = (item) => {
    onClose();
    navigate(item.to);
  };

  const onKey = (e) => {
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(items.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter' && items[active]) go(items[active]);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="palette-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.12 } }} onMouseDown={onClose}>
          <motion.div
            className="palette"
            role="dialog"
            aria-label="Search"
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.2, ease: EASE_OUT } }}
            exit={{ opacity: 0, y: -4, transition: { duration: 0.1 } }}
            onMouseDown={(e) => e.stopPropagation()}
            data-lenis-prevent
          >
            <div className="palette-input">
              <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="9" cy="9" r="6" /><path d="M14 14 L18 18" /></svg>
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => { setQ(e.target.value); setActive(0); }}
                onKeyDown={onKey}
                placeholder="Try Monza, Silverstone, Italy, street… or a driver"
                aria-label="Search circuits, races, countries or drivers"
              />
              <kbd>esc</kbd>
            </div>
            <div className="palette-body">
              {!q.trim() && (
                <div className="palette-hint">
                  <p>Full-text search over every lap in the season, using MongoDB's <code>$text</code> index on race, circuit and country.</p>
                  <div className="chips">
                    {['monza', 'silverstone', 'italy', 'spa', 'united states', 'marina bay'].map((s) => (
                      <button key={s} type="button" className="chip" onClick={() => setQ(s)}>{s}</button>
                    ))}
                  </div>
                </div>
              )}
              {res.error && <p className="msg msg-err">{res.error.message}</p>}
              {q.trim() && !res.loading && !items.length && !res.error && <p className="palette-empty">No race, circuit or driver matches “{q}”.</p>}
              {!!res.results.length && <p className="palette-group">Grands Prix · $text matches</p>}
              <ul className="palette-list">
                {items.map((item, i) => (
                  <li key={item.to}>
                    <button type="button" className={`palette-item ${i === active ? 'active' : ''}`} onMouseEnter={() => setActive(i)} onClick={() => go(item)}>
                      {item.type === 'race' ? (
                        <>
                          <Flag code={raceByRound.get(item.r.round)?.countryCode} />
                          <span className="pi-main">
                            <strong>{item.r.race}</strong>
                            <span className="muted">{item.r.circuit} · {item.r.country} · Round {item.r.round}</span>
                          </span>
                          <span className="pi-meta mono">
                            {fmtNum(item.r.laps)} laps<br />
                            <span className="muted">best {fmtLap(item.r.fastestLap)} · score {item.r.score}</span>
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="team-bar" style={{ background: item.d.teamColor }} />
                          <span className="pi-main"><strong>{item.d.name}</strong><span className="muted">{item.d.team}</span></span>
                          <span className="pi-meta mono">#{item.d.number}</span>
                        </>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            {res.query && <div className="palette-foot"><Query text={res.query} /></div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
