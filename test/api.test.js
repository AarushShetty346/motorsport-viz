// End-to-end API tests: starts the real server against a throwaway database
// ("motorsport_test") on the local MongoDB and exercises all 10 functionalities.
// Requires MongoDB to be running (docker compose up -d mongo).
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
    const timer = setTimeout(() => reject(new Error('server did not start in 60s')), 60000);
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

let driversByName;

test('seed data: 3 drivers and 8 laps', async () => {
  const { body: drivers } = await api('/api/drivers');
  assert.equal(drivers.length, 3);
  driversByName = Object.fromEntries(drivers.map((d) => [d.name, d]));
  assert.deepEqual(
    drivers.map((d) => [d.name, d.team, d.number]),
    [['Max Verstappen', 'Red Bull', 1], ['Lando Norris', 'McLaren', 4], ['Charles Leclerc', 'Ferrari', 16]]
  );
  const { body } = await api('/api/laps');
  assert.equal(body.results.length, 8);
  assert.deepEqual([...new Set(body.results.map((l) => l.circuit))].sort(), ['Monza', 'Silverstone']);
});

test('NoSQL 1: CRUD — insert, update, delete', async () => {
  const lap = {
    driverId: driversByName['Charles Leclerc']._id, lapNumber: 2, lapTime: 80.5, circuit: 'Monza',
    telemetry: { speed: 356, rpm: 12100, throttle: 83, brake: 10 },
  };
  const created = await api('/api/laps', { method: 'POST', body: lap });
  assert.equal(created.status, 201);
  const id = created.body.insertedId;
  assert.equal((await api('/api/laps')).body.results.length, 9);

  const updated = await api(`/api/laps/${id}`, { method: 'PUT', body: { ...lap, lapTime: 80.4 } });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.modifiedCount, 1);
  const after = (await api('/api/laps')).body.results.find((l) => l._id === id);
  assert.equal(after.lapTime, 80.4);
  assert.equal(after.driver.name, 'Charles Leclerc');

  const bad = await api('/api/laps', { method: 'POST', body: { driverId: lap.driverId, lapNumber: 3, circuit: 'Monza' } });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.mongoError.code, 121);

  const unknownDriver = await api('/api/laps', { method: 'POST', body: { ...lap, driverId: '000000000000000000000000' } });
  assert.equal(unknownDriver.status, 400);

  const del = await api(`/api/laps/${id}`, { method: 'DELETE' });
  assert.equal(del.body.deletedCount, 1);
  assert.equal((await api('/api/laps')).body.results.length, 8);
  assert.equal((await api(`/api/laps/${id}`, { method: 'DELETE' })).status, 404);
});

test('NoSQL 2: aggregation — avg + fastest per driver, sorted by avg', async () => {
  const { body } = await api('/api/nosql/aggregation');
  assert.equal(body.results.length, 3);
  const ver = body.results.find((r) => r.name === 'Max Verstappen');
  assert.equal(ver.laps, 3);
  assert.equal(ver.fastestLap, 80.987);
  assert.equal(ver.avgLapTime, Number(((81.452 + 80.987 + 88.301) / 3).toFixed(3)));
  const avgs = body.results.map((r) => r.avgLapTime);
  assert.deepEqual(avgs, [...avgs].sort((a, b) => a - b));
});

test('NoSQL 3: indexes — _id, compound, text; explain uses IXSCAN', async () => {
  const { body } = await api('/api/nosql/indexes');
  const names = body.results.map((i) => i.name).sort();
  assert.deepEqual(names, ['_id_', 'circuit_text', 'driverId_1_lapNumber_1']);
  assert.deepEqual(body.results.find((i) => i.name === 'driverId_1_lapNumber_1').key, { driverId: 1, lapNumber: 1 });
  assert.deepEqual(body.results.find((i) => i.name === 'circuit_text').weights, { circuit: 1 });
  assert.equal(body.explain.indexUsed, 'driverId_1_lapNumber_1');
});

test('NoSQL 4: schema validation rejects invalid lap with code 121', async () => {
  const { status, body } = await api('/api/nosql/invalid-insert', { method: 'POST' });
  assert.equal(status, 200);
  assert.equal(body.mongoError.code, 121);
  assert.equal(body.mongoError.errmsg, 'Document failed validation');
  const required = body.mongoError.errInfo.details.schemaRulesNotSatisfied.find((r) => r.operatorName === 'required');
  assert.deepEqual(required.missingProperties.sort(), ['driverId', 'lapTime', 'telemetry']);
  assert.equal((await api('/api/laps')).body.results.length, 8, 'invalid lap was not stored');
});

test('NoSQL 5: embedded telemetry + driverId reference', async () => {
  const { body } = await api('/api/nosql/embedded');
  assert.deepEqual(Object.keys(body.lap.telemetry).sort(), ['brake', 'rpm', 'speed', 'throttle']);
  assert.equal(body.lap.driverId, body.referencedDriver._id);
});

test('User 1: laps for one driver', async () => {
  const { body } = await api(`/api/user/driver-laps/${driversByName['Lando Norris']._id}`);
  assert.equal(body.results.length, 3);
  assert.ok(body.results.every((l) => l.driverId === driversByName['Lando Norris']._id));
  assert.equal((await api('/api/user/driver-laps/not-an-id')).status, 400);
});

test('User 2: compare two drivers', async () => {
  const a = driversByName['Max Verstappen']._id;
  const b = driversByName['Charles Leclerc']._id;
  const { body } = await api(`/api/user/compare?a=${a}&b=${b}`);
  assert.equal(body.results[0].driver.name, 'Max Verstappen');
  assert.equal(body.results[1].driver.name, 'Charles Leclerc');
  assert.equal(body.results[0].stats.avgLapTime, Number(((81.452 + 80.987 + 88.301) / 3).toFixed(3)));
  assert.equal(body.results[1].stats.avgLapTime, Number(((81.203 + 88.912) / 2).toFixed(3)));
  assert.equal(body.results[1].stats.perCircuit.length, 2);
});

test('User 3: fastest lap leaderboard', async () => {
  const { body } = await api('/api/user/leaderboard');
  assert.deepEqual(body.results.map((r) => [r.name, r.lapTime]), [
    ['Max Verstappen', 80.987], ['Charles Leclerc', 81.203], ['Lando Norris', 81.588],
  ]);
});

test('User 4: laps above a speed threshold', async () => {
  const { body } = await api('/api/user/speed?min=350');
  assert.equal(body.results.length, 2);
  assert.ok(body.results.every((l) => l.telemetry.speed > 350));
  assert.equal((await api('/api/user/speed?min=0')).body.results.length, 8);
  assert.equal((await api('/api/user/speed?min=abc')).status, 400);
});

test('User 5: text search on circuit', async () => {
  assert.equal((await api('/api/user/search?q=monza')).body.results.length, 4);
  assert.equal((await api('/api/user/search?q=Silverstone')).body.results.length, 4);
  assert.equal((await api('/api/user/search?q=monza%20silverstone')).body.results.length, 8);
  assert.equal((await api('/api/user/search?q=monaco')).body.results.length, 0);
  assert.ok((await api('/api/user/search?q=monza')).body.results.every((l) => l.score > 0));
});

test('reset re-seeds demo data', async () => {
  await api(`/api/laps/${(await api('/api/laps')).body.results[0]._id}`, { method: 'DELETE' });
  const { body } = await api('/api/reset', { method: 'POST' });
  assert.deepEqual(body, { ok: true, drivers: 3, laps: 8 });
});
