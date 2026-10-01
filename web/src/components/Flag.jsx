import * as flags from '../lib/flags.js';

export default function Flag({ code, className = '' }) {
  const svg = flags[code];
  if (!svg) return <span className={`flag flag-text ${className}`}>{code}</span>;
  return <span className={`flag ${className}`} aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />;
}
