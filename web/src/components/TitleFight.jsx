import { useMemo, useRef, useState } from 'react';
import { motion, useMotionValueEvent, useScroll, useTransform } from 'motion/react';
import { useApi } from '../lib/useApi.js';
import { useSeason } from '../lib/season.jsx';
import { prefersReducedMotion } from '../lib/motion.js';
import Query from './Query.jsx';

const W = 1000, H = 520, PAD = { l: 44, r: 120, t: 20, b: 36 };
const HIGHLIGHT = 4;

// Cumulative championship points, drawn round by round as you scroll.
export default function TitleFight() {
  const { data } = useApi('/api/season/progression');
  const { standings, driverById, races, dashed } = useSeason();
  const ref = useRef(null);
  const reduced = prefersReducedMotion();
  const [round, setRound] = useState(reduced ? 24 : 1);
  const [hover, setHover] = useState(null);

  const model = useMemo(() => {
    if (!data || !standings.length) return null;
    const n = races.length || 24;
    const series = data.results.map((row) => {
      const per = new Array(n + 1).fill(0);
      for (const r of row.rounds) per[r.round] += r.points;
      const cum = per.map((_, i) => per.slice(0, i + 1).reduce((a, b) => a + b, 0));
      return { driverId: row._id, cum };
    });
    const order = new Map(standings.map((s, i) => [s.driverId, i]));
    series.sort((a, b) => (order.get(a.driverId) ?? 99) - (order.get(b.driverId) ?? 99));
    const max = Math.ceil(Math.max(...series.map((s) => s.cum[n])) / 50) * 50;
    const x = (i) => PAD.l + (i / n) * (W - PAD.l - PAD.r);
    const y = (v) => H - PAD.b - (v / max) * (H - PAD.t - PAD.b);
    const withPaths = series.map((s, idx) => ({
      ...s,
      driver: driverById.get(s.driverId),
      top: idx < HIGHLIGHT,
      d: s.cum.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(''),
    }));
    return { n, max, x, y, series: withPaths };
  }, [data, standings, driverById, races]);

  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  const clip = useTransform(scrollYProgress, [0.05, 0.9], [0, 1]);
  useMotionValueEvent(clip, 'change', (v) => {
    if (reduced || !model) return;
    setRound(Math.max(1, Math.min(model.n, Math.ceil(v * model.n))));
  });
  const clipWidth = useTransform(clip, (v) => (reduced ? W : PAD.l + v * (W - PAD.l - PAD.r) + 2));

  if (!model) return <section className="title-fight" id="title" ref={ref}><div className="title-sticky" /></section>;

  const shown = hover ?? round;
  const leaders = model.series.filter((s) => s.top).map((s) => ({ ...s, pts: s.cum[shown] })).sort((a, b) => b.pts - a.pts);
  const race = races[shown - 1];
  const gap = leaders[0].pts - leaders[1].pts;
  const ticks = Array.from({ length: model.max / 100 + 1 }, (_, i) => i * 100).filter((v) => v <= model.max);

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - PAD.l) / (W - PAD.l - PAD.r)) * model.n);
    setHover(i >= 1 && i <= (reduced ? model.n : round) ? i : null);
  };

  // End labels, nudged apart so they never overlap.
  const labels = model.series.filter((s) => s.top).map((s) => ({ s, y: model.y(s.cum[model.n]) })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < labels.length; i++) if (labels[i].y - labels[i - 1].y < 22) labels[i].y = labels[i - 1].y + 22;

  return (
    <section className={`title-fight ${reduced ? 'is-static' : ''}`} id="title" ref={ref}>
      <div className="title-sticky">
        <div className="section-head container">
          <p className="eyebrow"><span className="num">01</span>The title fight</p>
          <h2 className="display-lg">Three drivers. Twenty-four rounds. <span className="nowrap">{standings[0].points - standings[1].points} points.</span></h2>
        </div>
        <div className="container title-grid">
          <aside className="title-aside">
            <p className="round-label mono">After round {shown}{race ? ` · ${race.shortName}` : ''}</p>
            <ol className="title-leaders">
              {leaders.map((s, i) => (
                <li key={s.driverId}>
                  <span className="pos mono">{i + 1}</span>
                  <span className="team-bar" style={{ background: s.driver?.teamColor }} />
                  <span className="tl-name">{s.driver?.name}</span>
                  <span className="tl-pts mono">{s.pts}</span>
                </li>
              ))}
            </ol>
            <p className="muted small">{gap === 0 ? 'Level on points.' : `${leaders[0].driver?.lastName} leads by ${gap} point${gap === 1 ? '' : 's'}.`}</p>
          </aside>
          <figure className="chart">
            <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Cumulative championship points by round" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
              <defs>
                <clipPath id="tf-clip"><motion.rect x="0" y="0" height={H} style={{ width: clipWidth }} /></clipPath>
              </defs>
              {ticks.map((v) => (
                <g key={v} className="grid">
                  <line x1={PAD.l} x2={W - PAD.r} y1={model.y(v)} y2={model.y(v)} />
                  <text x={PAD.l - 8} y={model.y(v) + 4} textAnchor="end">{v}</text>
                </g>
              ))}
              {[1, 6, 12, 18, 24].map((i) => (
                <text key={i} className="axis" x={model.x(i)} y={H - 10} textAnchor="middle">R{i}</text>
              ))}
              <g clipPath="url(#tf-clip)">
                {model.series.filter((s) => !s.top).map((s) => <path key={s.driverId} d={s.d} className="line-faint" />)}
                {model.series.filter((s) => s.top).map((s) => (
                  <path key={s.driverId} d={s.d} className="line-top" stroke={s.driver?.teamColor} strokeDasharray={dashed.has(s.driverId) ? '7 5' : undefined} />
                ))}
              </g>
              {hover && <line className="crosshair" x1={model.x(hover)} x2={model.x(hover)} y1={PAD.t} y2={H - PAD.b} />}
              {(hover || reduced || round === model.n) && model.series.filter((s) => s.top).map((s) => (
                <circle key={s.driverId} className="dot" cx={model.x(shown)} cy={model.y(s.cum[shown])} r="5" fill={s.driver?.teamColor} />
              ))}
              {(reduced || round === model.n) && labels.map(({ s, y }) => (
                <text key={s.driverId} className="end-label" x={W - PAD.r + 12} y={y + 4}>{s.driver?.code} {s.cum[model.n]}</text>
              ))}
            </svg>
            <figcaption className="legend">
              {model.series.filter((s) => s.top).map((s) => (
                <span key={s.driverId}>
                  <svg width="22" height="8" aria-hidden="true"><line x1="0" x2="22" y1="4" y2="4" stroke={s.driver?.teamColor} strokeWidth="2.5" strokeDasharray={dashed.has(s.driverId) ? '5 3' : undefined} /></svg>
                  {s.driver?.name}
                </span>
              ))}
              <span className="muted"><svg width="22" height="8" aria-hidden="true"><line x1="0" x2="22" y1="4" y2="4" className="line-faint" /></svg>Rest of the grid</span>
            </figcaption>
            <Query text={data.query} label="Points per driver per round (aggregation on races)" />
          </figure>
        </div>
      </div>
    </section>
  );
}
