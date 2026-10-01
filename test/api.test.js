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

  const updated = await api(`/api/laps/${id}`, { method: 'PUT', body: { ...lap, lapTime: 80.4 } });
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

test('NoSQL 2: aggregation — avg + fastest lap per driver ($group, $lookup, $sort)', async () => {
  const { body } = await api('/api/nosql/aggregation');
  assert.match(body.query, /\$group[\s\S]*\$avg[\s\S]*\$min[\s\S]*\$sum[\s\S]*\$lookup[\s\S]*\$sort/);
  assert.ok(body.results.length >= 20);
  assert.ok(body.results.every((r) => r.name && r.fastestLap <= r.avgLapTime && r.laps > 0));
  const avgs = body.results.map((r) => r.avgLapTime);
  assert.deepEqual(avgs, [...avgs].sort((a, b) => a - b));
  assert.equal(body.results.reduce((n, r) => n + r.laps, 0), totalLaps);
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

test('NoSQL 3: indexes — _id, compound, text; explain uses IXSCAN and reads far fewer docs', async () => {
  const { body } = await api('/api/nosql/indexes');
  const names = body.results.map((i) => i.name).sort();
  assert.deepEqual(names, ['_id_', 'circuit_text', 'driverId_1_lapNumber_1']);
  assert.deepEqual(body.results.find((i) => i.name === 'driverId_1_lapNumber_1').key, { driverId: 1, lapNumber: 1 });
  assert.deepEqual(Object.keys(body.results.find((i) => i.name === 'circuit_text').weights), ['circuit']);
  assert.equal(body.explain.indexUsed, 'driverId_1_lapNumber_1');
  assert.match(JSON.stringify(body.explain.winningPlan), /IXSCAN/);
  assert.match(JSON.stringify(body.explain.collscan.winningPlan), /COLLSCAN/);
  assert.equal(body.explain.totalDocsExamined, body.explain.nReturned);
  assert.equal(body.explain.collscan.totalDocsExamined, totalLaps);
});

test('NoSQL 4: schema validation rejects an invalid lap with code 121', async () => {
  const { status, body } = await api('/api/nosql/invalid-insert', { method: 'POST' });
  assert.equal(status, 200);
  assert.equal(body.mongoError.code, 121);
  assert.equal(body.mongoError.errmsg, 'Document failed validation');
  const required = body.mongoError.errInfo.details.schemaRulesNotSatisfied.find((r) => r.operatorName === 'required');
  assert.deepEqual(required.missingProperties.sort(), ['driverId', 'lapTime', 'telemetry']);
  const wrongType = body.mongoError.errInfo.details.schemaRulesNotSatisfied.find((r) => r.operatorName === 'properties');
  assert.equal(wrongType.propertiesNotSatisfied[0].propertyName, 'lapNumber');
  assert.equal((await api('/api/health')).body.counts.laps, totalLaps, 'invalid lap was not stored');
});

test('NoSQL 5: embedded telemetry + driverId / raceId references', async () => {
  const { body } = await api('/api/nosql/embedded');
  for (const k of ['speed', 'rpm', 'throttle', 'brake']) assert.equal(typeof body.lap.telemetry[k], 'number');
  assert.equal(body.lap.driverId, body.referencedDriver._id);
  assert.equal(body.lap.raceId, body.referencedRace._id);
  assert.equal(body.referencedRace.results.length, 3);
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

test('User 4: laps above a speed threshold (dot notation)', async () => {
  const { body } = await api('/api/user/speed?min=350');
  assert.ok(body.total > 0);
  assert.ok(body.results.every((l) => l.telemetry.speed > 350 && l.driver.name));
  const all = await api('/api/user/speed?min=0&limit=1');
  assert.ok(all.body.total > totalLaps * 0.99 && all.body.total <= totalLaps);
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
