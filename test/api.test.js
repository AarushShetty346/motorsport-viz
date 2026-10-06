// End-to-end API tests: starts the real server against a throwaway database
// ("motorsport_test") on the local MongoDB, seeded with the real 2025 season,
// and exercises all 10 functionalities. Requires MongoDB (docker compose up -d mongo).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { MongoClient } = require('mongodb');

const PORT = 3999;
const BASE = `http://localhost:${PORT}`;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME = 'motorsport_test';
let server;

async function api(p, options = {}) {
  const res = await fetch(BASE + p, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  return { status: res.status, body: await res.json() };
}

async function dropTestDb() {
  const client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 3000 });
  await client.connect();
  await client.db(DB_NAME).dropDatabase();
  await client.close();
}

before(async () => {
  await dropTestDb();
  server = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: String(PORT), MONGO_URI, DB_NAME },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server did not start in 90s')), 90000);
    server.stdout.on('data', (d) => {
      if (d.toString().includes('running at')) { clearTimeout(timer); resolve(); }
    });
    server.on('exit', (code) => reject(new Error('server exited with code ' + code)));
  });
});

after(async () => {
  server?.kill('SIGTERM');
  await dropTestDb();
});

let driversByCode;
let totalLaps;

test('seed data: the 2025 season (24 races, full grid, every lap)', async () => {
  const { body: drivers } = await api('/api/drivers');
  assert.ok(drivers.length >= 20);
  driversByCode = Object.fromEntries(drivers.map((d) => [d.code, d]));
  assert.equal(driversByCode.NOR.name, 'Lando Norris');
  assert.equal(driversByCode.VER.number, 1);

  const { body: races } = await api('/api/races');
  assert.equal(races.length, 24);
  assert.equal(races[0].name, 'Australian Grand Prix');
  assert.equal(races[23].name, 'Abu Dhabi Grand Prix');
  assert.ok(races.every((r) => r.results.length >= 20 && r.track.x.length > 100));

  const { body: health } = await api('/api/health');
  totalLaps = health.counts.laps;
  assert.ok(totalLaps > 25000, `expected a full season of laps, got ${totalLaps}`);
});

test('NoSQL 1: CRUD — paginated read, insert, update, delete', async () => {
  const page = await api('/api/laps?round=16&limit=10');
  assert.equal(page.body.results.length, 10);
  assert.ok(page.body.total > 800);
  assert.ok(page.body.results.every((l) => l.round === 16 && l.driver.name));

  const lap = {
    driverId: driversByCode.LEC._id, round: 16, lapNumber: 60, lapTime: 80.5, position: 1,
    telemetry: { speed: 356, rpm: 12100, throttle: 83, brake: 10 },
  };
  const created = await api('/api/laps', { method: 'POST', body: lap });
  assert.equal(created.status, 201);
  assert.equal(created.body.document.circuit, 'Monza', 'raceId, race and circuit are filled in from the round');
  const id = created.body.insertedId;

  const updated = await api(`/api/laps/${id}`, { method: 'PUT', body: { lapTime: 80.4 } });
  assert.equal(updated.body.modifiedCount, 1);
  const mine = await api(`/api/laps?round=16&driverId=${lap.driverId}&limit=200`);
  assert.equal(mine.body.results.find((l) => l._id === id).lapTime, 80.4);

  const bad = await api('/api/laps', { method: 'POST', body: { driverId: lap.driverId, round: 16, lapNumber: 3 } });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.mongoError.code, 121);

  const unknownDriver = await api('/api/laps', { method: 'POST', body: { ...lap, driverId: '000000000000000000000000' } });
  assert.equal(unknownDriver.status, 400);

  assert.equal((await api(`/api/laps/${id}`, { method: 'DELETE' })).body.deletedCount, 1);
  assert.equal((await api(`/api/laps/${id}`, { method: 'DELETE' })).status, 404);
  assert.equal((await api('/api/health')).body.counts.laps, totalLaps);
});

test('NoSQL 2: aggregation — driver season stats ($group, $lookup)', async () => {
  const { body } = await api(`/api/drivers/${driversByCode.NOR._id}/stats`);
  assert.ok(body.query.includes('$group') && body.query.includes('$lookup'));
  assert.equal(body.result.name, 'Lando Norris');
  assert.ok(body.result.fastestLap <= body.result.avgLapTime && body.result.laps > 1000 && body.result.races === 24);
});
test('season standings from embedded results', async () => {
  const { body } = await api('/api/season/standings');
  const top3 = body.results.slice(0, 3).map((r) => [r.code, r.points]);
  assert.deepEqual(top3, [['NOR', 423], ['VER', 421], ['PIA', 410]]);
  const points = body.results.map((r) => r.points);
  assert.deepEqual(points, [...points].sort((a, b) => b - a));
  const nor = body.results[0];
  assert.equal(nor.starts, 24);
  assert.ok(nor.wins > 0 && nor.podiums >= nor.wins && nor.bestFinish === 1 && nor.avgFinish > 1);
});

test('NoSQL 3: indexes — explain shows IXSCAN on the compound indexes', async () => {
  const { body } = await api(`/api/user/driver-laps/${driversByCode.NOR._id}?round=16`);
  assert.equal(body.explain.stage, 'IXSCAN');
  assert.match(body.explain.indexUsed, /_lapNumber_1$/);
  assert.equal(body.explain.collscan.stage, 'COLLSCAN');
  assert.equal((await api('/api/user/leaderboard?round=abc')).status, 400);
});
test('NoSQL 4: schema validation rejects an invalid steward lap with code 121', async () => {
  const { status, body } = await api('/api/laps', { method: 'POST', body: { round: 16, lapNumber: 'three' } });
  assert.equal(status, 400);
  assert.equal(body.mongoError.code, 121);
  assert.equal(body.mongoError.errmsg, 'Document failed validation');
  const required = body.mongoError.errInfo.details.schemaRulesNotSatisfied.find((r) => r.operatorName === 'required');
  assert.deepEqual(required.missingProperties.sort(), ['driverId', 'lapTime']);
  const wrongType = body.mongoError.errInfo.details.schemaRulesNotSatisfied.find((r) => r.operatorName === 'properties');
  assert.ok(wrongType.propertiesNotSatisfied.some((p) => p.propertyName === 'telemetry'), 'empty telemetry is missing speed, rpm, throttle, brake');
  assert.ok(wrongType.propertiesNotSatisfied.some((p) => p.propertyName === 'lapNumber'));
  assert.equal((await api('/api/health')).body.counts.laps, totalLaps, 'invalid lap was not stored');
});

test('steward mode: added laps stay out of stats, real laps hide instead of delete, penalty is one transaction', async () => {
  // A steward lap faster than anything real must not top the leaderboard.
  const fake = { driverId: driversByCode.HAM._id, round: 16, lapNumber: 61, lapTime: 60.0, position: 1, telemetry: { speed: 399, rpm: 12000, throttle: 80, brake: 10 } };
  const created = await api('/api/laps', { method: 'POST', body: fake });
  assert.equal(created.body.document.source, 'steward');
  const board = await api('/api/user/leaderboard?round=16');
  assert.ok(board.body.results.every((r) => r.lapTime > 60));
  assert.ok((await api('/api/user/speed?min=398')).body.total === 0);
  const table = await api(`/api/laps?round=16&driverId=${fake.driverId}&limit=200`);
  assert.ok(table.body.results.some((l) => l._id === created.body.insertedId), 'steward laps still appear in the lap table');

  // Real laps: DELETE is refused, hide/restore with $set works.
  const real = (await api('/api/laps?round=16&limit=1')).body.results[0];
  assert.equal((await api(`/api/laps/${real._id}`, { method: 'DELETE' })).status, 403);
  await api(`/api/laps/${real._id}/hidden`, { method: 'PATCH', body: { hidden: true } });
  assert.ok(!(await api(`/api/races/16/laps`)).body.results.some((l) => l._id === real._id));
  assert.ok((await api('/api/laps?round=16&limit=200&steward=1')).body.results.some((l) => l._id === real._id && l.deleted));
  const restored = await api('/api/races/16/restore', { method: 'POST' });
  assert.ok(restored.body.modifiedCount >= 1);

  // Penalty: lap time and the race result change together.
  const health = (await api('/api/health')).body;
  if (health.transactions) {
    const pen = await api(`/api/laps/${real._id}/penalty`, { method: 'POST', body: { seconds: 5 } });
    assert.equal(pen.status, 200);
    const after = (await api(`/api/laps/${real._id}`)).body.lap;
    assert.ok(Math.abs(after.lapTime - (real.lapTime + 5)) < 1e-9);
    assert.equal(after.stewardEdited, true);
    const race = (await api('/api/races/16')).body;
    assert.equal(race.results.find((r) => r.driverId === real.driverId).penaltySeconds, 5);
  }
  assert.equal((await api(`/api/laps/${created.body.insertedId}`, { method: 'DELETE' })).body.deletedCount, 1);
});

test('NoSQL 5: a lap document embeds telemetry and references its driver and race', async () => {
  const first = (await api('/api/laps?round=16&limit=1')).body.results[0];
  const { body } = await api(`/api/laps/${first._id}`);
  for (const k of ['speed', 'rpm', 'throttle', 'brake']) assert.equal(typeof body.lap.telemetry[k], 'number');
  assert.equal(body.lap.driverId, first.driverId);
  assert.equal((await api(`/api/races/16`)).body._id, body.lap.raceId);
});

test('NoSQL 7-9 and User 6-10: race analytics, driver and team features, geospatial', async () => {
  const numbers = (await api('/api/races/16/numbers')).body;
  assert.ok(numbers.query.includes('$facet') && numbers.query.includes('$bucket'));
  assert.ok(numbers.histogram.length > 3 && numbers.compounds.length > 1 && numbers.summary.laps > 800);
  const gaps = (await api('/api/races/16/gaps')).body;
  assert.ok(gaps.query.includes('$setWindowFields'));
  assert.ok(gaps.results.every((d) => d.gaps.every((g) => g.gap >= 0)));
  assert.ok((await api('/api/races/16/stints')).body.results.length >= 18);
  assert.ok((await api('/api/races/16/pitstops')).body.results.every((r) => r.stops > 0));
  assert.ok((await api('/api/movers?round=16')).body.results.length > 10);
  const th = (await api(`/api/drivers/${driversByCode.NOR._id}/theoretical?round=16`)).body.result;
  assert.ok(th.theoretical <= th.fastest);
  assert.ok((await api('/api/teams/McLaren/degradation')).body.results.length > 10);
  const near = (await api('/api/races/16/nearby')).body.results;
  assert.equal(near[0].circuit, 'Enzo e Dino Ferrari');
});
test('User 1: laps for one driver (whole season and one race)', async () => {
  const all = await api(`/api/user/driver-laps/${driversByCode.NOR._id}`);
  assert.ok(all.body.results.length > 1000);
  assert.ok(all.body.results.every((l) => l.driverId === driversByCode.NOR._id));
  assert.match(all.body.query, /sort\(\{ circuit: 1, lapNumber: 1 \}\)/);
  const keys = all.body.results.map((l) => [l.circuit, l.lapNumber]);
  assert.deepEqual(keys, [...keys].sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : x[1] - y[1])));
  const monza = await api(`/api/user/driver-laps/${driversByCode.NOR._id}?round=16`);
  assert.ok(monza.body.results.length >= 50 && monza.body.results.every((l) => l.round === 16));
  assert.equal((await api('/api/user/driver-laps/not-an-id')).status, 400);
});

test('User 2: compare two drivers race by race', async () => {
  const a = driversByCode.NOR._id;
  const b = driversByCode.PIA._id;
  const { body } = await api(`/api/user/compare?a=${a}&b=${b}`);
  assert.equal(body.results[0].driver.code, 'NOR');
  assert.equal(body.results[1].driver.code, 'PIA');
  assert.ok(body.results[0].stats.perRace.length >= 20);
  assert.ok(body.results[0].stats.perRace.every((r) => r.circuit));
  assert.match(body.query, /\$match[\s\S]*\$in[\s\S]*\$group/);
  assert.ok(body.duel.length >= 20);
  assert.equal((await api('/api/user/compare?a=x&b=y')).status, 400);
});

test('User 3: fastest lap leaderboard over all laps and for one race', async () => {
  const all = (await api('/api/user/leaderboard')).body;
  assert.ok(all.results.length >= 20);
  assert.ok(all.results.every((r) => r.circuit && r.lapNumber && r.topSpeed));
  const allTimes = all.results.map((r) => r.lapTime);
  assert.deepEqual(allTimes, [...allTimes].sort((x, y) => x - y));

  const { body } = await api('/api/user/leaderboard?round=16');
  assert.ok(body.results.length >= 18);
  const times = body.results.map((r) => r.lapTime);
  assert.deepEqual(times, [...times].sort((x, y) => x - y));
  assert.ok(times[0] > 78 && times[0] < 85, 'Monza race pace is around 1:20-1:22');
  assert.equal((await api('/api/user/leaderboard?round=abc')).status, 400);
});

test('race laps use the { round, lapNumber } index and skip hidden laps', async () => {
  const { body } = await api('/api/races/16/laps');
  assert.equal(body.explain.stage, 'IXSCAN');
  assert.equal(body.explain.indexUsed, 'round_1_lapNumber_1');
  // Hidden laps are fetched by the index then filtered, so docs examined is the round's laps, not the whole collection.
  assert.ok(body.explain.totalDocsExamined >= body.results.length && body.explain.totalDocsExamined < totalLaps / 10);
  assert.equal(body.explain.collscan.stage, 'COLLSCAN');
  assert.equal(body.explain.collscan.totalDocsExamined, totalLaps);
  assert.ok(body.results.every((l) => !l.deleted));
});

test('User 4: laps above a speed threshold (dot notation)', async () => {
  const { body } = await api('/api/user/speed?min=350');
  assert.ok(body.total > 0);
  assert.ok(body.results.every((l) => l.telemetry.speed > 350 && l.driver.name));
  const all = await api('/api/user/speed?min=0&limit=1');
  assert.ok(all.body.total > totalLaps * 0.98 && all.body.total <= totalLaps);
  const monza = await api('/api/user/speed?min=300&round=16');
  assert.ok(monza.body.results.every((l) => l.round === 16));
  assert.equal((await api('/api/user/speed?min=abc')).status, 400);
});

test('User 5: text search on circuit', async () => {
  const monza = (await api('/api/user/search?q=monza')).body.results;
  assert.equal(monza.length, 1);
  assert.equal(monza[0].race, 'Italian Grand Prix');
  assert.equal((await api('/api/user/search?q=MONZA')).body.results.length, 1, 'case-insensitive');
  assert.equal((await api('/api/user/search?q=monza%20silverstone')).body.results.length, 2);
  assert.equal((await api('/api/user/search?q=nurburgring')).body.results.length, 0);
  assert.equal((await api('/api/user/search?q=')).status, 400);
});

test('team season: per-round points for one constructor', async () => {
  const { body } = await api('/api/teams/McLaren/season');
  assert.equal(body.results.length, 24);
  const total = body.results.reduce((sum, r) => sum + r.points, 0);
  const { body: c } = await api('/api/season/constructors');
  assert.equal(total, c.results.find((t) => t._id === 'McLaren').points);
  assert.ok(body.results.every((r) => r.entries.every((e) => e.driverId)));
  assert.equal((await api('/api/teams/Nobody/season')).status, 404);
});

test('reset re-seeds the season', async () => {
  const first = (await api('/api/laps?limit=1')).body.results[0];
  await api(`/api/laps/${first._id}`, { method: 'DELETE' });
  const { body } = await api('/api/reset', { method: 'POST' });
  assert.deepEqual(body, { ok: true, drivers: 21, races: 24, laps: totalLaps });
});

// ------------------------------ newer features (read-only on race data)

test('lap notes: insert, $inc, $set + editedAt, $addToSet, updateMany, validator', async () => {
  const before = (await api('/api/user/leaderboard')).body;
  const created = await api('/api/races/3/notes', { method: 'POST', body: { author: 'Tester', text: 'Great restart', lapNumber: 20 } });
  assert.equal(created.status, 201);
  const id = created.body.insertedId;
  assert.equal((await api(`/api/notes/${id}/helpful`, { method: 'POST' })).body.note.helpful, 1);
  const edited = await api(`/api/notes/${id}`, { method: 'PATCH', body: { text: 'Great restart, again' } });
  assert.ok(edited.body.note.editedAt);
  await api(`/api/notes/${id}/tags`, { method: 'POST', body: { tag: 'restart' } });
  const tagged = await api(`/api/notes/${id}/tags`, { method: 'POST', body: { tag: 'restart' } });
  assert.deepEqual(tagged.body.note.tags, ['restart']);
  const unpin = await api('/api/races/3/notes/pin', { method: 'POST', body: { pinned: false } });
  assert.equal(unpin.body.modifiedCount, 1);
  const bad = await api('/api/races/3/notes', { method: 'POST', body: { author: '', text: 'x' } });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.mongoError.code, 121);
  const feed = await api('/api/notes/feed');
  assert.equal(feed.body.capped, true);
  assert.deepEqual(feed.body.results.slice(0, 3).map((f) => f.action), ['edited', 'upvoted', 'created']);
  assert.deepEqual((await api('/api/user/leaderboard')).body.results, before.results, 'notes never touch race stats');
});

test('season_summary ($merge), clean_laps view, consistency and teammate battle', async () => {
  const summary = (await api('/api/season/summary')).body.results;
  assert.equal(summary[0].position, 1);
  assert.ok(summary[0].racingLaps > 0);
  const nor = (await api('/api/drivers')).body.find((d) => d.code === 'NOR');
  const c = (await api(`/api/drivers/${nor._id}/consistency`)).body.result;
  assert.ok(c.stdDev > 0 && c.rank >= 1 && c.rank <= c.field);
  const mates = (await api('/api/teams/McLaren/teammates')).body.results;
  assert.ok(mates[0].races.length >= 20);
  assert.ok(typeof mates[0].medianGap === 'number');
});

test('shared comparisons expire with a TTL index; circuits support $geoNear', async () => {
  const share = await api('/api/shares', { method: 'POST', body: { a: 'lando-norris', b: 'oscar-piastri' } });
  assert.equal(share.status, 201);
  const got = (await api(`/api/shares/${share.body.code}`)).body;
  assert.equal(got.b, 'oscar-piastri');
  assert.equal(got.expiresInDays, 7);
  const near = (await api('/api/races/1/nearby')).body;
  assert.equal(near.explain.indexUsed, 'location_2dsphere');
  assert.equal(near.results.length, 5);
  assert.equal((await api('/api/circuits')).body.results.length, 24);
});

test('driver and team profiles come from reference collections via $lookup', async () => {
  const d = (await api('/api/drivers/fernando-alonso/profile')).body.result.profile;
  assert.equal(d.firstSeason, 2001);
  assert.ok(d.teams.includes('minardi') && d.seasons.find((s) => s.year === 2005).position === 1);
  const t = (await api('/api/teams/Mercedes/profile')).body.result;
  assert.equal(t.principal, 'Toto Wolff');
  assert.equal(t.lineup.length, 2);
  assert.equal((await api('/api/drivers/nobody/profile')).status, 404);
});
