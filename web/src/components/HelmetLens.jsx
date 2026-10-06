import { useRef, useState } from 'react';
import { motion, useMotionTemplate, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform } from 'motion/react';
import { useSeason } from '../lib/season.jsx';
import { useDriverPhotos } from '../lib/photos.js';
import { Link } from '../lib/router.jsx';

// Face to helmet: scrolling through the section opens a lens over the driver's
// face that shows their helmet underneath; on hover the lens follows the cursor.
export default function HelmetLens() {
  const { driverByKey } = useSeason();
  const photos = useDriverPhotos();
  const keys = Object.keys(photos).filter((k) => photos[k]?.file && photos[k]?.helmet?.file && photos[k]?.head && driverByKey.get(k));
  const [pick, setPick] = useState(null);
  const key = pick && keys.includes(pick) ? pick : keys[0];
  if (!key) return null;
  return <Lens keys={keys} photos={photos} current={key} onPick={setPick} />;
}

function Lens({ keys, photos, current: key, onPick: setPick }) {
  const { driverByKey } = useSeason();
  const reduce = useReducedMotion();
  const head = photos[key].head;

  const stage = useRef(null);
  const { scrollYProgress } = useScroll({ target: stage, offset: ['start start', 'end end'] });
  const grow = useTransform(scrollYProgress, [0.05, 0.75], [0, 75]);
  const radius = useSpring(grow, { stiffness: 120, damping: 24 });
  const hover = useMotionValue(0);
  const hoverR = useSpring(hover, { stiffness: 200, damping: 26 });
  const r = useTransform([radius, hoverR], ([a, b]) => Math.max(a, b));
  const x = useSpring(head.x, { stiffness: 260, damping: 30 });
  const y = useSpring(head.y, { stiffness: 260, damping: 30 });
  const clip = useMotionTemplate`circle(${reduce ? 30 : r}% at ${x}% ${y}%)`;

  const d = driverByKey.get(key);
  const p = photos[key];
  const rest = () => { x.set(head.x); y.set(head.y); hover.set(0); };
  const move = (e) => {
    const box = e.currentTarget.getBoundingClientRect();
    x.set(((e.clientX - box.left) / box.width) * 100);
    y.set(((e.clientY - box.top) / box.height) * 100);
    hover.set(18);
  };

  return (
    <section ref={stage} className="lens-stage" style={{ '--team': d.teamColor }}>
      <div className="lens-sticky container">
        <div className="lens-copy">
          <h2 className="display-lg">Under the lid</h2>
          <p className="lede">Scroll to swap the face for the helmet. Move over the photo to look through the lens.</p>
          <div className="lens-picker" role="tablist" aria-label="Driver">
            {keys.map((k) => {
              const dk = driverByKey.get(k);
              return (
                <button key={k} type="button" role="tab" aria-selected={k === key} className={`lens-tab ${k === key ? 'active' : ''}`} style={{ '--team': dk.teamColor }}
                  onClick={() => { setPick(k); x.set(photos[k].head.x); y.set(photos[k].head.y); }}>
                  {dk.lastName}
                </button>
              );
            })}
          </div>
          <Link to={`/driver/${d.key}`} className="btn btn-primary">{d.firstName}'s season</Link>
        </div>
        <figure className="lens-frame" onPointerMove={move} onPointerLeave={rest}>
          <img src={`/img/drivers/${p.file}`} alt={d.name} className="lens-face" draggable="false" />
          <motion.img src={`/img/drivers/helmets/${p.helmet.file}`} alt={`${d.name}'s helmet`} className="lens-helmet" style={{ clipPath: clip }} draggable="false" />
          <figcaption className="lens-credit">Photos: {p.author} ({p.license}); helmet: {p.helmet.author} ({p.helmet.license}), Wikimedia Commons</figcaption>
        </figure>
      </div>
    </section>
  );
}
