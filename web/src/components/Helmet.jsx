import { useId } from 'react';

// A front-on race helmet drawn in the driver's team colour with their number.
// Original artwork, so it needs no licence; the shapes are kept simple on purpose.
export default function Helmet({ driver, className = '', title }) {
  const id = useId().replace(/:/g, '');
  const base = driver?.teamColor || '#888888';
  const light = luminance(base) > 0.55;
  const trim = light ? '#0b0b0c' : '#f4f3ef';
  const number = driver?.number ?? '';

  return (
    <svg viewBox="0 0 200 210" className={`helmet ${className}`} role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <defs>
        <linearGradient id={`shell-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.35" />
          <stop offset="0.45" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="1" stopColor="#000000" stopOpacity="0.35" />
        </linearGradient>
        <linearGradient id={`visor-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3a3a40" />
          <stop offset="0.5" stopColor="#0b0b0c" />
          <stop offset="1" stopColor="#1d1d22" />
        </linearGradient>
        <clipPath id={`clip-${id}`}>
          <path d={SHELL} />
        </clipPath>
      </defs>

      <path d={SHELL} fill={base} />
      <g clipPath={`url(#clip-${id})`}>
        {/* centre stripe and a band around the brow, in the trim colour */}
        <path d="M88 0 H112 V78 H88 Z" fill={trim} opacity="0.9" />
        <path d="M0 62 C60 46 140 46 200 62 L200 70 C140 55 60 55 0 70 Z" fill={trim} opacity="0.85" />
        <path d="M0 150 C50 170 150 170 200 150 L200 210 L0 210 Z" fill="#0b0b0c" opacity="0.28" />
        <path d={SHELL} fill={`url(#shell-${id})`} />
      </g>

      {/* visor with a soft reflection */}
      <path d="M30 90 C62 76 138 76 170 90 L167 128 C136 119 64 119 33 128 Z" fill={`url(#visor-${id})`} />
      <path d="M44 92 C74 83 108 82 132 85 L128 92 C104 90 76 91 48 99 Z" fill="#ffffff" opacity="0.22" />
      <path d="M30 90 C62 76 138 76 170 90" fill="none" stroke="#0b0b0c" strokeWidth="3" />

      {/* chin bar vents and the race number */}
      <path d="M78 168 H122" stroke="#0b0b0c" strokeWidth="4" strokeLinecap="round" opacity="0.6" />
      <path d="M84 178 H116" stroke="#0b0b0c" strokeWidth="4" strokeLinecap="round" opacity="0.6" />
      <text x="100" y="152" textAnchor="middle" className="helmet-number" fill={trim}>{number}</text>
      <path d={SHELL} fill="none" stroke="#0b0b0c" strokeWidth="3" />
    </svg>
  );
}

const SHELL = 'M100 8 C152 8 188 44 188 98 L188 150 C188 178 166 198 138 200 L62 200 C34 198 12 178 12 150 L12 98 C12 44 48 8 100 8 Z';

function luminance(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}
