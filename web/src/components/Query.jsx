// "MongoDB query" disclosure shown under every feature that talks to the database.
export default function Query({ text, label = 'MongoDB query' }) {
  if (!text) return null;
  return (
    <details className="query">
      <summary>
        <span className="query-icon" aria-hidden="true">{'{ }'}</span>
        {label}
      </summary>
      <pre>{text}</pre>
    </details>
  );
}
