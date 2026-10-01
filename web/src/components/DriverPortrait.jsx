import { useRef, useState } from 'react';
import Helmet from './Helmet.jsx';
import { prefersReducedMotion } from '../lib/motion.js';

// The driver's head with their helmet hidden on top of it. Moving the pointer over
// the portrait opens a round window that shows the helmet underneath, like the
// opening of landonorris.com. Tapping on a phone puts the whole helmet on.
export default function DriverPortrait({ driver, photo }) {
  const ref = useRef(null);
  const [on, setOn] = useState(false);
  const [full, setFull] = useState(false);
  const head = { x: 50, y: 40, w: 52, ...(photo?.head || {}) };

  const move = (e) => {
    const r = ref.current.getBoundingClientRect();
    ref.current.style.setProperty('--mx', `${e.clientX - r.left}px`);
    ref.current.style.setProperty('--my', `${e.clientY - r.top}px`);
  };

  return (
    <figure
      ref={ref}
      className={`portrait ${on ? 'lens-on' : ''} ${full || prefersReducedMotion() && on ? 'lens-full' : ''}`}
      onPointerEnter={(e) => { if (e.pointerType === 'mouse') { move(e); setOn(true); } }}
      onPointerMove={move}
      onPointerLeave={() => setOn(false)}
      onClick={() => setFull((f) => !f)}
      style={{ '--hx': `${head.x}%`, '--hy': `${head.y}%`, '--hw': `${head.w}%` }}
    >
      <div className="portrait-layer portrait-face">
        {photo?.file ? <img src={`/img/drivers/${photo.file}`} alt={driver.name} /> : <Silhouette />}
      </div>
      <div className="portrait-layer portrait-helmet" aria-hidden="true">
        {photo?.file ? <img src={`/img/drivers/${photo.file}`} alt="" /> : <Silhouette />}
        <Helmet driver={driver} className="portrait-helmet-svg" />
      </div>
      <figcaption className="portrait-hint">
        <span>{full ? 'Tap to take the helmet off' : 'Hover or tap for the helmet'}</span>
        {photo?.author && <span className="portrait-credit">Photo: {photo.author}{photo.license ? `, ${photo.license}` : ''}</span>}
      </figcaption>
    </figure>
  );
}

// Stand-in head and shoulders until a photo is added.
function Silhouette() {
  return (
    <svg viewBox="0 0 400 500" className="portrait-silhouette" aria-hidden="true">
      <path d="M200 70 C258 70 296 116 296 186 C296 250 262 302 200 302 C138 302 104 250 104 186 C104 116 142 70 200 70 Z" />
      <path d="M160 290 H240 L246 340 C310 352 372 380 392 440 L400 500 H0 L8 440 C28 380 90 352 154 340 Z" />
    </svg>
  );
}
