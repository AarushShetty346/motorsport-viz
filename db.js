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
  // Three indexes on laps: the default _id index, a compound index and a text index.
  // Drop the ones an earlier version of the app created.
  for (const old of ['driverId_1_round_1_lapNumber_1', 'round_1_lapTime_1', 'race_circuit_country_text']) await laps.dropIndex(old).catch(() => {});
  await laps.createIndex({ driverId: 1, lapNumber: 1 }, { name: 'driverId_1_lapNumber_1' });
  await laps.createIndex({ circuit: 'text' }, { name: 'circuit_text' });
  await db.collection('races').createIndex({ round: 1 }, { name: 'round_1', unique: true });
  await db.collection('drivers').createIndex({ key: 1 }, { name: 'key_1', unique: true });
  console.log('[db] Ensured indexes on laps, races and drivers');
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
    results: classification(r.results),
    sprint: classification(r.sprint),
  }));
  const raceByRound = new Map(raceDocs.map((r) => [r.round, r]));
  await races.insertMany(raceDocs);

  const lapDocs = data.laps.map(({ driver, round, sectors, speedTrap, ...lap }) => {
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
    };
  });
  for (let i = 0; i < lapDocs.length; i += 5000) await laps.insertMany(lapDocs.slice(i, i + 5000), { ordered: false });
  console.log(`[seed] Inserted ${driverDocs.length} drivers, ${raceDocs.length} races and ${lapDocs.length} laps (2025 season)`);
}

async function resetDemoData() {
  for (const name of ['laps', 'races', 'drivers']) await db.collection(name).drop().catch(() => {});
  await setupCollections();
  await seedIfEmpty();
}

async function init() {
  await connectWithRetry();
  await setupCollections();
  await seedIfEmpty();
  return db;
}

module.exports = {
  init,
  resetDemoData,
  getDb: () => db,
  client,
};
