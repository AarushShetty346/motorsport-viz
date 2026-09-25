// Motorsport Lap by Lap Visualiser — frontend (plain JS, no build step).
'use strict';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

// ------------------------------------------------------------------ helpers

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.payload = data;
    throw err;
  }
  return data;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// 81.452 -> "1:21.452"
function fmtLap(sec) {
  if (typeof sec !== 'number' || !Number.isFinite(sec)) return '—';
  const m = Math.floor(sec / 60);
  const s = (sec - m * 60).toFixed(3).padStart(6, '0');
  return m > 0 ? `${m}:${s}` : Number(sec).toFixed(3);
}
const fmtNum = (n, d = 0) => (typeof n === 'number' ? n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
const fmtGap = (g) => (g === 0 ? 'Leader' : `+${g.toFixed(3)}s`);

function driverCell(driver) {
  if (!driver) return '<span class="muted">unknown driver</span>';
  return `<span class="driver-cell"><span class="car-no">${esc(driver.number)}</span><span>${esc(driver.name)} <span class="team">${esc(driver.team)}</span></span></span>`;
}

// A horizontal data bar: length encodes value / max from a zero baseline.
function bar(value, max, label, cls = '') {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return `<div class="bar" title="${esc(label)}"><span class="bar-track"><span class="bar-fill ${cls}" style="width:${pct}%"></span></span><span class="bar-label">${esc(label)}</span></div>`;
}

function showError(target, err) {
  target.innerHTML = `<div class="msg msg-err">${esc(err.message)}</div>`;
}

async function withBusy(button, fn) {
  if (button) button.disabled = true;
  try { await fn(); } finally { if (button) button.disabled = false; }
}

function setQuery(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text || '';
}

// Raw JSON renderer in mongosh style: ObjectIds shown as ObjectId("..."),
// with the embedded telemetry object and the driverId reference highlighted.
const OID_KEYS = new Set(['_id', 'driverId']);
function renderJson(value, { highlight = true, indent = 0, key = null } = {}) {
  const pad = '  '.repeat(indent);
  const inner = '  '.repeat(indent + 1);
  if (value === null) return '<span class="j-num">null</span>';
  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    return '[\n' + value.map((v) => inner + renderJson(v, { highlight, indent: indent + 1 })).join(',\n') + '\n' + pad + ']';
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value);
    if (!entries.length) return '{}';
    const lines = entries.map(([k, v]) => {
      let line = `<span class="j-key">${esc(k)}</span>: ` + renderJson(v, { highlight, indent: indent + 1, key: k });
      // Rendered at indent 0 so its lines align relative to the inline-block highlight box.
      if (highlight && k === 'telemetry' && v && typeof v === 'object') {
        line = `<span class="hl-embed" title="Embedded sub-document"><span class="j-key">${esc(k)}</span>: ${renderJson(v, { highlight, indent: 0, key: k })}</span>`;
      }
      if (highlight && k === 'driverId') line = `<span class="hl-ref" title="Reference to drivers._id">${line}</span>`;
      return inner + line;
    });
    return '{\n' + lines.join(',\n') + '\n' + pad + '}';
  }
  if (typeof value === 'string') {
    if (OID_KEYS.has(key) && /^[a-f0-9]{24}$/i.test(value)) return `<span class="j-oid">ObjectId("${esc(value)}")</span>`;
    return `<span class="j-str">"${esc(value)}"</span>`;
  }
  return `<span class="j-num">${esc(String(value))}</span>`;
}

// Turns MongoDB's errInfo (DocumentValidationFailure) into readable bullet points.
function summarizeValidation(errInfo) {
  const out = [];
  const walk = (node, prefix) => {
    if (Array.isArray(node)) return node.forEach((n) => walk(n, prefix));
    if (!node || typeof node !== 'object') return;
    if (node.missingProperties) {
      const names = node.missingProperties.map((p) => `<code>${esc(prefix + p)}</code>`).join(', ');
      out.push(`Missing required field${node.missingProperties.length > 1 ? 's' : ''}: ${names}`);
    }
    if (node.propertiesNotSatisfied) {
      for (const p of node.propertiesNotSatisfied) walk(p.details, prefix + p.propertyName + '.');
    }
    if (node.reason) {
      const field = prefix.replace(/\.$/, '') || 'document';
      let detail = '';
      if (node.operatorName === 'bsonType' || node.operatorName === 'type') {
        const expected = [].concat(node.specifiedAs?.bsonType ?? node.specifiedAs?.type ?? []).join(' / ');
        detail = ` — expected <code>${esc(expected)}</code>, got ${esc(node.consideredType)} <code>${esc(JSON.stringify(node.consideredValue))}</code>`;
      } else if (node.specifiedAs) {
        detail = ` — rule <code>${esc(JSON.stringify(node.specifiedAs))}</code>, value <code>${esc(JSON.stringify(node.consideredValue))}</code>`;
      }
      out.push(`<code>${esc(field)}</code>: ${esc(node.reason)}${detail}`);
    }
    if (node.schemaRulesNotSatisfied) walk(node.schemaRulesNotSatisfied, prefix);
    if (node.details && !node.propertiesNotSatisfied) walk(node.details, prefix);
  };
  walk(errInfo?.details, '');
  return out;
}

function validationErrorHtml(payload) {
  const m = payload.mongoError || {};
  const items = summarizeValidation(m.errInfo);
  return `
    <div class="err-banner">
      <strong>${esc(m.name || 'MongoServerError')}: ${esc(m.errmsg || payload.error)}</strong>
      <div class="muted">code <code>${esc(m.code)}</code> · codeName <code>${esc(m.codeName)}</code></div>
      ${items.length ? `<ul class="err-list">${items.map((i) => `<li>${i}</li>`).join('')}</ul>` : ''}
    </div>`;
}

// Sections that have been run are re-run after data changes so the dashboard stays live.
const liveSections = new Map();
function remember(name, fn) { liveSections.set(name, fn); }
async function refreshLiveSections() {
  await Promise.allSettled(Array.from(liveSections.values()).map((fn) => fn()));
}

// ------------------------------------------------------------------ laps table

function lapsTable(laps, { actions = false, score = false } = {}) {
  if (!laps.length) return '<div class="table-wrap"><div class="empty">No laps found.</div></div>';
  const rows = laps.map((l) => {
    const t = l.telemetry || {};
    return `<tr data-id="${esc(l._id)}">
      <td>${driverCell(l.driver)}</td>
      <td>${esc(l.circuit ?? '—')}</td>
      <td class="num">${esc(l.lapNumber)}</td>
      <td class="num"><strong>${fmtLap(l.lapTime)}</strong></td>
      <td class="num">${fmtNum(t.speed, 1)}</td>
      <td class="num">${fmtNum(t.rpm)}</td>
      <td class="bar-cell">${bar(t.throttle, 100, `${fmtNum(t.throttle, 1)}%`)}</td>
      <td class="bar-cell">${bar(t.brake, 100, `${fmtNum(t.brake, 1)}%`, 'brake')}</td>
      ${score ? `<td class="num">${fmtNum(l.score, 2)}</td>` : ''}
      ${actions ? `<td><button class="btn-link edit" data-action="edit" type="button">Edit</button><button class="btn-link delete" data-action="delete" type="button">Delete</button></td>` : ''}
    </tr>`;
  });
  return `<div class="table-wrap"><table>
    <thead><tr>
      <th>Driver</th><th>Circuit</th><th class="num">Lap</th><th class="num">Lap time</th>
      <th class="num">Top speed km/h</th><th class="num">Peak RPM</th><th>Throttle</th><th>Braking</th>
      ${score ? '<th class="num">textScore</th>' : ''}
      ${actions ? '<th>Actions</th>' : ''}
    </tr></thead>
    <tbody>${rows.join('')}</tbody></table></div>`;
}

// ------------------------------------------------------------------ header

let drivers = [];

async function checkHealth() {
  const pill = $('#db-status');
  try {
    const h = await api('/api/health');
    pill.className = 'status-pill status-ok';
    pill.textContent = `MongoDB connected · ${h.db}`;
  } catch (err) {
    pill.className = 'status-pill status-bad';
    pill.textContent = 'MongoDB unreachable';
  }
}

async function loadDrivers() {
  drivers = await api('/api/drivers');
  for (const sel of $$('.driver-select')) {
    const prev = sel.value;
    const placeholder = sel.dataset.placeholder ? `<option value="">${esc(sel.dataset.placeholder)}</option>` : '';
    sel.innerHTML = placeholder + drivers.map((d) => `<option value="${esc(d._id)}">#${esc(d.number)} ${esc(d.name)} (${esc(d.team)})</option>`).join('');
    if (prev && drivers.some((d) => d._id === prev)) sel.value = prev;
  }
  if (drivers.length > 1 && $('#uf2-a').value === $('#uf2-b').value) $('#uf2-b').value = drivers[1]._id;
}

// ------------------------------------------------ NoSQL Functionality 1: CRUD

let currentLaps = [];

async function loadLaps() {
  const target = $('#laps-table');
  try {
    const data = await api('/api/laps');
    currentLaps = data.results;
    target.innerHTML = lapsTable(currentLaps, { actions: true });
    $('#laps-count').textContent = `(${currentLaps.length} documents)`;
    $('#db-counts').textContent = `${drivers.length} drivers · ${currentLaps.length} laps`;
    setQuery('laps-query', data.query);
  } catch (err) {
    showError(target, err);
  }
}

function formBody(form) {
  const f = new FormData(form);
  const v = (k) => f.get(k)?.toString().trim() ?? '';
  return {
    driverId: v('driverId'),
    circuit: v('circuit'),
    lapNumber: v('lapNumber'),
    lapTime: v('lapTime'),
    telemetry: { speed: v('speed'), rpm: v('rpm'), throttle: v('throttle'), brake: v('brake') },
  };
}

function setEditMode(lap) {
  const form = $('#lap-form');
  form.classList.toggle('editing', !!lap);
  $('#lap-submit').textContent = lap ? 'Update lap' : 'Insert lap';
  $('#lap-cancel').hidden = !lap;
  form.elements.id.value = lap ? lap._id : '';
  if (lap) {
    const t = lap.telemetry || {};
    form.elements.driverId.value = lap.driverId;
    form.elements.circuit.value = lap.circuit ?? '';
    form.elements.lapNumber.value = lap.lapNumber ?? '';
    form.elements.lapTime.value = lap.lapTime ?? '';
    form.elements.speed.value = t.speed ?? '';
    form.elements.rpm.value = t.rpm ?? '';
    form.elements.throttle.value = t.throttle ?? '';
    form.elements.brake.value = t.brake ?? '';
    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } else {
    const driverId = form.elements.driverId.value;
    form.reset();
    form.elements.driverId.value = driverId;
  }
}

function fillSample() {
  const form = $('#lap-form');
  const circuit = form.elements.circuit.value || (Math.random() < 0.5 ? 'Monza' : 'Silverstone');
  const monza = /monza/i.test(circuit);
  const r = (a, b, d = 1) => Number((a + Math.random() * (b - a)).toFixed(d));
  const driverId = form.elements.driverId.value;
  const maxLap = Math.max(0, ...currentLaps.filter((l) => l.driverId === driverId && l.circuit === circuit).map((l) => l.lapNumber));
  form.elements.circuit.value = circuit;
  form.elements.lapNumber.value = maxLap + 1;
  form.elements.lapTime.value = monza ? r(80.8, 82.2, 3) : r(87.8, 89.4, 3);
  form.elements.speed.value = monza ? r(344, 354) : r(316, 327);
  form.elements.rpm.value = Math.round(r(11750, 12050, 0));
  form.elements.throttle.value = monza ? r(79.5, 82.5) : r(69.5, 73);
  form.elements.brake.value = monza ? r(10.5, 12) : r(13, 15);
}

async function submitLap(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const msg = $('#crud-msg');
  const id = form.elements.id.value;
  await withBusy($('#lap-submit'), async () => {
    try {
      const body = formBody(form);
      const data = id ? await api(`/api/laps/${id}`, { method: 'PUT', body }) : await api('/api/laps', { method: 'POST', body });
      msg.className = 'msg msg-ok';
      msg.innerHTML = id
        ? `Lap updated (<code>replaceOne</code>, modifiedCount: ${esc(data.modifiedCount)}).`
        : `Lap inserted with <code>_id: ObjectId("${esc(data.insertedId)}")</code>.`;
      setEditMode(null);
      await loadLaps();
      await refreshLiveSections();
    } catch (err) {
      msg.className = 'msg msg-err';
      msg.innerHTML = err.payload?.mongoError ? `Insert rejected by MongoDB.${validationErrorHtml(err.payload)}` : esc(err.message);
    }
  });
}

async function onLapsTableClick(e) {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const id = btn.closest('tr').dataset.id;
  const msg = $('#crud-msg');
  if (btn.dataset.action === 'edit') {
    setEditMode(currentLaps.find((l) => l._id === id));
    msg.className = 'msg';
    msg.textContent = '';
    return;
  }
  await withBusy(btn, async () => {
    try {
      const data = await api(`/api/laps/${id}`, { method: 'DELETE' });
      msg.className = 'msg msg-ok';
      msg.innerHTML = `Deleted lap <code>${esc(id)}</code> (<code>${esc(data.query)}</code>).`;
      if ($('#lap-form').elements.id.value === id) setEditMode(null);
      await loadLaps();
      await refreshLiveSections();
    } catch (err) {
      msg.className = 'msg msg-err';
      msg.textContent = err.message;
    }
  });
}

// ---------------------------------- NoSQL Functionality 2: Aggregation Pipeline

async function runAggregation() {
  const target = $('#agg-result');
  try {
    const data = await api('/api/nosql/aggregation');
    setQuery('agg-query', data.query);
    const rows = data.results;
    if (!rows.length) return (target.innerHTML = '<div class="table-wrap"><div class="empty">No laps to aggregate.</div></div>');
    const best = Math.min(...rows.map((r) => r.avgLapTime));
    const maxGap = Math.max(...rows.map((r) => r.avgLapTime - best), 0.001);
    target.innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th class="num">#</th><th>Driver</th><th class="num">Laps</th><th class="num">Average lap ($avg)</th><th class="num">Fastest lap ($min)</th><th>Avg gap to best average</th></tr></thead>
      <tbody>${rows.map((r, i) => `<tr>
        <td class="num pos ${i === 0 ? 'pos-1' : ''}">${i + 1}</td>
        <td>${driverCell(r)}</td>
        <td class="num">${r.laps}</td>
        <td class="num"><strong>${fmtLap(r.avgLapTime)}</strong></td>
        <td class="num">${fmtLap(r.fastestLap)}</td>
        <td class="bar-cell">${bar(r.avgLapTime - best, maxGap, fmtGap(r.avgLapTime - best))}</td>
      </tr>`).join('')}</tbody></table></div>
      <p class="explain-note">Averages mix every circuit a driver has laps at, so a driver with more Silverstone laps (a longer lap) averages slower.</p>`;
  } catch (err) {
    showError(target, err);
  }
}

// ------------------------------------------------ NoSQL Functionality 3: Indexing

function describeIndex(ix) {
  if (ix.name === '_id_') return ['Default', 'Created automatically on every collection; enforces unique _id.'];
  if (ix.weights) return ['Text', `Full-text index on ${Object.keys(ix.weights).join(', ')} (language: ${ix.default_language}). Powers $text search.`];
  const keys = Object.keys(ix.key);
  if (keys.length > 1) return ['Compound', `Sorted on ${keys.join(' then ')}. Serves queries on driverId alone or driverId + lapNumber.`];
  return ['Single field', `Index on ${keys[0]}.`];
}

function planStages(plan) {
  const stages = [];
  let node = plan?.queryPlan || plan;
  while (node) {
    stages.push(node);
    node = node.inputStage || (node.inputStages && node.inputStages[0]);
  }
  return stages;
}

async function runIndexes() {
  const target = $('#idx-result');
  try {
    const data = await api('/api/nosql/indexes');
    const cards = data.results.map((ix) => {
      const [kind, text] = describeIndex(ix);
      return `<div class="index-card"><span class="kind">${esc(kind)}</span><h5>${esc(ix.name)}</h5><p>${esc(text)}</p><code>${esc(JSON.stringify(ix.key))}</code></div>`;
    }).join('');
    let explainHtml = '';
    if (data.explain) {
      const stages = planStages(data.explain.winningPlan);
      explainHtml = `
        <h4 class="sub-h">Proof the compound index is used</h4>
        <pre>${esc(data.explain.query)}</pre>
        <div class="plan">winningPlan: ${stages.map((s) => `<span class="plan-stage ${s.stage === 'IXSCAN' ? 'ix' : ''}">${esc(s.stage)}${s.indexName ? ` (${esc(s.indexName)})` : ''}</span>`).join(' ← ')}</div>
        <p class="explain-note">${data.explain.indexUsed ? `✓ MongoDB chose an <strong>IXSCAN</strong> on <code>${esc(data.explain.indexUsed)}</code> instead of a full collection scan (COLLSCAN).` : 'No index used for this query.'}</p>`;
    }
    target.innerHTML = `<div class="index-grid">${cards}</div>
      <h4 class="sub-h">Raw output of <code>${esc(data.query)}</code></h4>
      <pre class="json tall">${renderJson(data.results, { highlight: false })}</pre>
      ${explainHtml}`;
  } catch (err) {
    showError(target, err);
  }
}

// ---------------------------------------- NoSQL Functionality 4: Schema Validation

async function runInvalidInsert() {
  const target = $('#val-result');
  try {
    const data = await api('/api/nosql/invalid-insert', { method: 'POST' });
    target.innerHTML = `
      ${validationErrorHtml(data)}
      <div class="two-col">
        <div><h4 class="sub-h">Attempted insert</h4><pre>${esc(data.query)}</pre></div>
        <div><h4 class="sub-h">errInfo returned by MongoDB</h4><pre class="json tall">${renderJson(data.mongoError.errInfo, { highlight: false })}</pre></div>
      </div>
      <details class="query"><summary>The collection's $jsonSchema validator (db.getCollectionInfos({ name: "laps" }))</summary><pre class="json">${renderJson(data.validator, { highlight: false })}</pre></details>`;
  } catch (err) {
    showError(target, err);
  }
}

// ---------------------------- NoSQL Functionality 5: Embedded Documents & Referencing

async function runEmbedded() {
  const target = $('#emb-result');
  try {
    const data = await api('/api/nosql/embedded');
    const d = data.referencedDriver;
    target.innerHTML = `
      <div class="legend"><span><span class="sw sw-embed"></span>Embedded sub-document (stored inside the lap)</span><span><span class="sw sw-ref"></span>Reference (points to another collection)</span></div>
      <div class="two-col">
        <div>
          <h4 class="sub-h"><code>laps</code> document</h4>
          <pre class="json">${renderJson(data.lap)}</pre>
        </div>
        <div>
          <h4 class="sub-h">Referenced <code>drivers</code> document</h4>
          <pre class="json">${d ? renderJson(d, { highlight: false }).replace(/(<span class="j-key">_id<\/span>: <span class="j-oid">[^<]+<\/span>)/, '<span class="hl-ref">$1</span>') : 'Driver not found (dangling reference)'}</pre>
          <p class="explain-note"><span class="hl-ref-key">laps.driverId</span> = <span class="hl-ref-key">drivers._id</span>. The driver is stored once and referenced by many laps (one-to-many), and is joined at query time with <code>$lookup</code>. The <span class="hl-embed-key">telemetry</span> object belongs to exactly one lap, so it is embedded and read in the same fetch — no join needed.</p>
        </div>
      </div>
      <details class="query"><summary>MongoDB query</summary><pre>${esc(data.query)}</pre></details>`;
  } catch (err) {
    showError(target, err);
  }
}

// ------------------------------------------------ User Functionality 1

async function runDriverLaps() {
  const id = $('#uf1-driver').value;
  const target = $('#uf1-result');
  if (!id) { target.innerHTML = ''; setQuery('uf1-query', ''); return; }
  try {
    const data = await api(`/api/user/driver-laps/${id}`);
    const laps = data.results.map((l) => ({ ...l, driver: data.driver }));
    const best = laps.length ? laps.reduce((a, b) => (a.lapTime <= b.lapTime ? a : b)) : null;
    target.innerHTML = `<p class="desc">${driverCell(data.driver)} ${laps.length} lap${laps.length === 1 ? '' : 's'}${best ? ` · personal best <strong>${fmtLap(best.lapTime)}</strong> at ${esc(best.circuit)}` : ''}</p>` + lapsTable(laps);
    setQuery('uf1-query', data.query);
  } catch (err) {
    showError(target, err);
  }
}

// ------------------------------------------------ User Functionality 2

async function runCompare() {
  const a = $('#uf2-a').value;
  const b = $('#uf2-b').value;
  const target = $('#uf2-result');
  if (a === b) return (target.innerHTML = '<div class="msg msg-err">Pick two different drivers.</div>');
  try {
    const data = await api(`/api/user/compare?a=${a}&b=${b}`);
    setQuery('uf2-query', data.query);
    const [A, B] = data.results;
    const avgA = A.stats?.avgLapTime;
    const avgB = B.stats?.avgLapTime;
    const both = typeof avgA === 'number' && typeof avgB === 'number';
    const verdict = (mine, theirs) => {
      if (!both) return '';
      if (mine === theirs) return '<div class="verdict">Dead heat</div>';
      const d = Math.abs(mine - theirs).toFixed(3);
      return mine < theirs ? `<div class="verdict faster">▲ Faster by ${d}s</div>` : `<div class="verdict slower">▼ Slower by ${d}s</div>`;
    };
    const card = (side, cls, avg, other) => `
      <div class="h2h-card ${cls}">
        <div class="name"><span class="series-dot"></span>${driverCell(side.driver)}</div>
        <div class="big">${typeof avg === 'number' ? fmtLap(avg) : '—'}</div>
        <div class="caption">average lap · ${side.stats ? side.stats.laps : 0} laps</div>
        ${typeof avg === 'number' ? verdict(avg, other) : '<div class="verdict">No laps recorded</div>'}
      </div>`;
    const circuits = [...new Set([...(A.stats?.perCircuit || []), ...(B.stats?.perCircuit || [])].map((c) => c.circuit))].sort();
    const per = (s, c) => s.stats?.perCircuit.find((p) => p.circuit === c);
    const rows = circuits.map((c) => {
      const pa = per(A, c);
      const pb = per(B, c);
      const delta = pa && pb ? pa.avgLapTime - pb.avgLapTime : null;
      const deltaTxt = delta === null ? '<span class="muted">n/a</span>' : delta === 0 ? 'level' : `${delta < 0 ? esc(A.driver.name) : esc(B.driver.name)} by ${Math.abs(delta).toFixed(3)}s`;
      return `<tr><td>${esc(c ?? '—')}</td><td class="num">${pa ? `${fmtLap(pa.avgLapTime)} <span class="muted">(${pa.laps})</span>` : '—'}</td><td class="num">${pb ? `${fmtLap(pb.avgLapTime)} <span class="muted">(${pb.laps})</span>` : '—'}</td><td>${deltaTxt}</td></tr>`;
    });
    target.innerHTML = `
      <div class="h2h">${card(A, 'a', avgA, avgB)}<div class="h2h-mid">VS</div>${card(B, 'b', avgB, avgA)}</div>
      ${rows.length ? `<h4 class="sub-h">Per circuit (like-for-like)</h4>
      <div class="table-wrap"><table><thead><tr><th>Circuit</th><th class="num">${esc(A.driver.name)} avg (laps)</th><th class="num">${esc(B.driver.name)} avg (laps)</th><th>Faster</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>` : ''}`;
  } catch (err) {
    showError(target, err);
  }
}

// ------------------------------------------------ User Functionality 3

async function runLeaderboard() {
  const target = $('#uf3-result');
  try {
    const data = await api('/api/user/leaderboard');
    setQuery('uf3-query', data.query);
    const rows = data.results;
    if (!rows.length) return (target.innerHTML = '<div class="table-wrap"><div class="empty">No laps yet.</div></div>');
    const leader = rows[0].lapTime;
    const maxGap = Math.max(...rows.map((r) => r.lapTime - leader), 0.001);
    target.innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th class="num">Pos</th><th>Driver</th><th class="num">Fastest lap</th><th>Circuit</th><th class="num">Lap</th><th class="num">Top speed</th><th>Gap to leader</th></tr></thead>
      <tbody>${rows.map((r, i) => `<tr>
        <td class="num pos ${i === 0 ? 'pos-1' : ''}">P${i + 1}</td>
        <td>${driverCell(r)}</td>
        <td class="num"><strong>${fmtLap(r.lapTime)}</strong></td>
        <td>${esc(r.circuit ?? '—')}</td>
        <td class="num">${esc(r.lapNumber)}</td>
        <td class="num">${fmtNum(r.topSpeed, 1)} km/h</td>
        <td class="bar-cell">${bar(r.lapTime - leader, maxGap, fmtGap(r.lapTime - leader))}</td>
      </tr>`).join('')}</tbody></table></div>`;
  } catch (err) {
    showError(target, err);
  }
}

// ------------------------------------------------ User Functionality 4

async function runSpeed() {
  const min = $('#uf4-min').value;
  const target = $('#uf4-result');
  try {
    const data = await api(`/api/user/speed?min=${encodeURIComponent(min)}`);
    setQuery('uf4-query', data.query);
    target.innerHTML = `<p class="desc"><strong>${data.results.length}</strong> lap${data.results.length === 1 ? '' : 's'} with a top speed above ${esc(min)} km/h.</p>` + lapsTable(data.results);
  } catch (err) {
    showError(target, err);
  }
}

// ------------------------------------------------ User Functionality 5

async function runSearch() {
  const q = $('#uf5-q').value;
  const target = $('#uf5-result');
  try {
    const data = await api(`/api/user/search?q=${encodeURIComponent(q)}`);
    setQuery('uf5-query', data.query);
    target.innerHTML = `<p class="desc"><strong>${data.results.length}</strong> lap${data.results.length === 1 ? '' : 's'} matching “${esc(q)}”.</p>` + lapsTable(data.results, { score: true });
  } catch (err) {
    showError(target, err);
  }
}

// ------------------------------------------------------------------ wiring

function bindButton(sel, name, fn) {
  $(sel).addEventListener('click', (e) => withBusy(e.currentTarget, async () => { await fn(); remember(name, fn); }));
}

function bindForm(sel, name, fn) {
  $(sel).addEventListener('submit', (e) => {
    e.preventDefault();
    withBusy(e.currentTarget.querySelector('button[type=submit]'), async () => { await fn(); remember(name, fn); });
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  $('#lap-form').addEventListener('submit', submitLap);
  $('#lap-cancel').addEventListener('click', () => setEditMode(null));
  $('#lap-sample').addEventListener('click', fillSample);
  $('#laps-table').addEventListener('click', onLapsTableClick);

  bindButton('#agg-btn', 'agg', runAggregation);
  bindButton('#idx-btn', 'idx', runIndexes);
  bindButton('#val-btn', 'val', runInvalidInsert);
  bindButton('#emb-btn', 'emb', runEmbedded);
  $('#uf1-driver').addEventListener('change', async () => { await runDriverLaps(); remember('uf1', runDriverLaps); });
  bindButton('#uf2-btn', 'uf2', runCompare);
  bindButton('#uf3-btn', 'uf3', runLeaderboard);
  bindForm('#uf4-form', 'uf4', runSpeed);
  bindForm('#uf5-form', 'uf5', runSearch);

  $('#reset-btn').addEventListener('click', (e) => withBusy(e.currentTarget, async () => {
    const msg = $('#crud-msg');
    try {
      const r = await api('/api/reset', { method: 'POST' });
      await loadDrivers();
      setEditMode(null);
      await loadLaps();
      await refreshLiveSections();
      msg.className = 'msg msg-ok';
      msg.textContent = `Demo data reset: ${r.drivers} drivers and ${r.laps} laps re-seeded.`;
    } catch (err) {
      msg.className = 'msg msg-err';
      msg.textContent = err.message;
    }
  }));

  await checkHealth();
  try {
    await loadDrivers();
  } catch (err) {
    showError($('#laps-table'), err);
    return;
  }
  await loadLaps();
});
