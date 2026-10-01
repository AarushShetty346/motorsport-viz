import { useRef, useState } from 'react';
import Helmet from './Helmet.jsx';
import { prefersReducedMotion } from '../lib/motion.js';

// The driver's head with their helmet hidden on top of it. Moving the pointer over
// the portrait opens a round window that shows the helmet underneath, like the
// opening of landonorris.com. Tapping on a phone puts the whole helmet on.
// The helmet is either drawn by the site or, when credits.json has one, a photo
// of the driver's real helmet; a switch flips between the two.
export default function DriverPortrait({ driver, photo }) {
  const ref = useRef(null);
  const [on, setOn] = useState(false);
  const [full, setFull] = useState(false);
  const [style, setStyle] = useHelmetStyle();
  const head = { x: 50, y: 40, w: 52, ...(photo?.head || {}) };
  const real = photo?.helmet?.file ? photo.helmet : null;
  const showReal = style === 'real' && real;

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
        {showReal
          ? <img src={`/img/drivers/helmets/${real.file}`} alt="" className="portrait-helmet-photo" />
          : <Helmet driver={driver} className="portrait-helmet-svg" />}
      </div>
      <div className="helmet-switch" role="group" aria-label="Helmet style" onClick={(e) => e.stopPropagation()} onPointerEnter={(e) => e.stopPropagation()}>
        <button type="button" aria-pressed={!showReal} onClick={() => setStyle('drawn')}>Drawn</button>
        <button
          type="button"
          aria-pressed={!!showReal}
          disabled={!real}
          title={real ? undefined : 'No photo of this helmet yet (npm run photos:fetch)'}
          onClick={() => setStyle('real')}
        >Real</button>
      </div>
      <figcaption className="portrait-hint">
        <span>{full ? 'Tap to take the helmet off' : 'Hover or tap for the helmet'}</span>
        {photo?.author && <span className="portrait-credit">Photo: {photo.author}{photo.license ? `, ${photo.license}` : ''}</span>}
        {showReal && <span className="portrait-credit">Helmet: {real.author}{real.license ? `, ${real.license}` : ''}</span>}
      </figcaption>
    </figure>
  );
}

// Drawn or real, remembered across driver pages so they're easy to compare.
let saved = 'drawn';
try { saved = localStorage.getItem('helmet-style') || 'drawn'; } catch { /* storage blocked */ }
function useHelmetStyle() {
  const [v, setV] = useState(saved);
  const set = (next) => {
    saved = next;
    setV(next);
    try { localStorage.setItem('helmet-style', next); } catch { /* storage blocked */ }
  };
  return [v, set];
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
