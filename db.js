// MongoDB connection, collection setup (schema validation + indexes) and seeding
// with the real 2025 Formula 1 season from data/season-2025.json.gz.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { MongoClient, ObjectId } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'motorsport';
const SEASON_FILE = path.join(__dirname, 'data', 'season-2025.json.gz');

// $jsonSchema validator for the laps collection. MongoDB itself enforces this
// on every insert/update — the app does not pre-validate these fields.
const lapsValidator = {
  $jsonSchema: {
    bsonType: 'object',
    title: 'Lap document validation',
    required: ['driverId', 'lapNumber', 'lapTime', 'telemetry'],
    properties: {
      driverId: {
        bsonType: 'objectId',
        description: 'must be an ObjectId referencing drivers._id (required)',
      },
      raceId: {
        bsonType: 'objectId',
        description: 'must be an ObjectId referencing races._id if present',
      },
      round: {
        bsonType: ['int', 'long'],
        minimum: 1,
        maximum: 24,
        description: 'championship round, an integer from 1 to 24 if present',
      },
      lapNumber: {
        bsonType: ['int', 'long'],
        minimum: 1,
        description: 'must be an integer >= 1 (required)',
      },
      lapTime: {
        bsonType: 'number',
        minimum: 0,
        description: 'lap time in seconds, must be a number >= 0 (required)',
      },
      position: {
        bsonType: ['int', 'long', 'null'],
        minimum: 1,
        description: 'running position at the end of the lap',
      },
      compound: {
        enum: ['SOFT', 'MEDIUM', 'HARD', 'INTERMEDIATE', 'WET', null],
        description: 'tyre compound, one of the Pirelli compounds if present',
      },
      source: {
        enum: ['steward'],
        description: 'only set on laps added in Steward mode, which are not real race data',
      },
      stewardEdited: {
        bsonType: 'bool',
        description: 'true once a steward has changed a real lap',
      },
      deleted: {
        bsonType: 'bool',
        description: 'true when a steward has hidden the lap (soft delete)',
      },
      timeDeleted: {
        bsonType: 'bool',
        description: 'true when the FIA struck off the lap time (track limits); the lap still counts',
      },
      penaltySeconds: {
        bsonType: 'number',
        minimum: 0,
        description: 'time penalties a steward added to this lap, in seconds',
      },
      circuit: {
        bsonType: 'string',
        description: 'circuit name, must be a string if present',
      },
      telemetry: {
        bsonType: 'object',
        required: ['speed', 'rpm', 'throttle', 'brake'],
        description: 'embedded telemetry sub-document (required)',
        properties: {
          speed: { bsonType: 'number', minimum: 0, description: 'top speed in km/h' },
          rpm: { bsonType: 'number', minimum: 0, description: 'peak engine RPM' },
          throttle: { bsonType: 'number', minimum: 0, maximum: 100, description: 'average throttle %' },
          brake: { bsonType: 'number', minimum: 0, maximum: 100, description: '% of lap spent braking' },
          drs: { bsonType: 'number', minimum: 0, maximum: 100, description: '% of lap with DRS open' },
        },
      },
    },
  },
};

// $jsonSchema validator for lap notes (user content, never race data).
const annotationsValidator = {
  $jsonSchema: {
    bsonType: 'object',
    title: 'Lap note validation',
    required: ['round', 'author', 'text', 'helpful', 'tags', 'pinned', 'createdAt'],
    properties: {
      round: { bsonType: ['int', 'long'], minimum: 1, maximum: 24 },
      lapNumber: { bsonType: ['int', 'long', 'null'], minimum: 1 },
      driverId: { bsonType: ['objectId', 'null'] },
      author: { bsonType: 'string', minLength: 1, maxLength: 40 },
      text: { bsonType: 'string', minLength: 1, maxLength: 280 },
      helpful: { bsonType: ['int', 'long'], minimum: 0 },
      tags: { bsonType: 'array', maxItems: 8, items: { bsonType: 'string', minLength: 1, maxLength: 24 } },
      pinned: { bsonType: 'bool' },
      createdAt: { bsonType: 'date' },
      editedAt: { bsonType: 'date' },
    },
  },
};

// Racing laps only: no opening lap, pit in/out laps, steward changes, or laps
// slower than 107% of that race's fastest lap (safety cars, traffic, damage).
const cleanLapsPipeline = [
  { $match: { deleted: { $ne: true }, source: { $ne: 'steward' }, lapNumber: { $gt: 1 }, pitIn: { $ne: true }, pitOut: { $ne: true } } },
  { $setWindowFields: { partitionBy: '$round', output: { raceBest: { $min: '$lapTime' } } } },
  { $match: { $expr: { $lte: ['$lapTime', { $multiply: ['$raceBest', 1.07] }] } } },
  { $unset: 'raceBest' },
];

const TEAM_NAMES = {
  mclaren: 'McLaren',
  mercedes: 'Mercedes',
  'red-bull': 'Red Bull Racing',
  ferrari: 'Ferrari',
  williams: 'Williams',
  'racing-bulls': 'Racing Bulls',
  'aston-martin': 'Aston Martin',
  haas: 'Haas F1 Team',
  'kick-sauber': 'Kick Sauber',
  sauber: 'Kick Sauber',
  alpine: 'Alpine',
};

let season;
function loadSeason() {
  if (!season) season = JSON.parse(zlib.gunzipSync(fs.readFileSync(SEASON_FILE)).toString('utf8'));
  return season;
}

const client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 3000 });
let db;

async function connectWithRetry(attempts = 75, delayMs = 2000) {
  for (let i = 1; i <= attempts; i++) {
    try {
      await client.connect();
      await client.db('admin').command({ ping: 1 });
      db = client.db(DB_NAME);
      console.log(`[db] Connected to MongoDB at ${MONGO_URI} (database "${DB_NAME}")`);
      return db;
    } catch (err) {
      console.log(`[db] MongoDB not reachable yet (attempt ${i}/${attempts}): ${err.message}`);
      if (i === 1) console.log('[db] Is MongoDB running? Start it with "docker compose up -d mongo" (or start MongoDB Community Server). Retrying...');
      if (i === attempts) {
        throw new Error(
          `Could not connect to MongoDB at ${MONGO_URI}. Start it with "docker compose up -d mongo" ` +
            'or start your local MongoDB Community Server, then run "npm start" again.'
        );
      }
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

// Creates the laps collection with its validator (or re-applies it with collMod),
// then creates the indexes. Safe to run on every startup.
async function setupCollections() {
  const existing = await db.listCollections({ name: 'laps' }).toArray();
  const options = { validator: lapsValidator, validationLevel: 'strict', validationAction: 'error' };
  if (existing.length === 0) {
    await db.createCollection('laps', options);
    console.log('[db] Created "laps" collection with $jsonSchema validator');
  } else {
    await db.command({ collMod: 'laps', ...options });
    console.log('[db] Applied $jsonSchema validator to existing "laps" collection');
  }

  const laps = db.collection('laps');
  // Indexes on laps: the default _id index, two compound indexes and a text index.
  // Drop the ones an earlier version of the app created.
  for (const old of ['driverId_1_round_1_lapNumber_1', 'round_1_lapTime_1', 'race_circuit_country_text']) await laps.dropIndex(old).catch(() => {});
  await laps.createIndex({ driverId: 1, lapNumber: 1 }, { name: 'driverId_1_lapNumber_1' });
  // Serves the Race page: every lap of one round, in lap order.
  await laps.createIndex({ round: 1, lapNumber: 1 }, { name: 'round_1_lapNumber_1' });
  await laps.createIndex({ circuit: 'text' }, { name: 'circuit_text' });
  // Databases seeded before timeDeleted existed: move the FIA flag out of "deleted".
  await laps.updateMany({ deleted: true, timeDeleted: { $exists: false }, stewardEdited: { $ne: true } }, { $set: { deleted: false, timeDeleted: true } });
  await db.collection('races').createIndex({ round: 1 }, { name: 'round_1', unique: true });
  // GeoJSON point for every circuit (migrates races seeded before it existed), with a 2dsphere index for $geoNear.
  await db.collection('races').updateMany({ location: { $exists: false }, lat: { $type: 'number' } }, [
    { $set: { location: { type: 'Point', coordinates: ['$lng', '$lat'] } } },
  ]);
  await db.collection('races').createIndex({ location: '2dsphere' }, { name: 'location_2dsphere' });
  await db.collection('drivers').createIndex({ key: 1 }, { name: 'key_1', unique: true });
  console.log('[db] Ensured indexes on laps, races and drivers');
  await setupUserCollections();
}

async function ensureCollection(name, options) {
  if ((await db.listCollections({ name }).toArray()).length === 0) await db.createCollection(name, options);
  else if (options.validator || options.viewOn) await db.command({ collMod: name, ...options });
}

// Collections added for the newer features. None of them write to laps, races or drivers.
async function setupUserCollections() {
  await ensureCollection('annotations', { validator: annotationsValidator, validationLevel: 'strict', validationAction: 'error' });
  await db.collection('annotations').createIndex({ round: 1, createdAt: -1 }, { name: 'round_1_createdAt_-1' });
  await ensureCollection('clean_laps', { viewOn: 'laps', pipeline: cleanLapsPipeline });
  await ensureCollection('notes_feed', { capped: true, size: 65536, max: 50 });
  await ensureCollection('shared_comparisons', {});
  await db.collection('shared_comparisons').createIndex({ createdAt: 1 }, { name: 'createdAt_ttl', expireAfterSeconds: 7 * 24 * 3600 });
  await db.collection('circuits').createIndex({ location: '2dsphere' }, { name: 'location_2dsphere' });
}

// One-time seed of circuit reference data (GeoJSON points) from the race calendar.
async function seedCircuits() {
  const circuits = db.collection('circuits');
  if ((await circuits.countDocuments()) > 0) return;
  const docs = await db.collection('races').find({}, { projection: { round: 1, name: 1, circuit: 1, circuitFullName: 1, locality: 1, country: 1, countryCode: 1, lat: 1, lng: 1 } }).sort({ round: 1 }).toArray();
  if (!docs.length) return;
  await circuits.insertMany(docs.map(({ _id, lat, lng, ...r }) => ({ ...r, location: { type: 'Point', coordinates: [lng, lat] } })));
  console.log(`[seed] Inserted ${docs.length} circuits with GeoJSON locations`);
}

// Reference data for the Driver and Team pages: careers and team histories from
// F1DB (data/profiles.json) plus written notes (data/profiles-notes.json).
// Replaced on every start, never read by any statistic.
async function seedProfiles() {
  const facts = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'profiles.json'), 'utf8'));
  const notes = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'profiles-notes.json'), 'utf8'));
  const driverDocs = Object.entries(facts.drivers).map(([key, f]) => ({ _id: key, ...f, bio: notes.drivers[key] || null, source: facts.source }));
  const teamDocs = Object.entries(facts.teams).map(([key, f]) => ({ _id: TEAM_NAMES[key] || key, key, ...f, ...(notes.teams[key] || {}), source: facts.source }));
  for (const [name, docs] of [['driver_profiles', driverDocs], ['team_profiles', teamDocs]]) {
    await db.collection(name).deleteMany({});
    await db.collection(name).insertMany(docs);
  }
}

// Rebuilds season_summary from races and laps with $merge (run by "npm run summary:rebuild" and on first start).
async function rebuildSeasonSummary() {
  const target = (whenMatched) => ({ $merge: { into: 'season_summary', on: '_id', whenMatched, whenNotMatched: 'insert' } });
  await db.collection('season_summary').deleteMany({});
  // 1. Points, wins and podiums from every race and sprint classification.
  await db.collection('races').aggregate([
    { $project: { entries: { $concatArrays: [{ $map: { input: '$results', in: { $mergeObjects: ['$$this', { kind: 'race' }] } } }, { $map: { input: { $ifNull: ['$sprint', []] }, in: { $mergeObjects: ['$$this', { kind: 'sprint' }] } } }] } } },
    { $unwind: '$entries' },
    { $replaceWith: '$entries' },
    { $group: {
      _id: '$driverId',
      points: { $sum: { $ifNull: ['$points', 0] } },
      wins: { $sum: { $cond: [{ $and: [{ $eq: ['$kind', 'race'] }, { $eq: ['$position', 1] }] }, 1, 0] } },
      podiums: { $sum: { $cond: [{ $and: [{ $eq: ['$kind', 'race'] }, { $lte: ['$position', 3] }, { $gte: ['$position', 1] }] }, 1, 0] } },
      starts: { $sum: { $cond: [{ $eq: ['$kind', 'race'] }, 1, 0] } },
      team: { $last: '$team' },
    } },
    target('replace'),
  ]).toArray();
  // 2. Lap statistics from the clean_laps view, merged into the same documents.
  await db.collection('clean_laps').aggregate([
    { $group: { _id: '$driverId', racingLaps: { $sum: 1 }, topSpeed: { $max: '$telemetry.speed' }, avgThrottle: { $avg: '$telemetry.throttle' } } },
    { $set: { avgThrottle: { $round: ['$avgThrottle', 1] } } },
    target('merge'),
  ]).toArray();
  // 3. Championship position, worked out on the summary itself and merged back.
  await db.collection('season_summary').aggregate([
    { $setWindowFields: { sortBy: { points: -1 }, output: { position: { $rank: {} } } } },
    { $lookup: { from: 'drivers', localField: '_id', foreignField: '_id', as: 'driver' } },
    { $set: { code: { $first: '$driver.code' }, name: { $first: '$driver.name' }, key: { $first: '$driver.key' }, builtAt: '$$NOW' } },
    { $unset: 'driver' },
    target('merge'),
  ]).toArray();
  return db.collection('season_summary').countDocuments();
}

async function seedIfEmpty() {
  const drivers = db.collection('drivers');
  const races = db.collection('races');
  const laps = db.collection('laps');
  if ((await drivers.countDocuments()) > 0 && (await races.countDocuments()) > 0 && (await laps.countDocuments()) > 0) return;

  // Partial or old-format data: start clean so every reference lines up.
  await Promise.all([drivers.deleteMany({}), races.deleteMany({}), laps.deleteMany({})]);
  const data = loadSeason();

  const driverDocs = data.drivers.map((d) => ({ _id: new ObjectId(), ...d }));
  const driverIdByKey = new Map(driverDocs.map((d) => [d.key, d._id]));
  await drivers.insertMany(driverDocs);

  const teamOf = (c) => TEAM_NAMES[c] || c;
  const classification = (rows) =>
    rows &&
    rows.map(({ driver, constructor, ...r }) => ({ driverId: driverIdByKey.get(driver), team: teamOf(constructor), ...r }));
  const raceDocs = data.races.map((r) => ({
    _id: new ObjectId(),
    ...r,
    location: { type: 'Point', coordinates: [r.lng, r.lat] },
    results: classification(r.results),
    sprint: classification(r.sprint),
  }));
  const raceByRound = new Map(raceDocs.map((r) => [r.round, r]));
  await races.insertMany(raceDocs);

  const lapDocs = data.laps.map(({ driver, round, sectors, speedTrap, deleted, ...lap }) => {
    const race = raceByRound.get(round);
    return {
      driverId: driverIdByKey.get(driver),
      raceId: race._id,
      round,
      race: race.name,
      circuit: race.circuit,
      country: race.country,
      ...lap,
      sectors: { s1: sectors[0], s2: sectors[1], s3: sectors[2] },
      telemetry: { ...lap.telemetry, speedTrap },
      // The source data's "deleted" is the FIA striking off a lap time; deleted here means hidden by a steward.
      timeDeleted: !!deleted,
      deleted: false,
    };
  });
  for (let i = 0; i < lapDocs.length; i += 5000) await laps.insertMany(lapDocs.slice(i, i + 5000), { ordered: false });
  console.log(`[seed] Inserted ${driverDocs.length} drivers, ${raceDocs.length} races and ${lapDocs.length} laps (2025 season)`);
}

async function resetDemoData() {
  for (const name of ['laps', 'races', 'drivers']) await db.collection(name).drop().catch(() => {});
  await setupCollections();
  await seedIfEmpty();
  await rebuildSeasonSummary();
}

async function init() {
  await connectWithRetry();
  await setupCollections();
  await seedIfEmpty();
  await seedCircuits();
  await seedProfiles();
  if ((await db.collection('season_summary').countDocuments()) === 0) console.log(`[db] Built season_summary with $merge (${await rebuildSeasonSummary()} drivers)`);
  return db;
}

module.exports = {
  init,
  resetDemoData,
  rebuildSeasonSummary,
  cleanLapsPipeline,
  getDb: () => db,
  client,
};
