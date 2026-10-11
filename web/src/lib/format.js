// 81.452 -> "1:21.452"
export function fmtLap(sec) {
  if (typeof sec !== 'number' || !Number.isFinite(sec)) return '-';
  const m = Math.floor(sec / 60);
  const s = (sec - m * 60).toFixed(3).padStart(6, '0');
  return m > 0 ? `${m}:${s}` : sec.toFixed(3);
}

export const fmtNum = (n, d = 0) =>
  typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d }) : '-';

export const fmtGap = (g) => (g <= 0 ? 'Leader' : `+${g.toFixed(3)}s`);

export function fmtDate(iso, opts = { day: 'numeric', month: 'short' }) {
  return new Date(iso + 'T12:00:00Z').toLocaleDateString('en-GB', opts);
}

export const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

export const COMPOUND = {
  SOFT: { label: 'Soft', color: '#ff3b3b' },
  MEDIUM: { label: 'Medium', color: '#ffd43b' },
  HARD: { label: 'Hard', color: '#f1f1f1' },
  INTERMEDIATE: { label: 'Inter', color: '#3ecf5a' },
  WET: { label: 'Wet', color: '#3b8cff' },
};
