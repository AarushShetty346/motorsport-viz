import { useEffect, useRef } from 'react';
import { lenis } from '../App.jsx';
import { prefersReducedMotion } from '../lib/motion.js';

// A band of text that drifts sideways on its own and speeds up (or reverses) with the scroll.
export default function Marquee({ items, className = '' }) {
  const track = useRef(null);
  useEffect(() => {
    if (prefersReducedMotion()) return;
    let x = 0, raf, last = performance.now();
    const tick = (now) => {
      const dt = Math.min(64, now - last);
      last = now;
      const v = lenis?.velocity ?? 0;
      x -= (0.04 + Math.min(2.4, Math.abs(v) * 0.05) * Math.sign(v || 1)) * dt;
      const half = track.current ? track.current.scrollWidth / 2 : 0;
      if (half) x = ((x % half) - half) % half;
      if (track.current) track.current.style.transform = `translate3d(${x}px,0,0) skewX(${Math.max(-8, Math.min(8, -v * 0.25))}deg)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  const row = items.map((t, i) => <span key={i}>{t}<i aria-hidden="true">●</i></span>);
  return (
    <div className={`marquee ${className}`} aria-label={items.join(', ')}>
      <div className="marquee-track" ref={track} aria-hidden="true">{row}{row}</div>
    </div>
  );
}
