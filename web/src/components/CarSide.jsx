// A flat side view of a 2025 car painted in a team's livery (body, accent, stripe).
export default function CarSide({ livery, label }) {
  const { body, accent, stripe } = livery;
  return (
    <svg viewBox="0 0 560 150" className="car-side" role="img" aria-label={label}>
      <path d="M14 112 L34 100 L160 94 L228 74 L256 56 L292 56 L304 72 L396 74 L436 46 L474 46 L482 78 L526 84 L546 112 Z" fill={body} stroke="#0b0b0c" strokeWidth="2" />
      <path d="M160 94 L228 74 L396 74 L410 92 Z" fill={accent} />
      <path d="M40 104 L520 104" stroke={stripe} strokeWidth="5" />
      <path d="M266 58 C272 46 288 46 294 58" fill="none" stroke="#0b0b0c" strokeWidth="5" />
      <rect x="8" y="88" width="46" height="10" fill={accent} stroke="#0b0b0c" strokeWidth="2" />
      <rect x="470" y="34" width="62" height="12" fill={accent} stroke="#0b0b0c" strokeWidth="2" />
      <circle cx="128" cy="112" r="28" fill="#0b0b0c" /><circle cx="128" cy="112" r="11" fill="#5d5d60" />
      <circle cx="448" cy="112" r="30" fill="#0b0b0c" /><circle cx="448" cy="112" r="12" fill="#5d5d60" />
    </svg>
  );
}
