import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useMotionValue, useScroll, useSpring, useTransform } from 'motion/react';
import { HERO_PHOTO } from '../content.js';
import { useSeason } from '../lib/season.jsx';
import { Link } from '../lib/router.jsx';
import { fmtNum } from '../lib/format.js';
import { EASE_OUT, prefersReducedMotion } from '../lib/motion.js';
import { trackGeometry } from '../lib/track.js';

const LAYERS = 14; // stacked copies of the circuit that give it thickness
const LAP_SECONDS = 9;
const clamp01 = (v) => Math.min(1, Math.max(0, v));

export default function Hero() {
  const { health, standings, races } = useSeason();
  const ref = useRef(null);
  const [photo, setPhoto] = useState('loading');
  const reduced = prefersReducedMotion();
  const finale = races[races.length - 1];
  const [p1, p2] = standings;

  // Scroll drives the circuit from a tilted 3D object down to a flat map.
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  const rotateX = useTransform(scrollYProgress, [0, 0.85], reduced ? [50, 50] : [58, 0]);
  const rotateZ = useTransform(scrollYProgress, [0, 0.85], reduced ? [-18, -18] : [-24, 0]);
  const scale = useTransform(scrollYProgress, [0, 0.85], reduced ? [1, 1] : [0.96, 0.9]);
  const wordX = useTransform(scrollYProgress, [0, 1], reduced ? ['0%', '0%'] : ['0%', '-28%']);
  // Function form keeps these on the JS path: motion's native scroll-timeline
  // shortcut for opacity measures the wrong range on a sticky stage.
  const copyOpacity = useTransform(scrollYProgress, (v) => (reduced ? 1 : clamp01(1 - v / 0.25)));
  const poseX = useTransform(scrollYProgress, [0, 0.85], reduced ? ['8%', '8%'] : ['10%', '0%']);
  const outroOpacity = useTransform(scrollYProgress, (v) => (reduced ? 0 : clamp01((v - 0.55) / 0.2)));

  // A little pointer tilt on top of the scroll pose.
  const tiltX = useMotionValue(0);
  const tiltY = useMotionValue(0);
  const springX = useSpring(tiltX, { stiffness: 80, damping: 18 });
  const springY = useSpring(tiltY, { stiffness: 80, damping: 18 });
  const onPointerMove = (e) => {
    if (reduced || e.pointerType !== 'mouse') return;
    tiltY.set((e.clientX / innerWidth - 0.5) * 14);
    tiltX.set((e.clientY / innerHeight - 0.5) * -10);
  };

  // The nav switches to dark ink while it sits over the yellow stage.
  useEffect(() => {
    const root = document.documentElement;
    const update = () => {
      const r = ref.current?.getBoundingClientRect();
      root.dataset.navTone = r && r.bottom > 64 ? 'light' : '';
    };
    update();
    addEventListener('scroll', update, { passive: true });
    addEventListener('resize', update);
    return () => {
      removeEventListener('scroll', update);
      removeEventListener('resize', update);
      delete root.dataset.navTone;
    };
  }, []);

  return (
    <section className="stage" ref={ref} onPointerMove={onPointerMove}>
      <div className="stage-sticky">
        <div className="stage-top container">
          <p className="stage-label">2025 Formula 1 World Championship</p>
          {finale && <p className="stage-label stage-label-right">Round 24 · {finale.circuit}</p>}
        </div>

        <motion.p className="stage-word" aria-hidden="true" style={{ x: wordX }}>
          Lap by Lap
        </motion.p>

        <div className="stage-object">
          <motion.div className="stage-tilt" style={{ rotateX: springX, rotateY: springY }}>
            <motion.div className="stage-pose" style={{ x: poseX, rotateX, rotateZ, scale }}>
              {finale && <Circuit race={finale} reduced={reduced} />}
            </motion.div>
          </motion.div>
        </div>

        <motion.div className="stage-copy container" style={{ opacity: copyOpacity }}>
          <motion.h1
            className="stage-title"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.3, ease: EASE_OUT }}
          >
            The 2025 season,<br /> lap by lap.
          </motion.h1>
          <p className="stage-lede">
            {health ? fmtNum(health.counts.laps) : 'Every'} laps from 24 Grands Prix, each with its own telemetry.
            Replay the circuits, follow the title fight and go head to head.
          </p>
          <div className="hero-actions">
            <Link to="/#title" className="btn btn-stage">Explore the season</Link>
            <Link to="/lab" className="btn btn-stage-ghost">Open the data lab</Link>
          </div>
        </motion.div>

        <motion.div className="stage-outro container" style={{ opacity: outroOpacity }}>
          <p className="stage-outro-kicker">Yas Marina, 7 December</p>
          {p1 && p2 && (
            <p className="stage-outro-line">
              {p1.name.split(' ').slice(-1)} wins the title by <span className="nowrap">{p1.points - p2.points} points.</span>
            </p>
          )}
        </motion.div>

        <div className="stage-stats container">
          <Stat value="24" label="Grands Prix" />
          <Stat value={health ? fmtNum(health.counts.drivers) : '—'} label="Drivers" />
          <Stat value={health ? fmtNum(health.counts.laps) : '—'} label="Laps in MongoDB" />
          {p1 && p2 && <Stat value={`${p1.points - p2.points} pts`} label="Title margin" />}
        </div>

        <span className="stage-scroll" aria-hidden="true">↓</span>

        {photo !== 'missing' && (
          <figure className={`stage-photo ${photo === 'ok' ? 'is-loaded' : ''}`}>
            <img src={HERO_PHOTO.src} alt={HERO_PHOTO.alt} onLoad={() => setPhoto('ok')} onError={() => setPhoto('missing')} />
            {HERO_PHOTO.author && (
              <figcaption>Photo: {HERO_PHOTO.author}{HERO_PHOTO.license ? `, ${HERO_PHOTO.license}` : ''}</figcaption>
            )}
          </figure>
        )}
      </div>
    </section>
  );
}

// The finale's circuit as a thick 3D slab, with a car lapping it at its real
// recorded speed (the speed profile becomes the motion's keyPoints).
function Circuit({ race, reduced }) {
  const geo = useMemo(() => trackGeometry(race.track, { width: 1000, height: 620, pad: 30 }), [race]);
  const keys = useMemo(() => {
    if (!geo) return null;
    const n = 60;
    const times = [], points = [];
    for (let i = 0; i <= n; i++) {
      times.push((i / n).toFixed(4));
      points.push(geo.ease(i / n).toFixed(4));
    }
    return { keyTimes: times.join(';'), keyPoints: points.join(';') };
  }, [geo]);
  if (!geo) return null;
  const box = `0 0 ${geo.width} ${geo.height}`;

  return (
    <div className="circuit">
      <svg viewBox={box} className="circuit-shadow" aria-hidden="true">
        <path d={geo.d} />
      </svg>
      {Array.from({ length: LAYERS }, (_, i) => (
        <svg
          key={i}
          viewBox={box}
          className="circuit-layer"
          aria-hidden="true"
          style={{ transform: `translateZ(calc(${i} * var(--depth)))`, '--shade': `${26 - (i / LAYERS) * 16}%` }}
        >
          <path d={geo.d} />
        </svg>
      ))}
      <svg viewBox={box} className="circuit-top" style={{ transform: `translateZ(calc(${LAYERS} * var(--depth)))` }} role="img" aria-label={`${race.circuit} circuit`}>
        <motion.path
          d={geo.d}
          className="circuit-surface"
          initial={reduced ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.6, ease: EASE_OUT }}
        />
        <path d={geo.d} className="circuit-line" />
        {!reduced && keys && (
          <circle r="11" className="circuit-car">
            <animateMotion
              dur={`${LAP_SECONDS}s`}
              repeatCount="indefinite"
              path={geo.d}
              calcMode="linear"
              keyTimes={keys.keyTimes}
              keyPoints={keys.keyPoints}
            />
          </circle>
        )}
      </svg>
    </div>
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
