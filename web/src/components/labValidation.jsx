// Turns MongoDB's errInfo (DocumentValidationFailure) into readable points.
export function summarizeValidation(errInfo) {
  const out = [];
  const walk = (node, prefix) => {
    if (Array.isArray(node)) return node.forEach((n) => walk(n, prefix));
    if (!node || typeof node !== 'object') return;
    if (node.missingProperties) {
      out.push({ field: node.missingProperties.map((p) => prefix + p).join(', '), text: `missing required field${node.missingProperties.length > 1 ? 's' : ''}` });
    }
    if (node.propertiesNotSatisfied) for (const p of node.propertiesNotSatisfied) walk(p.details, prefix + p.propertyName + '.');
    if (node.reason) {
      const field = prefix.replace(/\.$/, '') || 'document';
      let detail = '';
      if (node.operatorName === 'bsonType' || node.operatorName === 'type') {
        const expected = [].concat(node.specifiedAs?.bsonType ?? node.specifiedAs?.type ?? []).join(' / ');
        detail = `expected ${expected}, got ${node.consideredType} ${JSON.stringify(node.consideredValue)}`;
      } else if (node.specifiedAs) {
        detail = `rule ${JSON.stringify(node.specifiedAs)}, value ${JSON.stringify(node.consideredValue)}`;
      }
      out.push({ field, text: node.reason + (detail ? ` (${detail})` : '') });
    }
    if (node.schemaRulesNotSatisfied) walk(node.schemaRulesNotSatisfied, prefix);
    if (node.details && !node.propertiesNotSatisfied) walk(node.details, prefix);
  };
  walk(errInfo?.details, '');
  return out;
}

export function ValidationError({ payload }) {
  const m = payload.mongoError || {};
  const items = summarizeValidation(m.errInfo);
  return (
    <div className="err-banner" role="alert">
      <p><strong>{m.name || 'MongoServerError'}: {m.errmsg || payload.error}</strong></p>
      <p className="mono small muted">code {m.code} · {m.codeName}</p>
      {!!items.length && (
        <ul>
          {items.map((i, n) => <li key={n}><code>{i.field}</code> {i.text}</li>)}
        </ul>
      )}
    </div>
  );
}
