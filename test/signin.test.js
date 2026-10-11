// Sign-in rules: with Google keys set, anyone can browse but only signed-in users
// can write, and they can only change or delete what they added themselves.
// Uses the test-only sign-in route (NODE_ENV=test), since a test can't log in to Google.
// Requires MongoDB (docker compose up -d mongo).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { MongoClient } = require('mongodb');

const PORT = 3998;
const BASE = `http://localhost:${PORT}`;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME = 'motorsport_test_signin';
let server;

async function api(p, { cookie, ...options } = {}) {
  const res = await fetch(BASE + p, {
    headers: { 'Content-Type': 'application/json', ...(cookie && { Cookie: cookie }) },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  return { status: res.status, body: await res.json(), setCookie: res.headers.get('set-cookie') };
}

async function signIn(name) {
  const { setCookie } = await api('/api/auth/test-login', { method: 'POST', body: { name } });
  return setCookie.split(';')[0];
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
    env: { ...process.env, PORT: String(PORT), MONGO_URI, DB_NAME, NODE_ENV: 'test', GOOGLE_CLIENT_ID: 'test-id', GOOGLE_CLIENT_SECRET: 'test-secret' },
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

test('signed out: browsing works, every write asks to sign in', async () => {
  assert.equal((await api('/api/races/3/notes')).status, 200);
  assert.equal((await api('/api/laps?round=3')).status, 200);
  const writes = [
    ['/api/races/3/notes', 'POST', { author: 'Anon', text: 'hi' }],
    ['/api/laps', 'POST', { round: 3, lapNumber: 1 }],
    ['/api/races/3/restore', 'POST'],
    ['/api/races/3/notes/pin', 'POST', { pinned: false }],
    ['/api/shares', 'POST', { a: 'lando-norris', b: 'max-verstappen' }],
    ['/api/reset', 'POST'],
  ];
  for (const [p, method, body] of writes) {
    const r = await api(p, { method, body });
    assert.equal(r.status, 401, `${method} ${p}`);
    assert.equal(r.body.signInRequired, true);
  }
  assert.equal((await api('/api/me/activity')).status, 401);
});

test('signed in: notes carry your Google name, only you can edit or delete them', async () => {
  const alice = await signIn('Alice');
  const bob = await signIn('Bob');
  const created = await api('/api/races/3/notes', { method: 'POST', cookie: alice, body: { author: 'Someone else', text: 'Great restart', lapNumber: 20 } });
  assert.equal(created.status, 201);
  const id = created.body.insertedId;
  const note = (await api('/api/races/3/notes')).body.results.find((n) => n._id === id);
  assert.equal(note.author, 'Alice', 'the typed name is ignored when signed in');

  assert.equal((await api(`/api/notes/${id}`, { method: 'PATCH', cookie: bob, body: { text: 'hijacked' } })).status, 403);
  assert.equal((await api(`/api/notes/${id}`, { method: 'DELETE', cookie: bob })).status, 403);
  assert.equal((await api(`/api/notes/${id}/helpful`, { method: 'POST', cookie: bob })).body.note.helpful, 1, 'anyone signed in can upvote');
  assert.equal((await api(`/api/notes/${id}`, { method: 'PATCH', cookie: alice, body: { text: 'Great restart!' } })).status, 200);

  const activity = await api('/api/me/activity', { cookie: alice });
  assert.equal(activity.status, 200);
  assert.deepEqual(activity.body.notes.map((n) => n.text), ['Great restart!']);
  assert.equal((await api('/api/me/activity', { cookie: bob })).body.notes.length, 0);

  assert.equal((await api(`/api/notes/${id}`, { method: 'DELETE', cookie: alice })).status, 200);
  assert.equal((await api('/api/races/3/notes')).body.results.some((n) => n._id === id), false);
});

test('signed in: steward laps belong to whoever added them', async () => {
  const alice = await signIn('Alice');
  const bob = await signIn('Bob');
  const [driver] = (await api('/api/drivers')).body;
  const lap = { driverId: driver._id, round: 3, lapNumber: 70, lapTime: 90.1, position: 5, telemetry: { speed: 310, rpm: 11500, throttle: 70, brake: 15 } };
  const created = await api('/api/laps', { method: 'POST', cookie: alice, body: lap });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.document.addedBy.name, 'Alice');
  const id = created.body.insertedId;

  assert.equal((await api(`/api/laps/${id}`, { method: 'PUT', cookie: bob, body: { lapTime: 50 } })).status, 403);
  assert.equal((await api(`/api/laps/${id}`, { method: 'DELETE', cookie: bob })).status, 403);
  assert.equal((await api(`/api/laps/${id}`, { method: 'PUT', cookie: alice, body: { lapTime: 91 } })).status, 200);

  // Real laps can be changed by anyone signed in, and remember who did it last.
  const real = (await api('/api/laps?round=3&limit=1')).body.results[0];
  assert.equal((await api(`/api/laps/${real._id}/hidden`, { method: 'PATCH', cookie: bob, body: { hidden: true } })).status, 200);
  const bobs = (await api('/api/me/activity', { cookie: bob })).body;
  assert.deepEqual(bobs.changed.map((l) => l._id), [real._id]);
  assert.equal((await api('/api/me/activity', { cookie: alice })).body.added.length, 1);

  assert.equal((await api(`/api/laps/${id}`, { method: 'DELETE', cookie: alice })).status, 200);
});
