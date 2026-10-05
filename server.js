// Lap by Lap — Express API over MongoDB + the built web app (dist/).
const fs = require('fs');
const path = require('path');
const express = require('express');
const { ObjectId } = require('mongodb');
const { init, resetDemoData, getDb, client } = require('./db');

const PORT = Number(process.env.PORT) || 3000;
const DIST = path.join(__dirname, 'dist');
const app = express();

app.use(express.json());

const laps = () => getDb().collection('laps');
const drivers = () => getDb().collection('drivers');
const races = () => getDb().collection('races');

function toObjectId(value) {
  return typeof value === 'string' && ObjectId.isValid(value) && /^[a-f0-9]{24}$/i.test(value)
    ? new ObjectId(value)
    : null;
}

// Converts a form value to a number, or undefined if blank (so MongoDB's
// validator — not the app — decides whether a missing field is allowed).
function num(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : value;
}

function intParam(value) {
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}

function stripUndefined(obj) {
  for (const k of Object.keys(obj)) {
    if (obj[k] === undefined) delete obj[k];
    else if (obj[k] && typeof obj[k] === 'object' && !(obj[k] instanceof ObjectId)) stripUndefined(obj[k]);
  }
  return obj;
}

// Pretty-prints a pipeline the way you would type it in mongosh.
const shell = (value) =>
  JSON.stringify(value, function (k, v) { return this[k] instanceof ObjectId ? `ObjectId("${this[k]}")` : v; }, 2).replace(/"(ObjectId\(\\"[a-f0-9]{24}\\"\))"/g, (m, id) => id.replace(/\\"/g, '"'));

function validationErrorPayload(err) {
  return {
    error: 'MongoDB rejected the document: ' + (err.errmsg || err.message),
    mongoError: {
      name: err.name,
      code: err.code,
      codeName: err.codeName || (err.code === 121 ? 'DocumentValidationFailure' : undefined),
      errmsg: err.errmsg || err.message,
      errInfo: err.errInfo,
    },
  };
}

// Joins each lap with its driver document (drivers._id <- laps.driverId).
const lookupDriver = [
  { $lookup: { from: 'drivers', localField: 'driverId', foreignField: '_id', as: 'driver' } },
  { $unwind: { path: '$driver', preserveNullAndEmptyArrays: true } },
];

// Race + sprint classifications flattened into one array of entries per race.
const seasonEntries = [
  {
    $project: {
      round: 1,
      name: 1,
      entries: {
        $concatArrays: [
          { $map: { input: '$results', in: { $mergeObjects: ['$$this', { kind: 'race' }] } } },
          { $map: { input: { $ifNull: ['$sprint', []] }, in: { $mergeObjects: ['$$this', { kind: 'sprint' }] } } },
        ],
      },
    },
  },
  { $unwind: '$entries' },
];

// NoSQL Functionality 3 (indexing): every "Under the hood" panel shows explain().

// Laps hidden by a steward ($set: { deleted: true }) never show up outside Steward mode.
const LIVE = { deleted: { $ne: true } };
// Real race data only: steward-added laps are left out of every leaderboard, chart and statistic.
const REAL = { ...LIVE, source: { $ne: 'steward' } };

let transactions;
async function supportsTransactions() {
  if (transactions === undefined) {
    const hello = await getDb().admin().command({ hello: 1 });
    transactions = !!hello.setName;
  }
  return transactions;
}

// Condenses explain('executionStats') output (find or aggregate, classic or SBE)
// into what the "Under the hood" panels show.
function summarizeExplain(plan) {
  const cursor = plan.stages?.[0]?.$cursor;
  const stats = plan.executionStats || cursor?.executionStats || {};
  const planner = plan.queryPlanner || cursor?.queryPlanner || {};
  const winning = planner.winningPlan?.queryPlan || planner.winningPlan || {};
  const text = JSON.stringify(winning);
  const stage = text.includes('"IXSCAN"') ? 'IXSCAN' : text.includes('"TEXT') ? 'TEXT' : text.includes('"COLLSCAN"') ? 'COLLSCAN' : winning.stage || 'UNKNOWN';
  return {
    stage,
    indexUsed: text.match(/"indexName":"([^"]+)"/)?.[1] || null,
    nReturned: stats.nReturned,
    totalKeysExamined: stats.totalKeysExamined,
    totalDocsExamined: stats.totalDocsExamined,
    executionTimeMillis: stats.executionTimeMillis,
  };
}

// explain() for a find, plus the same query forced to a collection scan, so the
// panel can show what the index saves.
async function explainFind(collection, filter, sort) {
  const run = (hint) => {
    let c = collection.find(filter);
    if (sort) c = c.sort(sort);
    if (hint) c = c.hint(hint);
    return c.explain('executionStats');
  };
  const [withIndex, collscan, total] = await Promise.all([run(), run({ $natural: 1 }), collection.estimatedDocumentCount()]);
  return { ...summarizeExplain(withIndex), collscan: summarizeExplain(collscan), totalDocs: total };
}

async function explainAggregate(collection, pipeline) {
  const [plan, total] = await Promise.all([collection.aggregate(pipeline).explain('executionStats'), collection.estimatedDocumentCount()]);
  return { ...summarizeExplain(plan), totalDocs: total };
}

const onlyRace = (expr) => ({ $cond: [{ $eq: ['$entries.kind', 'race'] }, expr, null] });

// ---------------------------------------------------------------- general

app.get('/api/health', async (req, res) => {
  await getDb().command({ ping: 1 });
  const [d, r, l] = await Promise.all([drivers().estimatedDocumentCount(), races().estimatedDocumentCount(), laps().estimatedDocumentCount()]);
  res.json({ ok: true, db: getDb().databaseName, transactions: await supportsTransactions(), counts: { drivers: d, races: r, laps: l } });
});

app.get('/api/drivers', async (req, res) => {
  res.json(await drivers().find().sort({ number: 1 }).toArray());
});

app.get('/api/races', async (req, res) => {
  res.json(await races().find().sort({ round: 1 }).toArray());
});

app.get('/api/races/:round', async (req, res) => {
  const race = await races().findOne({ round: intParam(req.params.round) });
  if (!race) return res.status(404).json({ error: 'Race not found' });
  res.json(race);
});

// Every lap of one race, trimmed to what the race charts need.
app.get('/api/races/:round/laps', async (req, res) => {
  const round = intParam(req.params.round);
  const filter = { round, ...REAL };
  const [results, explain] = await Promise.all([
    laps()
      .find(filter, { projection: { driverId: 1, lapNumber: 1, lapTime: 1, position: 1, pitIn: 1, pitOut: 1, compound: 1, 'telemetry.speed': 1 } })
      .sort({ lapNumber: 1 })
      .toArray(),
    explainFind(laps(), filter, { lapNumber: 1 }),
  ]);
  res.json({ query: `db.laps.find({ round: ${round}, deleted: { $ne: true }, source: { $ne: "steward" } }).sort({ lapNumber: 1 })`, explain, results });
});

app.post('/api/reset', async (req, res) => {
  await resetDemoData();
  res.json({ ok: true, drivers: await drivers().countDocuments(), races: await races().countDocuments(), laps: await laps().countDocuments() });
});

// ------------------------------------------- NoSQL Functionality 1: CRUD
// Steward mode on the Race page. Laps a steward adds carry source: "steward";
// real laps a steward changes get stewardEdited: true.

// READ (filtered + paginated). steward=1 also returns hidden laps, so they can be restored.
app.get('/api/laps', async (req, res) => {
  const filter = req.query.steward === '1' ? {} : { ...LIVE };
  const round = intParam(req.query.round);
  if (round) filter.round = round;
  const driverId = toObjectId(req.query.driverId);
  if (driverId) filter.driverId = driverId;
  const limit = Math.min(Math.max(intParam(req.query.limit) || 25, 1), 200);
  const page = Math.max(intParam(req.query.page) || 1, 1);
  const pipeline = [
    { $match: filter },
    { $sort: { round: 1, lapNumber: 1, position: 1 } },
    { $skip: (page - 1) * limit },
    { $limit: limit },
    ...lookupDriver,
  ];
  const [results, total, explain] = await Promise.all([
    laps().aggregate(pipeline).toArray(),
    laps().countDocuments(filter),
    explainAggregate(laps(), pipeline),
  ]);
  res.json({ query: 'db.laps.aggregate(' + shell(pipeline) + ')', explain, total, page, limit, results });
});

// One lap with everything it references, for the lap detail drawer.
app.get('/api/laps/:id', async (req, res) => {
  const _id = toObjectId(req.params.id);
  if (!_id) return res.status(400).json({ error: 'Invalid lap id' });
  const lap = await laps().findOne({ _id });
  if (!lap) return res.status(404).json({ error: 'Lap not found' });
  res.json({ query: `db.laps.findOne({ _id: ObjectId("${_id}") })`, lap });
});

// The fields a steward can type in. Blank fields are left out so MongoDB's
// validator (not the app) decides what is allowed.
function lapFields(body) {
  const t = body.telemetry || {};
  return stripUndefined({
    lapNumber: num(body.lapNumber),
    lapTime: num(body.lapTime),
    position: num(body.position),
    compound: body.compound || undefined,
    telemetry: { speed: num(t.speed), rpm: num(t.rpm), throttle: num(t.throttle), brake: num(t.brake) },
  });
}

async function lapFromBody(body) {
  const round = num(body.round);
  const race = Number.isInteger(round) ? await races().findOne({ round }, { projection: { name: 1, circuit: 1, country: 1 } }) : null;
  return stripUndefined({
    driverId: body.driverId ? toObjectId(body.driverId) || body.driverId : undefined,
    raceId: race?._id,
    round,
    race: race?.name,
    circuit: race?.circuit,
    country: race?.country,
    ...lapFields(body),
    source: 'steward',
    deleted: false,
  });
}

// MongoDB has no foreign keys, so referential integrity of driverId is an app-level check.
async function assertDriverExists(doc, res) {
  if (doc.driverId instanceof ObjectId && !(await drivers().findOne({ _id: doc.driverId }))) {
    res.status(400).json({ error: 'driverId does not reference an existing driver (MongoDB has no foreign keys, so the app checks this).' });
    return false;
  }
  return true;
}

function writeError(err, res) {
  if (err.code === 121) return res.status(400).json(validationErrorPayload(err));
  throw err;
}

// CREATE: always a steward lap
app.post('/api/laps', async (req, res) => {
  const doc = await lapFromBody(req.body || {});
  if (!(await assertDriverExists(doc, res))) return;
  try {
    const result = await laps().insertOne(doc);
    res.status(201).json({ query: 'db.laps.insertOne(' + shell(doc) + ')', insertedId: result.insertedId, document: doc });
  } catch (err) {
    writeError(err, res);
  }
});

// UPDATE with $set. Editing a real lap marks it stewardEdited.
app.put('/api/laps/:id', async (req, res) => {
  const _id = toObjectId(req.params.id);
  if (!_id) return res.status(400).json({ error: 'Invalid lap id' });
  const lap = await laps().findOne({ _id }, { projection: { source: 1 } });
  if (!lap) return res.status(404).json({ error: 'Lap not found' });
  const fields = lapFields(req.body || {});
  const set = {};
  for (const [k, v] of Object.entries(fields)) {
    if (k === 'telemetry') for (const [tk, tv] of Object.entries(v)) set[`telemetry.${tk}`] = tv;
    else set[k] = v;
  }
  if (lap.source !== 'steward') set.stewardEdited = true;
  const update = { $set: set };
  try {
    const result = await laps().updateOne({ _id }, update);
    res.json({ query: `db.laps.updateOne({ _id: ObjectId("${_id}") }, ${shell(update)})`, modifiedCount: result.modifiedCount });
  } catch (err) {
    writeError(err, res);
  }
});

// DELETE: only laps a steward added. Real laps are hidden instead (soft delete, below).
app.delete('/api/laps/:id', async (req, res) => {
  const _id = toObjectId(req.params.id);
  if (!_id) return res.status(400).json({ error: 'Invalid lap id' });
  const filter = { _id, source: 'steward' };
  const result = await laps().deleteOne(filter);
  if (result.deletedCount === 0) {
    const exists = await laps().countDocuments({ _id });
    return exists
      ? res.status(403).json({ error: 'Real race laps cannot be deleted. Hide the lap instead.' })
      : res.status(404).json({ error: 'Lap not found' });
  }
  res.json({ query: `db.laps.deleteOne({ _id: ObjectId("${_id}"), source: "steward" })`, deletedCount: result.deletedCount });
});

// ------------------------------- NoSQL Functionality 6: update operators

// Hide / restore one lap: the soft-delete path for real laps.
app.patch('/api/laps/:id/hidden', async (req, res) => {
  const _id = toObjectId(req.params.id);
  if (!_id) return res.status(400).json({ error: 'Invalid lap id' });
  const hidden = req.body?.hidden === true;
  const update = { $set: { deleted: hidden, stewardEdited: true } };
  const result = await laps().updateOne({ _id }, update);
  if (result.matchedCount === 0) return res.status(404).json({ error: 'Lap not found' });
  res.json({ query: `db.laps.updateOne({ _id: ObjectId("${_id}") }, ${shell(update)})`, modifiedCount: result.modifiedCount });
});

// Restore every hidden lap of a race in one updateMany.
app.post('/api/races/:round/restore', async (req, res) => {
  const round = intParam(req.params.round);
  const filter = { round, deleted: true };
  const update = { $set: { deleted: false, stewardEdited: true } };
  const result = await laps().updateMany(filter, update);
  res.json({ query: `db.laps.updateMany(${shell(filter)}, ${shell(update)})`, matchedCount: result.matchedCount, modifiedCount: result.modifiedCount });
});

// --------------------------------- NoSQL Functionality 10: transactions
// A time penalty changes the lap ($inc lapTime) and the driver's entry in the
// race's embedded results, in one multi-document transaction: both or neither.

app.post('/api/laps/:id/penalty', async (req, res) => {
  const _id = toObjectId(req.params.id);
  if (!_id) return res.status(400).json({ error: 'Invalid lap id' });
  const seconds = Number(req.body?.seconds) || 5;
  if (!(await supportsTransactions())) {
    return res.status(503).json({ error: 'MongoDB is not running as a replica set, so multi-document transactions are unavailable. Start it with docker compose (see the README).' });
  }
  const lap = await laps().findOne({ _id });
  if (!lap) return res.status(404).json({ error: 'Lap not found' });

  const lapUpdate = { $inc: { lapTime: seconds, penaltySeconds: seconds }, $set: { stewardEdited: true } };
  const raceUpdate = { $inc: { 'results.$[r].penaltySeconds': seconds }, $set: { 'results.$[r].stewardEdited': true } };
  const arrayFilters = [{ 'r.driverId': lap.driverId }];
  const session = client.startSession();
  try {
    await session.withTransaction(async () => {
      await laps().updateOne({ _id }, lapUpdate, { session });
      const r = await races().updateOne({ _id: lap.raceId }, raceUpdate, { arrayFilters, session });
      // No classified result for this driver: abort, so the lap is not changed either.
      if (r.modifiedCount === 0) throw Object.assign(new Error('This driver has no result in this race to apply the penalty to, so the transaction was aborted and the lap is unchanged.'), { status: 409 });
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message, aborted: true });
    if (err.code === 121) return res.status(400).json(validationErrorPayload(err));
    throw err;
  } finally {
    await session.endSession();
  }
  res.json({
    query:
      'const session = db.getMongo().startSession()\n' +
      'session.withTransaction(() => {\n' +
      `  db.laps.updateOne({ _id: ObjectId("${_id}") }, ${shell(lapUpdate)})\n` +
      `  db.races.updateOne({ _id: ObjectId("${lap.raceId}") }, ${shell(raceUpdate)}, { arrayFilters: ${shell(arrayFilters)} })\n` +
      '})',
    seconds,
  });
});

// ------------------------------- NoSQL Functionality 2: aggregation
// Championship standings, computed inside MongoDB from the embedded race + sprint results.
app.get('/api/season/standings', async (req, res) => {
  const pipeline = [
    ...seasonEntries,
    {
      $group: {
        _id: '$entries.driverId',
        points: { $sum: '$entries.points' },
        wins: { $sum: { $cond: [{ $and: [{ $eq: ['$entries.kind', 'race'] }, { $eq: ['$entries.position', 1] }] }, 1, 0] } },
        podiums: { $sum: { $cond: [{ $and: [{ $eq: ['$entries.kind', 'race'] }, { $gte: ['$entries.position', 1] }, { $lte: ['$entries.position', 3] }] }, 1, 0] } },
        avgFinish: { $avg: onlyRace('$entries.position') },
        bestFinish: { $min: onlyRace('$entries.position') },
        starts: { $sum: { $cond: [{ $eq: ['$entries.kind', 'race'] }, 1, 0] } },
        teams: { $addToSet: '$entries.team' },
      },
    },
    { $lookup: { from: 'drivers', localField: '_id', foreignField: '_id', as: 'driver' } },
    { $unwind: '$driver' },
    {
      $project: {
        _id: 0, driverId: '$_id', key: '$driver.key', code: '$driver.code', name: '$driver.name', team: '$driver.team', teamColor: '$driver.teamColor',
        number: '$driver.number', points: 1, wins: 1, podiums: 1, starts: 1, bestFinish: 1, teams: 1, avgFinish: { $round: ['$avgFinish', 2] },
      },
    },
    { $sort: { points: -1, wins: -1, bestFinish: 1 } },
  ];
  res.json({ query: 'db.races.aggregate(' + shell(pipeline) + ')', results: await races().aggregate(pipeline).toArray() });
});

// Points scored by every driver in every round (the championship chart).
app.get('/api/season/progression', async (req, res) => {
  const pipeline = [
    ...seasonEntries,
    { $group: { _id: { driverId: '$entries.driverId', round: '$round' }, points: { $sum: '$entries.points' } } },
    { $group: { _id: '$_id.driverId', rounds: { $push: { round: '$_id.round', points: '$points' } } } },
  ];
  res.json({ query: 'db.races.aggregate(' + shell(pipeline) + ')', results: await races().aggregate(pipeline).toArray() });
});

app.get('/api/season/constructors', async (req, res) => {
  const pipeline = [
    ...seasonEntries,
    { $group: { _id: '$entries.team', points: { $sum: '$entries.points' }, wins: { $sum: { $cond: [{ $and: [{ $eq: ['$entries.kind', 'race'] }, { $eq: ['$entries.position', 1] }] }, 1, 0] } } } },
    { $sort: { points: -1 } },
  ];
  res.json({ query: 'db.races.aggregate(' + shell(pipeline) + ')', results: await races().aggregate(pipeline).toArray() });
});

// One team's season, round by round: both cars' race and sprint results and the points they scored.
app.get('/api/teams/:team/season', async (req, res) => {
  const team = String(req.params.team);
  const pipeline = [
    ...seasonEntries,
    { $match: { 'entries.team': team } },
    {
      $group: {
        _id: '$round',
        name: { $first: '$name' },
        points: { $sum: '$entries.points' },
        entries: { $push: { driverId: '$entries.driverId', kind: '$entries.kind', position: '$entries.position', positionText: '$entries.positionText', points: '$entries.points' } },
      },
    },
    { $sort: { _id: 1 } },
    { $project: { _id: 0, round: '$_id', name: 1, points: 1, entries: 1 } },
  ];
  const results = await races().aggregate(pipeline).toArray();
  if (!results.length) return res.status(404).json({ error: 'Team not found' });
  res.json({ query: 'db.races.aggregate(' + shell(pipeline) + ')', results });
});

// ------------------------------- User Functionality 1: laps for one driver

app.get('/api/user/driver-laps/:driverId', async (req, res) => {
  const driverId = toObjectId(req.params.driverId);
  if (!driverId) return res.status(400).json({ error: 'Invalid driver id' });
  const driver = await drivers().findOne({ _id: driverId });
  if (!driver) return res.status(404).json({ error: 'Driver not found' });
  const filter = { driverId, ...LIVE };
  const round = intParam(req.query.round);
  if (round) filter.round = round;
  const [results, explain] = await Promise.all([
    laps().find(filter).sort({ circuit: 1, lapNumber: 1 }).toArray(),
    explainFind(laps(), filter, { circuit: 1, lapNumber: 1 }),
  ]);
  res.json({ query: `db.laps.find({ driverId: ObjectId("${driverId}")${round ? `, round: ${round}` : ''}, deleted: { $ne: true } }).sort({ circuit: 1, lapNumber: 1 })`, explain, driver, results });
});

// A driver's classification in every race and sprint of the season.
app.get('/api/drivers/:id/season', async (req, res) => {
  const driverId = toObjectId(req.params.id);
  if (!driverId) return res.status(400).json({ error: 'Invalid driver id' });
  const pipeline = [...seasonEntries, { $match: { 'entries.driverId': driverId } }, { $project: { _id: 0, round: 1, name: 1, kind: '$entries.kind', result: '$entries' } }, { $sort: { round: 1 } }];
  res.json({ query: 'db.races.aggregate(' + shell(pipeline) + ')', results: await races().aggregate(pipeline).toArray() });
});

// -------------------------- User Functionality 2: compare two drivers' averages

app.get('/api/user/compare', async (req, res) => {
  const a = toObjectId(req.query.a);
  const b = toObjectId(req.query.b);
  if (!a || !b) return res.status(400).json({ error: 'Pick two drivers' });
  // Racing laps only: no pit in/out laps and no opening lap.
  const pipeline = [
    { $match: { driverId: { $in: [a, b] }, deleted: { $ne: true }, source: { $ne: 'steward' }, pitIn: { $ne: true }, pitOut: { $ne: true }, lapNumber: { $gt: 1 } } },
    { $group: { _id: { driverId: '$driverId', round: '$round', race: '$race', circuit: '$circuit' }, avgLapTime: { $avg: '$lapTime' }, laps: { $sum: 1 } } },
    { $sort: { '_id.round': 1 } },
    { $group: { _id: '$_id.driverId', perRace: { $push: { round: '$_id.round', race: '$_id.race', circuit: '$_id.circuit', avgLapTime: { $round: ['$avgLapTime', 3] }, laps: '$laps' } }, totalTime: { $sum: { $multiply: ['$avgLapTime', '$laps'] } }, laps: { $sum: '$laps' } } },
    { $project: { avgLapTime: { $round: [{ $divide: ['$totalTime', '$laps'] }, 3] }, laps: 1, perRace: 1 } },
    { $lookup: { from: 'drivers', localField: '_id', foreignField: '_id', as: 'driver' } },
    { $unwind: '$driver' },
  ];
  const duelPipeline = [
    { $project: { round: 1, name: 1, a: { $first: { $filter: { input: '$results', cond: { $eq: ['$$this.driverId', a] } } } }, b: { $first: { $filter: { input: '$results', cond: { $eq: ['$$this.driverId', b] } } } } } },
    { $match: { a: { $ne: null }, b: { $ne: null } } },
    { $project: { _id: 0, round: 1, name: 1, a: { position: '$a.position', positionText: '$a.positionText', points: '$a.points' }, b: { position: '$b.position', positionText: '$b.positionText', points: '$b.points' } } },
    { $sort: { round: 1 } },
  ];
  const [rows, duel, aDriver, bDriver] = await Promise.all([
    laps().aggregate(pipeline).toArray(),
    races().aggregate(duelPipeline).toArray(),
    drivers().findOne({ _id: a }),
    drivers().findOne({ _id: b }),
  ]);
  const pick = (id) => rows.find((r) => r._id.equals(id)) || null;
  res.json({
    query: 'db.laps.aggregate(' + shell(pipeline) + ')',
    results: [
      { driver: aDriver, stats: pick(a) },
      { driver: bDriver, stats: pick(b) },
    ],
    duel,
  });
});

// ------------------ User Functionality 3: fastest lap per driver (all laps, or one race)

app.get('/api/user/leaderboard', async (req, res) => {
  const round = intParam(req.query.round);
  if (req.query.round !== undefined && !round) return res.status(400).json({ error: 'Pick a race (round 1-24)' });
  const pipeline = [
    { $match: round ? { round, ...REAL } : REAL },
    { $sort: { lapTime: 1 } },
    { $group: { _id: '$driverId', fastestLap: { $first: '$$ROOT' } } },
    { $lookup: { from: 'drivers', localField: '_id', foreignField: '_id', as: 'driver' } },
    { $unwind: '$driver' },
    {
      $project: {
        _id: 0, driverId: '$_id', key: '$driver.key', code: '$driver.code', name: '$driver.name', team: '$driver.team', teamColor: '$driver.teamColor', number: '$driver.number',
        lapTime: '$fastestLap.lapTime', lapNumber: '$fastestLap.lapNumber', compound: '$fastestLap.compound', circuit: '$fastestLap.circuit', topSpeed: '$fastestLap.telemetry.speed', sectors: '$fastestLap.sectors',
      },
    },
    { $sort: { lapTime: 1 } },
  ];
  const [results, explain] = await Promise.all([laps().aggregate(pipeline).toArray(), explainAggregate(laps(), pipeline)]);
  res.json({ query: 'db.laps.aggregate(' + shell(pipeline) + ')', explain, results });
});

// ------------------------ User Functionality 4: laps above a speed threshold

app.get('/api/user/speed', async (req, res) => {
  const min = Number(req.query.min);
  if (req.query.min === undefined || req.query.min === '' || !Number.isFinite(min)) return res.status(400).json({ error: 'Enter a numeric speed threshold' });
  const filter = { 'telemetry.speed': { $gt: min }, ...REAL };
  const round = intParam(req.query.round);
  if (round) filter.round = round;
  const limit = Math.min(Math.max(intParam(req.query.limit) || 50, 1), 500);
  const [results, total, explain] = await Promise.all([
    laps().find(filter).sort({ 'telemetry.speed': -1 }).limit(limit).toArray(),
    laps().countDocuments(filter),
    explainFind(laps(), filter, { 'telemetry.speed': -1 }),
  ]);
  const byId = new Map((await drivers().find({ _id: { $in: results.map((l) => l.driverId) } }).toArray()).map((d) => [String(d._id), d]));
  for (const l of results) l.driver = byId.get(String(l.driverId));
  res.json({
    query: `db.laps.find({ "telemetry.speed": { $gt: ${min} }${round ? `, round: ${round}` : ''}, deleted: { $ne: true }, source: { $ne: "steward" } }).sort({ "telemetry.speed": -1 }).limit(${limit})`,
    explain,
    total,
    results,
  });
});

// ----------------------------- User Functionality 5: text search on circuit

app.get('/api/user/search', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'Enter a circuit to search for' });
  const pipeline = [
    { $match: { $text: { $search: q }, deleted: { $ne: true }, source: { $ne: 'steward' } } },
    { $group: { _id: '$round', race: { $first: '$race' }, circuit: { $first: '$circuit' }, country: { $first: '$country' }, score: { $max: { $meta: 'textScore' } }, laps: { $sum: 1 }, fastestLap: { $min: '$lapTime' }, topSpeed: { $max: '$telemetry.speed' } } },
    { $project: { _id: 0, round: '$_id', race: 1, circuit: 1, country: 1, laps: 1, fastestLap: 1, topSpeed: 1, score: { $round: ['$score', 2] } } },
    { $sort: { score: -1, round: 1 } },
  ];
  const [results, explain] = await Promise.all([laps().aggregate(pipeline).toArray(), explainAggregate(laps(), pipeline)]);
  res.json({ query: 'db.laps.aggregate(' + shell(pipeline) + ')', explain, results });
});

// ------------------------------ NoSQL Functionality 7: $facet + $bucket
// "Race in numbers": lap-time histogram, tyre split and summary stats in ONE query.

app.get('/api/races/:round/numbers', async (req, res) => {
  const round = intParam(req.params.round);
  const race = await races().findOne({ round }, { projection: { 'track.lap.lapTime': 1 } });
  if (!race) return res.status(404).json({ error: 'Race not found' });
  // Half-second buckets from the race's fastest lap up to 8 s slower; slower laps go in "slower".
  const fastest = Math.floor(race.track?.lap?.lapTime ?? 60);
  const boundaries = Array.from({ length: 17 }, (_, i) => fastest + i * 0.5);
  const pipeline = [
    { $match: { round, ...REAL } },
    {
      $facet: {
        histogram: [
          { $match: { lapNumber: { $gt: 1 }, pitIn: { $ne: true }, pitOut: { $ne: true } } },
          { $bucket: { groupBy: '$lapTime', boundaries, default: 'slower', output: { laps: { $sum: 1 } } } },
        ],
        compounds: [
          { $group: { _id: { $ifNull: ['$compound', 'UNKNOWN'] }, laps: { $sum: 1 }, avgLapTime: { $avg: '$lapTime' } } },
          { $sort: { laps: -1 } },
        ],
        summary: [
          {
            $group: {
              _id: null,
              laps: { $sum: 1 },
              drivers: { $addToSet: '$driverId' },
              fastest: { $min: '$lapTime' },
              average: { $avg: '$lapTime' },
              spread: { $stdDevPop: '$lapTime' },
              pitStops: { $sum: { $cond: ['$pitIn', 1, 0] } },
              topSpeed: { $max: '$telemetry.speed' },
            },
          },
          { $project: { _id: 0, laps: 1, drivers: { $size: '$drivers' }, fastest: 1, average: { $round: ['$average', 3] }, spread: { $round: ['$spread', 3] }, pitStops: 1, topSpeed: 1 } },
        ],
      },
    },
  ];
  const [[result], explain] = await Promise.all([laps().aggregate(pipeline).toArray(), explainAggregate(laps(), pipeline)]);
  res.json({ query: 'db.laps.aggregate(' + shell(pipeline) + ')', explain, ...result, summary: result.summary[0] || null });
});

// --------------------------- NoSQL Functionality 8: window functions
// Gap to the leader at the end of every lap, worked out inside MongoDB:
// a running total of each driver's lap times, then the smallest total on each lap.

app.get('/api/races/:round/gaps', async (req, res) => {
  const round = intParam(req.params.round);
  const pipeline = [
    { $match: { round, ...REAL } },
    {
      $setWindowFields: {
        partitionBy: '$driverId',
        sortBy: { lapNumber: 1 },
        output: { raceTime: { $sum: '$lapTime', window: { documents: ['unbounded', 'current'] } } },
      },
    },
    {
      $setWindowFields: {
        partitionBy: '$lapNumber',
        output: { leaderTime: { $min: '$raceTime' } },
      },
    },
    { $project: { _id: 0, driverId: 1, lapNumber: 1, gap: { $round: [{ $subtract: ['$raceTime', '$leaderTime'] }, 3] } } },
    { $sort: { lapNumber: 1 } },
    { $group: { _id: '$driverId', gaps: { $push: { lap: '$lapNumber', gap: '$gap' } } } },
  ];
  const [results, explain] = await Promise.all([laps().aggregate(pipeline).toArray(), explainAggregate(laps(), pipeline)]);
  res.json({ query: 'db.laps.aggregate(' + shell(pipeline) + ')', explain, results: results.map((r) => ({ driverId: r._id, gaps: r.gaps })) });
});

// ------------------------------- User Functionality 6: tyre strategy
// Each driver's stints: the compound and the first and last lap on it.

app.get('/api/races/:round/stints', async (req, res) => {
  const round = intParam(req.params.round);
  const pipeline = [
    { $match: { round, ...REAL } },
    { $group: { _id: { driverId: '$driverId', stint: '$stint' }, compound: { $first: '$compound' }, from: { $min: '$lapNumber' }, to: { $max: '$lapNumber' }, laps: { $sum: 1 } } },
    { $sort: { '_id.stint': 1 } },
    { $group: { _id: '$_id.driverId', stints: { $push: { stint: '$_id.stint', compound: '$compound', from: '$from', to: '$to', laps: '$laps' } } } },
  ];
  const [results, explain] = await Promise.all([laps().aggregate(pipeline).toArray(), explainAggregate(laps(), pipeline)]);
  res.json({ query: 'db.laps.aggregate(' + shell(pipeline) + ')', explain, results: results.map((r) => ({ driverId: r._id, stints: r.stints })) });
});

// -------------------------------- User Functionality 7: pit stop analysis
// Stops, the laps they happened on, and time lost: in-lap + out-lap time
// minus what two normal racing laps would have taken.

app.get('/api/races/:round/pitstops', async (req, res) => {
  const round = intParam(req.params.round);
  const pitLap = { $or: [{ $eq: ['$pitIn', true] }, { $eq: ['$pitOut', true] }] };
  const pipeline = [
    { $match: { round, ...REAL } },
    {
      $group: {
        _id: '$driverId',
        stops: { $sum: { $cond: [{ $eq: ['$pitIn', true] }, 1, 0] } },
        pitLaps: { $push: { $cond: [{ $eq: ['$pitIn', true] }, '$lapNumber', '$REMOVE'] } },
        pitLapTime: { $sum: { $cond: [pitLap, '$lapTime', 0] } },
        pitLapCount: { $sum: { $cond: [pitLap, 1, 0] } },
        racingLap: { $avg: { $cond: [{ $and: [{ $not: [pitLap] }, { $gt: ['$lapNumber', 1] }] }, '$lapTime', null] } },
      },
    },
    { $match: { stops: { $gt: 0 } } },
    {
      $project: {
        _id: 0, driverId: '$_id', stops: 1, pitLaps: { $sortArray: { input: '$pitLaps', sortBy: 1 } },
        racingLap: { $round: ['$racingLap', 3] },
        timeLost: { $round: [{ $subtract: ['$pitLapTime', { $multiply: ['$pitLapCount', '$racingLap'] }] }, 1] },
      },
    },
    { $sort: { timeLost: 1 } },
  ];
  const [results, explain] = await Promise.all([laps().aggregate(pipeline).toArray(), explainAggregate(laps(), pipeline)]);
  res.json({ query: 'db.laps.aggregate(' + shell(pipeline) + ')', explain, results });
});

// --------------------------------- User Functionality 8: biggest movers
// Places gained or lost from the grid, for one race or added up over the season.

app.get('/api/movers', async (req, res) => {
  const round = intParam(req.query.round);
  const pipeline = [
    ...(round ? [{ $match: { round } }] : []),
    { $unwind: '$results' },
    { $match: { 'results.grid': { $gt: 0 }, 'results.position': { $ne: null } } },
    { $group: { _id: '$results.driverId', gained: { $sum: { $subtract: ['$results.grid', '$results.position'] } }, races: { $sum: 1 } } },
    { $lookup: { from: 'drivers', localField: '_id', foreignField: '_id', as: 'driver' } },
    { $unwind: '$driver' },
    { $project: { _id: 0, driverId: '$_id', code: '$driver.code', name: '$driver.name', gained: 1, races: 1 } },
    { $sort: { gained: -1, name: 1 } },
  ];
  res.json({ query: 'db.races.aggregate(' + shell(pipeline) + ')', results: await races().aggregate(pipeline).toArray() });
});

// ------------- NoSQL Functionality 2 (Driver page): season stats with $group + $lookup

app.get('/api/drivers/:id/stats', async (req, res) => {
  const driverId = toObjectId(req.params.id);
  if (!driverId) return res.status(400).json({ error: 'Invalid driver id' });
  const pipeline = [
    { $match: { driverId, ...REAL } },
    { $group: { _id: '$driverId', avgLapTime: { $avg: '$lapTime' }, fastestLap: { $min: '$lapTime' }, laps: { $sum: 1 }, races: { $addToSet: '$round' } } },
    { $lookup: { from: 'drivers', localField: '_id', foreignField: '_id', as: 'driver' } },
    { $unwind: '$driver' },
    { $project: { _id: 0, name: '$driver.name', team: '$driver.team', avgLapTime: { $round: ['$avgLapTime', 3] }, fastestLap: 1, laps: 1, races: { $size: '$races' } } },
  ];
  const [[result], explain] = await Promise.all([laps().aggregate(pipeline).toArray(), explainAggregate(laps(), pipeline)]);
  res.json({ query: 'db.laps.aggregate(' + shell(pipeline) + ')', explain, result: result || null });
});

// User Functionality 9: best S1 + best S2 + best S3 in one race, against the fastest real lap.
app.get('/api/drivers/:id/theoretical', async (req, res) => {
  const driverId = toObjectId(req.params.id);
  const round = intParam(req.query.round);
  if (!driverId || !round) return res.status(400).json({ error: 'Pick a driver and a race' });
  const pipeline = [
    { $match: { driverId, round, ...REAL } },
    { $group: { _id: null, s1: { $min: '$sectors.s1' }, s2: { $min: '$sectors.s2' }, s3: { $min: '$sectors.s3' }, fastest: { $min: '$lapTime' } } },
    { $project: { _id: 0, s1: 1, s2: 1, s3: 1, fastest: 1, theoretical: { $round: [{ $add: ['$s1', '$s2', '$s3'] }, 3] } } },
    { $set: { difference: { $round: [{ $subtract: ['$fastest', '$theoretical'] }, 3] } } },
  ];
  const [result] = await laps().aggregate(pipeline).toArray();
  res.json({ query: 'db.laps.aggregate(' + shell(pipeline) + ')', result: result || null });
});

// ------------------------- User Functionality 10: tyre degradation for one team
// Each lap as a % of that race's fastest lap, averaged by tyre age, for this team and the field.

app.get('/api/teams/:team/degradation', async (req, res) => {
  const team = String(req.params.team);
  const pipeline = [
    { $match: { ...REAL, lapNumber: { $gt: 1 }, pitIn: { $ne: true }, pitOut: { $ne: true }, tyreLife: { $gte: 1, $lte: 35 }, compound: { $in: ['SOFT', 'MEDIUM', 'HARD'] } } },
    { $setWindowFields: { partitionBy: '$round', output: { raceBest: { $min: '$lapTime' } } } },
    { $set: { pace: { $multiply: [{ $divide: ['$lapTime', '$raceBest'] }, 100] } } },
    { $match: { pace: { $lt: 107 } } },
    { $lookup: { from: 'drivers', localField: 'driverId', foreignField: '_id', as: 'driver' } },
    { $set: { mine: { $eq: [{ $first: '$driver.team' }, team] } } },
    { $group: { _id: '$tyreLife', field: { $avg: '$pace' }, team: { $avg: { $cond: ['$mine', '$pace', null] } }, teamLaps: { $sum: { $cond: ['$mine', 1, 0] } } } },
    { $project: { _id: 0, tyreAge: '$_id', field: { $round: ['$field', 3] }, team: { $round: ['$team', 3] }, teamLaps: 1 } },
    { $sort: { tyreAge: 1 } },
  ];
  res.json({ query: 'db.laps.aggregate(' + shell(pipeline) + ')', results: await laps().aggregate(pipeline).toArray() });
});

// ------------------------------- NoSQL Functionality 9: geospatial queries
// Circuits nearest to this one, by straight-line distance, on the 2dsphere index.

app.get('/api/races/:round/nearby', async (req, res) => {
  const race = await races().findOne({ round: intParam(req.params.round) }, { projection: { location: 1 } });
  if (!race?.location) return res.status(404).json({ error: 'Race not found' });
  const pipeline = [
    { $geoNear: { near: race.location, distanceField: 'distance', spherical: true, query: { round: { $ne: intParam(req.params.round) } } } },
    { $limit: 5 },
    { $project: { _id: 0, round: 1, name: 1, circuit: 1, country: 1, countryCode: 1, distanceKm: { $round: [{ $divide: ['$distance', 1000] }, 0] } } },
  ];
  res.json({ query: 'db.races.aggregate(' + shell(pipeline) + ')', results: await races().aggregate(pipeline).toArray() });
});

// ---------------------------------------------------------------- web app

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

if (fs.existsSync(path.join(DIST, 'index.html'))) {
  app.use(express.static(DIST, { index: 'index.html', maxAge: '1h' }));
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(DIST, 'index.html')));
} else {
  app.get('/', (req, res) =>
    res.status(503).type('text').send('The web app has not been built yet. Run "npm run build" (or "npm start", which builds it first).')
  );
}

app.use((err, req, res, next) => {
  console.error('[error]', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

init()
  .then(() => {
    const server = app.listen(PORT, () => {
      console.log(`\n  Lap by Lap is running at http://localhost:${PORT}\n`);
    });
    const shutdown = () => server.close(() => client.close().finally(() => process.exit(0)));
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  })
  .catch((err) => {
    console.error('[startup] ' + err.message);
    process.exit(1);
  });
