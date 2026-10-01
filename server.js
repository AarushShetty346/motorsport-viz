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

const onlyRace = (expr) => ({ $cond: [{ $eq: ['$entries.kind', 'race'] }, expr, null] });

// ---------------------------------------------------------------- general

app.get('/api/health', async (req, res) => {
  await getDb().command({ ping: 1 });
  const [d, r, l] = await Promise.all([drivers().estimatedDocumentCount(), races().estimatedDocumentCount(), laps().estimatedDocumentCount()]);
  res.json({ ok: true, db: getDb().databaseName, counts: { drivers: d, races: r, laps: l } });
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
  const results = await laps()
    .find({ round }, { projection: { driverId: 1, lapNumber: 1, lapTime: 1, position: 1, pitIn: 1, pitOut: 1, compound: 1, 'telemetry.speed': 1 } })
    .sort({ lapNumber: 1 })
    .toArray();
  res.json({ query: `db.laps.find({ round: ${round} }).sort({ lapNumber: 1 })`, results });
});

app.post('/api/reset', async (req, res) => {
  await resetDemoData();
  res.json({ ok: true, drivers: await drivers().countDocuments(), races: await races().countDocuments(), laps: await laps().countDocuments() });
});

// ------------------------------------------- NoSQL Functionality 1: CRUD

// READ (filtered + paginated: the collection holds a whole season)
app.get('/api/laps', async (req, res) => {
  const filter = {};
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
  const [results, total] = await Promise.all([laps().aggregate(pipeline).toArray(), laps().countDocuments(filter)]);
  res.json({ query: 'db.laps.aggregate(' + shell(pipeline) + ')', total, page, limit, results });
});

async function lapFromBody(body) {
  const t = body.telemetry || {};
  const round = num(body.round);
  const race = Number.isInteger(round) ? await races().findOne({ round }, { projection: { name: 1, circuit: 1, country: 1 } }) : null;
  return stripUndefined({
    driverId: body.driverId ? toObjectId(body.driverId) || body.driverId : undefined,
    raceId: race?._id,
    round,
    race: race?.name,
    circuit: race?.circuit,
    country: race?.country,
    lapNumber: num(body.lapNumber),
    lapTime: num(body.lapTime),
    position: num(body.position),
    telemetry: {
      speed: num(t.speed),
      rpm: num(t.rpm),
      throttle: num(t.throttle),
      brake: num(t.brake),
    },
  });
}

// MongoDB has no foreign keys, so referential integrity of driverId is an app-level check.
async function assertDriverExists(doc, res) {
  if (doc.driverId instanceof ObjectId && !(await drivers().findOne({ _id: doc.driverId }))) {
    res.status(400).json({ error: 'driverId does not reference an existing driver (MongoDB has no foreign keys — this is checked by the app).' });
    return false;
  }
  return true;
}

// CREATE
app.post('/api/laps', async (req, res) => {
  const doc = await lapFromBody(req.body || {});
  if (!(await assertDriverExists(doc, res))) return;
  try {
    const result = await laps().insertOne(doc);
    res.status(201).json({ query: 'db.laps.insertOne(' + shell(doc) + ')', insertedId: result.insertedId, document: doc });
  } catch (err) {
    if (err.code === 121) return res.status(400).json(validationErrorPayload(err));
    throw err;
  }
});

// UPDATE
app.put('/api/laps/:id', async (req, res) => {
  const _id = toObjectId(req.params.id);
  if (!_id) return res.status(400).json({ error: 'Invalid lap id' });
  const doc = await lapFromBody(req.body || {});
  if (!(await assertDriverExists(doc, res))) return;
  try {
    const result = await laps().replaceOne({ _id }, doc);
    if (result.matchedCount === 0) return res.status(404).json({ error: 'Lap not found' });
    res.json({ query: `db.laps.replaceOne({ _id: ObjectId("${_id}") }, ${shell(doc)})`, modifiedCount: result.modifiedCount });
  } catch (err) {
    if (err.code === 121) return res.status(400).json(validationErrorPayload(err));
    throw err;
  }
});

// DELETE
app.delete('/api/laps/:id', async (req, res) => {
  const _id = toObjectId(req.params.id);
  if (!_id) return res.status(400).json({ error: 'Invalid lap id' });
  const result = await laps().deleteOne({ _id });
  if (result.deletedCount === 0) return res.status(404).json({ error: 'Lap not found' });
  res.json({ query: `db.laps.deleteOne({ _id: ObjectId("${_id}") })`, deletedCount: result.deletedCount });
});

// ------------------------------- NoSQL Functionality 2: Aggregation Pipeline
// Championship standings, computed inside MongoDB from the embedded race + sprint results.

app.get('/api/nosql/aggregation', async (req, res) => {
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

// -------------------------------------------- NoSQL Functionality 3: Indexing

function planSummary(plan) {
  const s = plan.executionStats;
  const winning = plan.queryPlanner.winningPlan;
  return {
    winningPlan: winning,
    indexUsed: JSON.stringify(winning).match(/"indexName":"([^"]+)"/)?.[1] || null,
    nReturned: s.nReturned,
    totalKeysExamined: s.totalKeysExamined,
    totalDocsExamined: s.totalDocsExamined,
    executionTimeMillis: s.executionTimeMillis,
  };
}

app.get('/api/nosql/indexes', async (req, res) => {
  const indexes = await laps().indexes(); // same as db.laps.getIndexes()
  const sample = await laps().findOne({ round: 16 }) || await laps().findOne({});
  let explain = null;
  if (sample) {
    const filter = { driverId: sample.driverId, round: sample.round };
    const [withIndex, withoutIndex] = await Promise.all([
      laps().find(filter).explain('executionStats'),
      laps().find(filter).hint({ $natural: 1 }).explain('executionStats'),
    ]);
    const q = `db.laps.find({ driverId: ObjectId("${sample.driverId}"), round: ${sample.round} })`;
    explain = {
      query: `${q}.explain("executionStats")`,
      collscanQuery: `${q}.hint({ $natural: 1 }).explain("executionStats")`,
      ...planSummary(withIndex),
      collscan: planSummary(withoutIndex),
      totalDocs: await laps().estimatedDocumentCount(),
    };
  }
  res.json({ query: 'db.laps.getIndexes()', results: indexes, explain });
});

// ------------------------------------ NoSQL Functionality 4: Schema Validation

app.post('/api/nosql/invalid-insert', async (req, res) => {
  // Deliberately missing driverId, raceId, round, lapTime and telemetry; lapNumber has the wrong type.
  const invalidLap = { circuit: 'Monza', lapNumber: 'three' };
  try {
    await laps().insertOne({ ...invalidLap });
    res.status(500).json({ error: 'Unexpected: MongoDB accepted an invalid document. Is the validator installed?' });
  } catch (err) {
    if (err.code !== 121) throw err;
    const options = await getDb().listCollections({ name: 'laps' }).next();
    res.json({
      query: 'db.laps.insertOne(' + JSON.stringify(invalidLap) + ')',
      attemptedDocument: invalidLap,
      ...validationErrorPayload(err),
      validator: options.options.validator,
    });
  }
});

// -------------------- NoSQL Functionality 5: Embedded Documents & Referencing

app.get('/api/nosql/embedded', async (req, res) => {
  const [lap] = await laps().aggregate([{ $sample: { size: 1 } }]).toArray();
  if (!lap) return res.status(404).json({ error: 'No laps in the collection' });
  const [driver, race] = await Promise.all([
    drivers().findOne({ _id: lap.driverId }),
    races().findOne({ _id: lap.raceId }, { projection: { round: 1, name: 1, circuit: 1, country: 1, date: 1, laps: 1, results: { $slice: 3 } } }),
  ]);
  res.json({
    query:
      'db.laps.aggregate([{ $sample: { size: 1 } }])\n' +
      `db.drivers.findOne({ _id: ObjectId("${lap.driverId}") })\n` +
      `db.races.findOne({ _id: ObjectId("${lap.raceId}") }, { results: { $slice: 3 }, track: 0 })`,
    lap,
    referencedDriver: driver,
    referencedRace: race,
  });
});

// ------------------------------- User Functionality 1: laps for one driver

app.get('/api/user/driver-laps/:driverId', async (req, res) => {
  const driverId = toObjectId(req.params.driverId);
  if (!driverId) return res.status(400).json({ error: 'Invalid driver id' });
  const driver = await drivers().findOne({ _id: driverId });
  if (!driver) return res.status(404).json({ error: 'Driver not found' });
  const filter = { driverId };
  const round = intParam(req.query.round);
  if (round) filter.round = round;
  const results = await laps().find(filter).sort({ round: 1, lapNumber: 1 }).toArray();
  res.json({ query: `db.laps.find({ driverId: ObjectId("${driverId}")${round ? `, round: ${round}` : ''} }).sort({ round: 1, lapNumber: 1 })`, driver, results });
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
    { $match: { driverId: { $in: [a, b] }, pitIn: { $ne: true }, pitOut: { $ne: true }, lapNumber: { $gt: 1 } } },
    { $group: { _id: { driverId: '$driverId', round: '$round', race: '$race' }, avgLapTime: { $avg: '$lapTime' }, laps: { $sum: 1 } } },
    { $sort: { '_id.round': 1 } },
    { $group: { _id: '$_id.driverId', perRace: { $push: { round: '$_id.round', race: '$_id.race', avgLapTime: { $round: ['$avgLapTime', 3] }, laps: '$laps' } }, totalTime: { $sum: { $multiply: ['$avgLapTime', '$laps'] } }, laps: { $sum: '$laps' } } },
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

// ------------------------- User Functionality 3: fastest lap per driver in a race

app.get('/api/user/leaderboard', async (req, res) => {
  const round = intParam(req.query.round);
  if (!round) return res.status(400).json({ error: 'Pick a race (round 1-24)' });
  const pipeline = [
    { $match: { round, deleted: { $ne: true } } },
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
  res.json({ query: 'db.laps.aggregate(' + shell(pipeline) + ')', results: await laps().aggregate(pipeline).toArray() });
});

// ------------------------ User Functionality 4: laps above a speed threshold

app.get('/api/user/speed', async (req, res) => {
  const min = Number(req.query.min);
  if (req.query.min === undefined || req.query.min === '' || !Number.isFinite(min)) return res.status(400).json({ error: 'Enter a numeric speed threshold' });
  const filter = { 'telemetry.speed': { $gt: min } };
  const round = intParam(req.query.round);
  if (round) filter.round = round;
  const limit = Math.min(Math.max(intParam(req.query.limit) || 50, 1), 500);
  const pipeline = [{ $match: filter }, { $sort: { 'telemetry.speed': -1 } }, { $limit: limit }, ...lookupDriver];
  const [results, total] = await Promise.all([laps().aggregate(pipeline).toArray(), laps().countDocuments(filter)]);
  res.json({
    query: `db.laps.find({ "telemetry.speed": { $gt: ${min} }${round ? `, round: ${round}` : ''} }).sort({ "telemetry.speed": -1 }).limit(${limit})`,
    total,
    results,
  });
});

// ------------------- User Functionality 5: text search on race, circuit and country

app.get('/api/user/search', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'Enter a circuit, race or country to search for' });
  const pipeline = [
    { $match: { $text: { $search: q } } },
    { $group: { _id: '$round', race: { $first: '$race' }, circuit: { $first: '$circuit' }, country: { $first: '$country' }, score: { $max: { $meta: 'textScore' } }, laps: { $sum: 1 }, fastestLap: { $min: '$lapTime' }, topSpeed: { $max: '$telemetry.speed' } } },
    { $project: { _id: 0, round: '$_id', race: 1, circuit: 1, country: 1, laps: 1, fastestLap: 1, topSpeed: 1, score: { $round: ['$score', 2] } } },
    { $sort: { score: -1, round: 1 } },
  ];
  res.json({
    query: 'db.laps.aggregate(' + shell(pipeline) + ')',
    results: await laps().aggregate(pipeline).toArray(),
  });
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
