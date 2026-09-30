import { useEffect, useMemo, useRef, useState } from 'react';
import { animate, createMotionPath } from 'animejs';
import { trackGeometry, speedColor } from '../lib/track.js';
import { fmtLap } from '../lib/format.js';
import { prefersReducedMotion } from '../lib/motion.js';

// A circuit drawn from the car's real X/Y trace. `variant="full"` colours it by
// speed and sends a car round at the real pace of the race's fastest lap
// (anime.js motion path, eased by the recorded speed profile).
export default function TrackMap({ race, variant = 'outline', width = 1000, height = 620, playbackRate = 6, color, className = '' }) {
  const geo = useMemo(() => trackGeometry(race?.track, { width, height, pad: variant === 'full' ? 48 : 24, corners: race?.corners || [] }), [race, width, height, variant]);
  const pathRef = useRef(null);
  const carRef = useRef(null);
  const speedRef = useRef(null);
  const animRef = useRef(null);
  const [playing, setPlaying] = useState(() => !prefersReducedMotion());

  useEffect(() => {
    if (variant !== 'full' || !geo || !pathRef.current || !carRef.current) return;
    const lapTime = race.track.lap?.lapTime || 90;
    const anim = animate(carRef.current, {
      ...createMotionPath(pathRef.current),
      duration: (lapTime * 1000) / playbackRate,
      ease: geo.ease,
      loop: true,
      autoplay: false,
      onUpdate: (a) => {
        if (speedRef.current) speedRef.current.textContent = Math.round(geo.speedAt(geo.ease(a.iterationProgress)));
      },
    });
    animRef.current = anim;
    if (playing) anim.play();
    else anim.seek(0);
    return () => anim.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo, variant, playbackRate]);

  useEffect(() => {
    const a = animRef.current;
    if (!a) return;
    playing ? a.play() : a.pause();
  }, [playing]);

  if (!geo) return <div className={`track track-empty ${className}`} />;

  if (variant !== 'full') {
    return (
      <svg className={`track ${className}`} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${race.circuit} circuit map`}>
        <path d={geo.d} fill="none" stroke={color || 'currentColor'} strokeWidth={Math.max(width, height) / 90} strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    );
  }

  const range = geo.maxSpeed - geo.minSpeed || 1;
  const segs = geo.points.map((p, i) => {
    const q = geo.points[(i + 1) % geo.points.length];
    return <line key={i} x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} stroke={speedColor((geo.speed[i] - geo.minSpeed) / range)} />;
  });
  const start = geo.points[0];
  const lap = race.track.lap;

  return (
    <figure className={`track-full ${className}`}>
      <svg className="track" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${race.circuit} circuit map coloured by speed`}>
        <path d={geo.d} fill="none" className="track-bed" strokeWidth="22" strokeLinejoin="round" />
        <g strokeWidth="7" strokeLinecap="round">{segs}</g>
        <path ref={pathRef} d={geo.d} fill="none" stroke="none" />
        <line x1={start[0] - 14} y1={start[1]} x2={start[0] + 14} y2={start[1]} className="track-start" transform={`rotate(90 ${start[0]} ${start[1]})`} />
        {geo.corners.map((c) => (
          <g key={c.number} className="corner" transform={`translate(${c.pos[0]},${c.pos[1]})`}>
            <circle r="11" />
            <text dy="4">{c.number}</text>
          </g>
        ))}
        <g ref={carRef} className="car">
          <circle r="12" className="car-halo" />
          <circle r="6.5" className="car-dot" />
        </g>
      </svg>
      <figcaption className="track-caption">
        <div className="track-readout">
          <span className="mono big" ref={speedRef}>{Math.round(geo.speed[0])}</span>
          <span className="unit">km/h</span>
        </div>
        <div className="track-meta">
          {lap && (
            <p>
              Fastest lap <strong>{lap.code}</strong> <span className="mono">{fmtLap(lap.lapTime)}</span> on lap {lap.lapNumber}
              <span className="muted"> · replayed at {playbackRate}× speed</span>
            </p>
          )}
          <div className="speed-legend" aria-hidden="true">
            <span className="mono">{Math.round(geo.minSpeed)}</span>
            <span className="speed-ramp" />
            <span className="mono">{Math.round(geo.maxSpeed)} km/h</span>
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" type="button" onClick={() => setPlaying((p) => !p)} aria-pressed={playing}>
          {playing ? 'Pause' : 'Play lap'}
        </button>
      </figcaption>
    </figure>
  );
}
