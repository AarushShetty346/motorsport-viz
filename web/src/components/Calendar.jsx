import { useLayoutEffect, useRef, useState } from 'react';
import { motion, useScroll, useTransform } from 'motion/react';
import { useSeason } from '../lib/season.jsx';
import { Link } from '../lib/router.jsx';
import { fmtDate } from '../lib/format.js';
import { prefersReducedMotion } from '../lib/motion.js';
import TrackMap from './TrackMap.jsx';
import Flag from './Flag.jsx';

// The 24 rounds as a strip that slides sideways while you scroll down.
// Phones and reduced-motion get a normal horizontally scrollable row.
export default function Calendar() {
  const { races, driverById } = useSeason();
  const outer = useRef(null);
  const track = useRef(null);
  const [distance, setDistance] = useState(0);
  const [pinned, setPinned] = useState(false);

  useLayoutEffect(() => {
    const measure = () => {
      const canPin = innerWidth >= 900 && !prefersReducedMotion();
      setPinned(canPin);
      setDistance(canPin && track.current ? Math.max(0, track.current.scrollWidth - innerWidth) : 0);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (track.current) ro.observe(track.current);
    addEventListener('resize', measure);
    return () => { ro.disconnect(); removeEventListener('resize', measure); };
  }, [races.length]);

  const { scrollYProgress } = useScroll({ target: outer, offset: ['start start', 'end end'] });
  const x = useTransform(scrollYProgress, [0, 1], [0, -distance]);

  return (
    <section id="calendar" className={`calendar ${pinned ? 'is-pinned' : ''}`} ref={outer} style={pinned ? { height: `calc(100vh + ${distance}px)` } : undefined}>
      <div className="calendar-sticky">
        <div className="section-head container">
          <p className="eyebrow">Calendar</p>
          <h2 className="display-lg">24 races, five continents</h2>
          <p className="lede">Every circuit below is drawn from the car's own GPS trace on that race's fastest lap. Pick one to replay it.</p>
        </div>
        <motion.ol className="calendar-track" ref={track} style={pinned ? { x } : undefined}>
          {races.map((race) => {
            const winner = driverById.get(race.results?.[0]?.driverId);
            return (
              <li key={race.round}>
                <Link to={`/race/${race.round}`} className="race-card" style={{ '--team': winner?.teamColor }}>
                  <div className="race-card-top">
                    <span className="mono round-no">R{String(race.round).padStart(2, '0')}</span>
                    <span className="mono muted">{fmtDate(race.date)}</span>
                  </div>
                  <TrackMap race={race} width={320} height={220} className="race-card-map" />
                  <div className="race-card-body">
                    <h3><Flag code={race.countryCode} /> {race.shortName}</h3>
                    <p className="muted">{race.circuit}{race.sprint ? ' · Sprint weekend' : ''}</p>
                  </div>
                  {winner && (
                    <div className="race-card-winner">
                      <span className="team-bar" style={{ background: winner.teamColor }} />
                      <span>Won by <strong>{winner.name}</strong></span>
                    </div>
                  )}
                </Link>
              </li>
            );
          })}
        </motion.ol>
      </div>
    </section>
  );
}
