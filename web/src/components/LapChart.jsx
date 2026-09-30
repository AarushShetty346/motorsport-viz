import { useState } from 'react';
import { fmtLap, COMPOUND } from '../lib/format.js';

const W = 1000, H = 280, PAD = { l: 64, r: 16, t: 14, b: 28 };

// One dot per lap, coloured by tyre compound; pit laps drawn hollow.
export default function LapChart({ laps }) {
  const [hover, setHover] = useState(null);
  if (!laps.length) return null;
  const times = laps.map((l) => l.lapTime).sort((a, b) => a - b);
  const lo = times[0];
  const hi = Math.min(times[times.length - 1], times[Math.floor(times.length * 0.9)] * 1.04); // keep SC laps from flattening the rest
  const maxLap = Math.max(...laps.map((l) => l.lapNumber));
  const x = (n) => PAD.l + ((n - 1) / Math.max(1, maxLap - 1)) * (W - PAD.l - PAD.r);
  const y = (t) => PAD.t + ((Math.min(t, hi) - lo) / (hi - lo || 1)) * (H - PAD.t - PAD.b);
  const ticks = [lo, (lo + hi) / 2, hi];
  return (
    <figure className="chart lap-chart">
      <div className="chart-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Lap times across the race">
          {ticks.map((t) => (
            <g key={t} className="grid">
              <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} />
              <text x={PAD.l - 8} y={y(t) + 4} textAnchor="end">{fmtLap(t)}</text>
            </g>
          ))}
          <text className="axis" x={x(1)} y={H - 6}>Lap 1</text>
          <text className="axis" x={x(maxLap)} y={H - 6} textAnchor="end">Lap {maxLap}</text>
          {laps.map((l) => {
            const pit = l.pitIn || l.pitOut;
            const c = COMPOUND[l.compound]?.color || '#888';
            return (
              <circle
                key={l._id}
                cx={x(l.lapNumber)}
                cy={y(l.lapTime)}
                r={hover === l._id ? 7 : 4.5}
                fill={pit ? 'var(--surface)' : c}
                stroke={c}
                strokeWidth={pit ? 2 : 1}
                className="lap-dot"
                onMouseEnter={() => setHover(l._id)}
                onMouseLeave={() => setHover(null)}
              >
                <title>{`Lap ${l.lapNumber}: ${fmtLap(l.lapTime)}${pit ? ' (pit lap)' : ''}${l.lapTime > hi ? ' (off the chart)' : ''}`}</title>
              </circle>
            );
          })}
        </svg>
      </div>
      <figcaption className="legend">
        {Object.entries(COMPOUND).filter(([k]) => laps.some((l) => l.compound === k)).map(([k, v]) => (
          <span key={k}><span className="sw-dot" style={{ background: v.color }} />{v.label}</span>
        ))}
        <span><span className="sw-dot hollow" />Pit lap</span>
        <span className="muted">Slow laps (safety car) are capped at the bottom edge.</span>
      </figcaption>
    </figure>
  );
}
