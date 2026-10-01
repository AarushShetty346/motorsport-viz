import { useRef, useState } from 'react';
import { motion, useScroll, useTransform } from 'motion/react';
import { HERO_PHOTO } from '../content.js';
import { useSeason } from '../lib/season.jsx';
import { Link } from '../lib/router.jsx';
import { fmtNum } from '../lib/format.js';
import { EASE_OUT, prefersReducedMotion } from '../lib/motion.js';
import TrackMap from './TrackMap.jsx';

export default function Hero() {
  const { health, standings, races } = useSeason();
  const ref = useRef(null);
  const [photo, setPhoto] = useState('loading');
  const reduced = prefersReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const mediaY = useTransform(scrollYProgress, [0, 1], reduced ? ['0%', '0%'] : ['0%', '8%']);
  const mediaScale = useTransform(scrollYProgress, [0, 1], reduced ? [1, 1] : [1.02, 1.06]);
  const copyOpacity = useTransform(scrollYProgress, [0, 0.6], [1, reduced ? 1 : 0]);

  const [p1, p2] = standings;
  const finale = races[races.length - 1];

  return (
    <section className="hero" ref={ref}>
      <motion.div className="hero-media" style={{ y: mediaY, scale: mediaScale }}>
        {photo !== 'missing' && (
          <img
            src={HERO_PHOTO.src}
            alt={HERO_PHOTO.alt}
            className={`hero-photo ${photo === 'ok' ? 'is-loaded' : ''}`}
            onLoad={() => setPhoto('ok')}
            onError={() => setPhoto('missing')}
            fetchPriority="high"
          />
        )}
        {photo === 'missing' && finale && (
          <div className="hero-art">
            <TrackMap race={finale} width={1200} height={800} className="hero-track" />
          </div>
        )}
      </motion.div>
      <div className="hero-shade" />

      <motion.div className="hero-copy" style={{ opacity: copyOpacity }}>
        <p className="eyebrow">2025 Formula 1 World Championship</p>
        <motion.h1 className="display-xl" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, ease: EASE_OUT }}>
          The 2025 season, lap by lap.
        </motion.h1>
        <p className="hero-lede">
          {health ? fmtNum(health.counts.laps) : 'Every'} laps from 24 Grands Prix, each with its own telemetry. Replay the circuits, follow the title fight and go head to head.
        </p>
        <div className="hero-actions">
          <Link to="/#title" className="btn btn-primary">Explore the season</Link>
          <Link to="/lab" className="btn btn-ghost">Open the data lab</Link>
        </div>
      </motion.div>

      <div className="hero-stats">
        <Stat value="24" label="Grands Prix" />
        <Stat value={health ? fmtNum(health.counts.drivers) : '—'} label="Drivers" />
        <Stat value={health ? fmtNum(health.counts.laps) : '—'} label="Laps in MongoDB" />
        {p1 && p2 && <Stat value={`${p1.points - p2.points} pts`} label={`${p1.name.split(' ').slice(-1)}'s title margin`} />}
      </div>
      {photo === 'ok' && HERO_PHOTO.author && (
        <p className="hero-credit">Photo: {HERO_PHOTO.author}{HERO_PHOTO.license ? `, ${HERO_PHOTO.license}` : ''}</p>
      )}
    </section>
  );
}

function Stat({ value, label }) {
  return (
    <div className="hero-stat">
      <span className="hero-stat-value">{value}</span>
      <span className="hero-stat-label">{label}</span>
    </div>
  );
}
