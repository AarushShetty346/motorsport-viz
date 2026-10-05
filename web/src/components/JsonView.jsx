import { Link } from '../lib/router.jsx';

// mongosh-style JSON: ObjectIds shown as ObjectId("..."), with embedded
// documents (green) and references (purple) highlighted when asked.
// links maps a reference key to a page, which makes that value clickable.
const OID = /^[a-f0-9]{24}$/i;
const OID_KEYS = new Set(['_id', 'driverId', 'raceId']);

function Value({ value, k, indent, ctx }) {
  const pad = '  '.repeat(indent);
  const inner = '  '.repeat(indent + 1);
  if (value === null || value === undefined) return <span className="j-num">null</span>;
  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    return (
      <>
        {'[\n'}
        {value.map((v, i) => (
          <span key={i}>{inner}<Value value={v} indent={indent + 1} ctx={ctx} />{i < value.length - 1 ? ',\n' : '\n'}</span>
        ))}
        {pad + ']'}
      </>
    );
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value);
    if (!entries.length) return '{}';
    return (
      <>
        {'{\n'}
        {entries.map(([key, v], i) => {
          let line = (
            <>
              <span className="j-key">{key}</span>: <Value value={v} k={key} indent={indent + 1} ctx={ctx} />
            </>
          );
          if (ctx.embedKeys.has(key) && v && typeof v === 'object') line = <span className="hl-embed" title="Embedded document">{line}</span>;
          else if (ctx.refKeys.has(key)) line = <span className="hl-ref" title="Reference to another collection">{line}</span>;
          return <span key={key}>{inner}{line}{i < entries.length - 1 ? ',\n' : '\n'}</span>;
        })}
        {pad + '}'}
      </>
    );
  }
  if (typeof value === 'string') {
    if (OID_KEYS.has(k) && OID.test(value)) {
      const oid = <span className="j-oid">ObjectId("{value}")</span>;
      const to = ctx.links[k];
      return to ? <Link to={to} className="j-link" onClick={ctx.onNavigate}>{oid}</Link> : oid;
    }
    return <span className="j-str">"{value}"</span>;
  }
  return <span className="j-num">{String(value)}</span>;
}

export default function JsonView({ value, embed = [], refs = [], links = {}, onNavigate, className = '' }) {
  const ctx = { embedKeys: new Set(embed), refKeys: new Set(refs), links, onNavigate };
  return (
    <pre className={`json ${className}`} data-lenis-prevent>
      <Value value={value} indent={0} ctx={ctx} />
    </pre>
  );
}
