// Motorsport Lap by Lap Visualiser — Express API + static frontend.
const path = require('path');
const express = require('express');
const { ObjectId } = require('mongodb');
const { init, resetDemoData, getDb, client } = require('./db');

const PORT = Number(process.env.PORT) || 3000;
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const laps = () => getDb().collection('laps');
const drivers = () => getDb().collection('drivers');

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

function stripUndefined(obj) {
  for (const k of Object.keys(obj)) {
    if (obj[k] === undefined) delete obj[k];
    else if (obj[k] && typeof obj[k] === 'object' && !(obj[k] instanceof ObjectId)) stripUndefined(obj[k]);
  }
  return obj;
}

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

// ---------------------------------------------------------------- general

app.get('/api/health', async (req, res) => {
  await getDb().command({ ping: 1 });
  res.json({ ok: true, db: getDb().databaseName });
});

app.get('/api/drivers', async (req, res) => {
  res.json(await drivers().find().sort({ number: 1 }).toArray());
});

app.post('/api/reset', async (req, res) => {
  await resetDemoData();
  res.json({ ok: true, drivers: await drivers().countDocuments(), laps: await laps().countDocuments() });
});

// ------------------------------------------- NoSQL Functionality 1: CRUD

// READ
app.get('/api/laps', async (req, res) => {
  const pipeline = [...lookupDriver, { $sort: { circuit: 1, lapTime: 1 } }];
  res.json({
    query: 'db.laps.aggregate([{ $lookup: { from: "drivers", localField: "driverId", foreignField: "_id", as: "driver" } }, { $unwind: "$driver" }, { $sort: { circuit: 1, lapTime: 1 } }])',
    results: await laps().aggregate(pipeline).toArray(),
  });
});

function lapFromBody(body) {
  const t = body.telemetry || {};
  return stripUndefined({
    driverId: body.driverId ? toObjectId(body.driverId) || body.driverId : undefined,
    lapNumber: num(body.lapNumber),
    lapTime: num(body.lapTime),
    circuit: body.circuit ? String(body.circuit).trim() : undefined,
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
  const doc = lapFromBody(req.body || {});
  if (!(await assertDriverExists(doc, res))) return;
  try {
    const result = await laps().insertOne(doc);
    res.status(201).json({ query: 'db.laps.insertOne(' + JSON.stringify(doc) + ')', insertedId: result.insertedId, document: doc });
  } catch (err) {
    if (err.code === 121) return res.status(400).json(validationErrorPayload(err));
    throw err;
  }
});

// UPDATE
app.put('/api/laps/:id', async (req, res) => {
  const _id = toObjectId(req.params.id);
  if (!_id) return res.status(400).json({ error: 'Invalid lap id' });
  const doc = lapFromBody(req.body || {});
  if (!(await assertDriverExists(doc, res))) return;
  try {
    const result = await laps().replaceOne({ _id }, doc);
    if (result.matchedCount === 0) return res.status(404).json({ error: 'Lap not found' });
    res.json({ query: `db.laps.replaceOne({ _id: ObjectId("${_id}") }, ${JSON.stringify(doc)})`, modifiedCount: result.modifiedCount });
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

app.get('/api/nosql/aggregation', async (req, res) => {
  const pipeline = [
    { $group: { _id: '$driverId', avgLapTime: { $avg: '$lapTime' }, fastestLap: { $min: '$lapTime' }, laps: { $sum: 1 } } },
    { $lookup: { from: 'drivers', localField: '_id', foreignField: '_id', as: 'driver' } },
    { $unwind: '$driver' },
    { $project: { _id: 0, driverId: '$_id', name: '$driver.name', team: '$driver.team', number: '$driver.number', avgLapTime: { $round: ['$avgLapTime', 3] }, fastestLap: 1, laps: 1 } },
    { $sort: { avgLapTime: 1 } },
  ];
  res.json({ query: 'db.laps.aggregate(' + JSON.stringify(pipeline, null, 2) + ')', results: await laps().aggregate(pipeline).toArray() });
});

// -------------------------------------------- NoSQL Functionality 3: Indexing

app.get('/api/nosql/indexes', async (req, res) => {
  const indexes = await laps().indexes(); // same as db.laps.getIndexes()
  const sample = await laps().findOne({}, { sort: { _id: 1 } });
  let explain = null;
  if (sample) {
    const plan = await laps()
      .find({ driverId: sample.driverId, lapNumber: sample.lapNumber })
      .explain('queryPlanner');
    const winning = plan.queryPlanner.winningPlan;
    explain = {
      query: `db.laps.find({ driverId: ObjectId("${sample.driverId}"), lapNumber: ${sample.lapNumber} }).explain()`,
      winningPlan: winning,
      indexUsed: JSON.stringify(winning).match(/"indexName":"([^"]+)"/)?.[1] || null,
    };
  }
  res.json({ query: 'db.laps.getIndexes()', results: indexes, explain });
});

// ------------------------------------ NoSQL Functionality 4: Schema Validation

app.post('/api/nosql/invalid-insert', async (req, res) => {
  // Deliberately missing driverId, lapTime and telemetry; lapNumber has the wrong type.
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
  const driver = await drivers().findOne({ _id: lap.driverId });
  res.json({
    query: `db.laps.aggregate([{ $sample: { size: 1 } }])  then  db.drivers.findOne({ _id: ObjectId("${lap.driverId}") })`,
    lap,
    referencedDriver: driver,
  });
});

// ------------------------------- User Functionality 1: laps for one driver

app.get('/api/user/driver-laps/:driverId', async (req, res) => {
  const driverId = toObjectId(req.params.driverId);
  if (!driverId) return res.status(400).json({ error: 'Invalid driver id' });
  const driver = await drivers().findOne({ _id: driverId });
  if (!driver) return res.status(404).json({ error: 'Driver not found' });
  const results = await laps().find({ driverId }).sort({ circuit: 1, lapNumber: 1 }).toArray();
  res.json({ query: `db.laps.find({ driverId: ObjectId("${driverId}") }).sort({ circuit: 1, lapNumber: 1 })`, driver, results });
});

// -------------------------- User Functionality 2: compare two drivers' averages

app.get('/api/user/compare', async (req, res) => {
  const a = toObjectId(req.query.a);
  const b = toObjectId(req.query.b);
  if (!a || !b) return res.status(400).json({ error: 'Pick two drivers' });
  const pipeline = [
    { $match: { driverId: { $in: [a, b] } } },
    { $group: { _id: { driverId: '$driverId', circuit: '$circuit' }, avgLapTime: { $avg: '$lapTime' }, laps: { $sum: 1 } } },
    { $group: { _id: '$_id.driverId', perCircuit: { $push: { circuit: '$_id.circuit', avgLapTime: { $round: ['$avgLapTime', 3] }, laps: '$laps' } }, totalTime: { $sum: { $multiply: ['$avgLapTime', '$laps'] } }, laps: { $sum: '$laps' } } },
    { $project: { avgLapTime: { $round: [{ $divide: ['$totalTime', '$laps'] }, 3] }, laps: 1, perCircuit: 1 } },
    { $lookup: { from: 'drivers', localField: '_id', foreignField: '_id', as: 'driver' } },
    { $unwind: '$driver' },
  ];
  const rows = await laps().aggregate(pipeline).toArray();
  const pick = (id) => {
    const row = rows.find((r) => r._id.equals(id));
    return row || null;
  };
  const [aDriver, bDriver] = await Promise.all([drivers().findOne({ _id: a }), drivers().findOne({ _id: b })]);
  res.json({
    query: 'db.laps.aggregate(' + JSON.stringify(pipeline, null, 2) + ')',
    results: [
      { driver: aDriver, stats: pick(a) },
      { driver: bDriver, stats: pick(b) },
    ],
  });
});

// ------------------------- User Functionality 3: fastest lap per driver

app.get('/api/user/leaderboard', async (req, res) => {
  const pipeline = [
    { $sort: { lapTime: 1 } },
    { $group: { _id: '$driverId', fastestLap: { $first: '$$ROOT' } } },
    { $lookup: { from: 'drivers', localField: '_id', foreignField: '_id', as: 'driver' } },
    { $unwind: '$driver' },
    { $project: { _id: 0, name: '$driver.name', team: '$driver.team', number: '$driver.number', lapTime: '$fastestLap.lapTime', lapNumber: '$fastestLap.lapNumber', circuit: '$fastestLap.circuit', topSpeed: '$fastestLap.telemetry.speed' } },
    { $sort: { lapTime: 1 } },
  ];
  res.json({ query: 'db.laps.aggregate(' + JSON.stringify(pipeline, null, 2) + ')', results: await laps().aggregate(pipeline).toArray() });
});

// ------------------------ User Functionality 4: laps above a speed threshold

app.get('/api/user/speed', async (req, res) => {
  const min = Number(req.query.min);
  if (!Number.isFinite(min)) return res.status(400).json({ error: 'Enter a numeric speed threshold' });
  const pipeline = [{ $match: { 'telemetry.speed': { $gt: min } } }, ...lookupDriver, { $sort: { 'telemetry.speed': -1 } }];
  res.json({ query: `db.laps.find({ "telemetry.speed": { $gt: ${min} } }).sort({ "telemetry.speed": -1 })`, results: await laps().aggregate(pipeline).toArray() });
});

// ------------------- User Functionality 5: text search on circuit name

app.get('/api/user/search', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'Enter a circuit name to search for' });
  const pipeline = [
    { $match: { $text: { $search: q } } },
    { $addFields: { score: { $meta: 'textScore' } } },
    ...lookupDriver,
    { $sort: { score: -1, lapTime: 1 } },
  ];
  res.json({
    query: `db.laps.find({ $text: { $search: ${JSON.stringify(q)} } }, { score: { $meta: "textScore" } }).sort({ score: { $meta: "textScore" } })`,
    results: await laps().aggregate(pipeline).toArray(),
  });
});

// ---------------------------------------------------------------- errors

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

app.use((err, req, res, next) => {
  console.error('[error]', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

init()
  .then(() => {
    const server = app.listen(PORT, () => {
      console.log(`\n  Motorsport Lap by Lap Visualiser running at http://localhost:${PORT}\n`);
    });
    const shutdown = () => server.close(() => client.close().finally(() => process.exit(0)));
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  })
  .catch((err) => {
    console.error('[startup] ' + err.message);
    process.exit(1);
  });
