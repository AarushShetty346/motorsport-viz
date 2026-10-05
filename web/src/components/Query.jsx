import { fmtNum } from '../lib/format.js';

// "Under the hood" disclosure shown under every feature that talks to the database:
// the exact query, plus what explain() says about how MongoDB ran it.
export default function Query({ text, explain, label = 'Under the hood' }) {
  if (!text) return null;
  return (
    <details className="query">
      <summary>
        <span className="query-icon" aria-hidden="true">{'{ }'}</span>
        {label}
        {explain && <span className={`plan-stage ${explain.stage === 'COLLSCAN' || explain.stage === 'UNKNOWN' ? '' : 'ix'}`}>{explain.stage}</span>}
      </summary>
      <pre>{text}</pre>
      {explain && <ExplainStats explain={explain} />}
    </details>
  );
}

function ExplainStats({ explain: e }) {
  const line = (p) => `${fmtNum(p.totalDocsExamined)} docs examined · ${fmtNum(p.totalKeysExamined)} keys · ${fmtNum(p.nReturned)} returned · ${p.executionTimeMillis} ms`;
  return (
    <div className="explain-mini small">
      <p>
        <strong>explain():</strong> <span className={`plan-stage ${e.stage === 'COLLSCAN' ? '' : 'ix'}`}>{e.stage}{e.indexUsed ? ` (${e.indexUsed})` : ''}</span>{' '}
        <span className="mono">{line(e)}</span>
      </p>
      {e.collscan && (
        <p>
          <strong>Without the index:</strong> <span className="plan-stage">COLLSCAN</span>{' '}
          <span className="mono">{line(e.collscan)}</span>
          {e.totalDocs ? <span className="muted"> of {fmtNum(e.totalDocs)} laps</span> : null}
        </p>
      )}
    </div>
  );
}
