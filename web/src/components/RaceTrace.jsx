import { useMemo, useState } from 'react';
import { useSeason } from '../lib/season.jsx';
import { fmtLap } from '../lib/format.js';

const W = 1000, PAD = { l: 36, r: 64, t: 16, b: 30 };

// Running order lap by lap: one line per driver in team colours.
export default function RaceTrace({ laps, results }) {
  const { driverById, dashed } = useSeason();
  const [focus, setFocus] = useState(null);
  const [hoverLap, setHoverLap] = useState(null);

  const model = useMemo(() => {
    const byDriver = new Map();
    for (const l of laps) {
      if (!l.position) continue;
      if (!byDriver.has(l.driverId)) byDriver.set(l.driverId, []);
      byDriver.get(l.driverId).push(l);
    }
    const maxLap = Math.max(...laps.map((l) => l.lapNumber));
    const cars = Math.max(20, ...laps.map((l) => l.position || 0));
    const H = cars * 22 + PAD.t + PAD.b;
    const x = (lap) => PAD.l + ((lap - 1) / Math.max(1, maxLap - 1)) * (W - PAD.l - PAD.r);
    const y = (pos) => PAD.t + (pos - 1) * ((H - PAD.t - PAD.b) / (cars - 1));
    const order = new Map((results || []).map((r, i) => [r.driverId, i]));
    const series = [...byDriver.entries()]
      .map(([id, ls]) => ({
        id,
        laps: ls,
        driver: driverById.get(id),
        d: ls.map((l, i) => `${i ? 'L' : 'M'}${x(l.lapNumber).toFixed(1)},${y(l.position).toFixed(1)}`).join(''),
        last: ls[ls.length - 1],
      }))
      .sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99));
    return { series, x, y, H, maxLap, cars };
  }, [laps, results, driverById]);

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const lap = Math.round(((px - PAD.l) / (W - PAD.l - PAD.r)) * (model.maxLap - 1)) + 1;
    setHoverLap(lap >= 1 && lap <= model.maxLap ? lap : null);
  };

  const tooltipRows = hoverLap
    ? model.series.map((s) => ({ s, l: s.laps.find((l) => l.lapNumber === hoverLap) })).filter((r) => r.l).sort((a, b) => a.l.position - b.l.position).slice(0, 5)
    : [];

  return (
    <figure className="chart race-trace">
      <div className="chart-wrap">
        <svg viewBox={`0 0 ${W} ${model.H}`} role="img" aria-label="Position of every driver on every lap" onMouseMove={onMove} onMouseLeave={() => setHoverLap(null)}>
          {[1, 5, 10, 15, 20].filter((p) => p <= model.cars).map((p) => (
            <g key={p} className="grid">
              <line x1={PAD.l} x2={W - PAD.r} y1={model.y(p)} y2={model.y(p)} />
              <text x={PAD.l - 8} y={model.y(p) + 4} textAnchor="end">P{p}</text>
            </g>
          ))}
          {[1, Math.round(model.maxLap / 2), model.maxLap].map((l) => (
            <text key={l} className="axis" x={model.x(l)} y={model.H - 8} textAnchor="middle">Lap {l}</text>
          ))}
          {hoverLap && <line className="crosshair" x1={model.x(hoverLap)} x2={model.x(hoverLap)} y1={PAD.t} y2={model.H - PAD.b} />}
          {model.series.map((s) => {
            const dim = focus && focus !== s.id;
            return (
              <g key={s.id} className={`trace ${dim ? 'dim' : ''} ${focus === s.id ? 'focus' : ''}`} onMouseEnter={() => setFocus(s.id)} onMouseLeave={() => setFocus(null)}>
                <path d={s.d} stroke={s.driver?.teamColor} strokeDasharray={dashed.has(s.id) ? '6 4' : undefined} className="trace-line" />
                <path d={s.d} className="trace-hit" />
                <text x={model.x(s.last.lapNumber) + 8} y={model.y(s.last.position) + 4} className="trace-label">{s.driver?.code}</text>
              </g>
            );
          })}
        </svg>
        {hoverLap && (
          <div className="tooltip" style={{ left: `${(model.x(hoverLap) / W) * 100}%` }}>
            <p className="mono">Lap {hoverLap}</p>
            {tooltipRows.map(({ s, l }) => (
              <p key={s.id}><span className="team-bar sm" style={{ background: s.driver?.teamColor }} /> P{l.position} {s.driver?.code} <span className="mono muted">{fmtLap(l.lapTime)}</span></p>
            ))}
          </div>
        )}
      </div>
      <figcaption className="muted small">Hover a line to follow one driver. Teammates share a colour; the second driver is dashed.</figcaption>
    </figure>
  );
}
