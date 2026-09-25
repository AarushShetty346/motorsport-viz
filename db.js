// MongoDB connection, collection setup (schema validation + indexes) and seeding.
const { MongoClient } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'motorsport';

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
        },
      },
    },
  },
};

const seedDrivers = [
  { name: 'Max Verstappen', team: 'Red Bull', number: 1 },
  { name: 'Charles Leclerc', team: 'Ferrari', number: 16 },
  { name: 'Lando Norris', team: 'McLaren', number: 4 },
];

// Keyed by driver number so they can be linked to the inserted driver _ids.
// lapTime is in seconds. Telemetry: speed = top speed (km/h), rpm = peak RPM,
// throttle = average throttle application (%), brake = % of the lap on the brakes.
const seedLaps = [
  { number: 1, lapNumber: 1, lapTime: 81.452, circuit: 'Monza', telemetry: { speed: 348.2, rpm: 11870, throttle: 81.4, brake: 11.2 } },
  { number: 1, lapNumber: 2, lapTime: 80.987, circuit: 'Monza', telemetry: { speed: 351.6, rpm: 11950, throttle: 82.1, brake: 10.8 } },
  { number: 1, lapNumber: 1, lapTime: 88.301, circuit: 'Silverstone', telemetry: { speed: 322.4, rpm: 11780, throttle: 71.3, brake: 13.9 } },
  { number: 16, lapNumber: 1, lapTime: 81.203, circuit: 'Monza', telemetry: { speed: 352.9, rpm: 12010, throttle: 81.9, brake: 11.0 } },
  { number: 16, lapNumber: 1, lapTime: 88.912, circuit: 'Silverstone', telemetry: { speed: 318.7, rpm: 11820, throttle: 70.2, brake: 14.6 } },
  { number: 4, lapNumber: 1, lapTime: 81.588, circuit: 'Monza', telemetry: { speed: 346.1, rpm: 11840, throttle: 80.7, brake: 11.5 } },
  { number: 4, lapNumber: 1, lapTime: 87.964, circuit: 'Silverstone', telemetry: { speed: 325.3, rpm: 11910, throttle: 72.4, brake: 13.2 } },
  { number: 4, lapNumber: 2, lapTime: 88.417, circuit: 'Silverstone', telemetry: { speed: 323.8, rpm: 11890, throttle: 71.8, brake: 13.6 } },
];

const client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 3000 });
let db;

async function connectWithRetry(attempts = 30, delayMs = 2000) {
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
  if (existing.length === 0) {
    await db.createCollection('laps', {
      validator: lapsValidator,
      validationLevel: 'strict',
      validationAction: 'error',
    });
    console.log('[db] Created "laps" collection with $jsonSchema validator');
  } else {
    await db.command({
      collMod: 'laps',
      validator: lapsValidator,
      validationLevel: 'strict',
      validationAction: 'error',
    });
    console.log('[db] Applied $jsonSchema validator to existing "laps" collection');
  }

  const laps = db.collection('laps');
  await laps.createIndex({ driverId: 1, lapNumber: 1 }, { name: 'driverId_1_lapNumber_1' });
  await laps.createIndex({ circuit: 'text' }, { name: 'circuit_text' });
  console.log('[db] Ensured indexes: { driverId: 1, lapNumber: 1 } and { circuit: "text" }');
}

async function seedIfEmpty() {
  const drivers = db.collection('drivers');
  const laps = db.collection('laps');

  if ((await drivers.countDocuments()) === 0) {
    await drivers.insertMany(seedDrivers.map((d) => ({ ...d })));
    console.log(`[seed] Inserted ${seedDrivers.length} drivers`);
  }

  if ((await laps.countDocuments()) === 0) {
    const byNumber = new Map();
    for (const d of await drivers.find().toArray()) byNumber.set(d.number, d._id);
    const docs = seedLaps
      .filter((l) => byNumber.has(l.number))
      .map(({ number, ...lap }) => ({ driverId: byNumber.get(number), ...lap }));
    if (docs.length) {
      await laps.insertMany(docs);
      console.log(`[seed] Inserted ${docs.length} laps`);
    }
  }
}

async function resetDemoData() {
  await db.collection('laps').drop().catch(() => {});
  await db.collection('drivers').drop().catch(() => {});
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
