// Turns a race's recorded car trace (x/y/speed arrays) into SVG geometry.

// Picks the rotation that best fills a box of the given aspect ratio.
function bestRotation(xs, ys, aspect) {
  let best = { angle: 0, score: -Infinity };
  for (let deg = 0; deg < 180; deg += 3) {
    const a = (deg * Math.PI) / 180;
    const c = Math.cos(a), s = Math.sin(a);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < xs.length; i++) {
      const x = xs[i] * c - ys[i] * s;
      const y = xs[i] * s + ys[i] * c;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    const w = maxX - minX, h = maxY - minY;
    const scale = Math.min(aspect / w, 1 / h);
    const score = scale * scale * w * h; // share of the box the track fills
    if (score > best.score + 1e-9) best = { angle: a, score };
  }
  return best.angle;
}

const geometryCache = new WeakMap();

export function trackGeometry(track, { width = 1000, height = 620, pad = 40, corners = [] } = {}) {
  if (!track) return null;
  const key = `${width}x${height}x${pad}`;
  const cached = geometryCache.get(track)?.[key];
  if (cached) return cached;

  const xs = track.x, ys = track.y.map((v) => -v); // F1 y points up, SVG y points down
  const angle = bestRotation(xs, ys, (width - pad * 2) / (height - pad * 2));
  const c = Math.cos(angle), s = Math.sin(angle);
  const rot = (x, y) => [x * c - y * s, x * s + y * c];
  const pts = xs.map((x, i) => rot(x, ys[i]));
  const minX = Math.min(...pts.map((p) => p[0])), maxX = Math.max(...pts.map((p) => p[0]));
  const minY = Math.min(...pts.map((p) => p[1])), maxY = Math.max(...pts.map((p) => p[1]));
  const k = Math.min((width - pad * 2) / (maxX - minX), (height - pad * 2) / (maxY - minY));
  const ox = (width - (maxX - minX) * k) / 2 - minX * k;
  const oy = (height - (maxY - minY) * k) / 2 - minY * k;
  const tx = ([x, y]) => [+(x * k + ox).toFixed(1), +(y * k + oy).toFixed(1)];
  const points = pts.map(tx);
  const d = 'M' + points.map((p) => p.join(',')).join('L') + 'Z';

  // Seconds spent on each segment at the recorded speed -> a real-time easing curve.
  const seg = [];
  let total = 0;
  const lapLen = track.length || 5000;
  for (let i = 0; i < track.speed.length; i++) {
    const v = Math.max(40, (track.speed[i] + track.speed[(i + 1) % track.speed.length]) / 2) / 3.6; // m/s
    total += lapLen / track.speed.length / v;
    seg.push(total);
  }
  const cumulative = [0, ...seg.map((t) => t / total)];

  const geo = {
    width, height, d, points,
    speed: track.speed,
    minSpeed: Math.min(...track.speed),
    maxSpeed: Math.max(...track.speed),
    corners: corners.map((cn) => ({ number: cn.number, pos: tx(rot(cn.x, -cn.y)) })),
    // ease(t): share of the lap *time* elapsed -> share of the lap *distance* covered.
    ease: (t) => {
      if (t <= 0) return 0;
      if (t >= 1) return 1;
      let lo = 0, hi = cumulative.length - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (cumulative[mid] < t) lo = mid; else hi = mid;
      }
      const f = (t - cumulative[lo]) / (cumulative[hi] - cumulative[lo] || 1);
      return (lo + f) / (cumulative.length - 1);
    },
    speedAt: (progress) => track.speed[Math.min(track.speed.length - 1, Math.floor(progress * track.speed.length))],
  };
  geometryCache.set(track, { ...(geometryCache.get(track) || {}), [key]: geo });
  return geo;
}

// Slow -> fast colour ramp for the speed map (one warm hue family, dark to light).
const STOPS = [
  [0, [70, 40, 120]],
  [0.35, [190, 40, 70]],
  [0.7, [255, 110, 40]],
  [1, [255, 214, 90]],
];
export function speedColor(t) {
  t = Math.max(0, Math.min(1, t));
  for (let i = 1; i < STOPS.length; i++) {
    if (t <= STOPS[i][0]) {
      const [t0, c0] = STOPS[i - 1];
      const [t1, c1] = STOPS[i];
      const f = (t - t0) / (t1 - t0);
      return `rgb(${c0.map((v, j) => Math.round(v + (c1[j] - v) * f)).join(',')})`;
    }
  }
  return 'rgb(255,214,90)';
}
