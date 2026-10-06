// One-off database setup, safe to run again at any time:
//   1. starts the single-node replica set (rs0) if MongoDB was started with --replSet but never initiated
//   2. applies the $jsonSchema validator on laps
//   3. creates the indexes, including { round, lapNumber } and the 2dsphere index on races.location
//   4. adds GeoJSON locations to circuits seeded before they existed
//   5. loads the 2025 season if the database is empty
// The server does steps 2-5 on every start too; docker compose does step 1 in the mongo healthcheck.
// Usage: npm run db:setup   (MONGO_URI and DB_NAME are read from the environment)
const { MongoClient } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';

async function initiateReplicaSet() {
  const direct = new MongoClient(MONGO_URI, { directConnection: true, serverSelectionTimeoutMS: 5000 });
  try {
    await direct.connect();
    const admin = direct.db('admin');
    try {
      const status = await admin.command({ replSetGetStatus: 1 });
      console.log(`[setup] Replica set "${status.set}" is already running`);
    } catch (err) {
      if (err.codeName === 'NotYetInitialized') {
        await admin.command({ replSetInitiate: { _id: 'rs0', members: [{ _id: 0, host: 'localhost:27017' }] } });
        console.log('[setup] Started replica set "rs0"');
        for (let i = 0; i < 30 && !(await admin.command({ hello: 1 })).isWritablePrimary; i++) await new Promise((r) => setTimeout(r, 1000));
      } else if (err.codeName === 'NoReplicationEnabled') {
        console.log('[setup] MongoDB was not started with --replSet, so transactions (steward penalties) will be unavailable. Use docker compose, or start mongod with --replSet rs0.');
      } else {
        throw err;
      }
    }
  } finally {
    await direct.close();
  }
}

(async () => {
  await initiateReplicaSet();
  const { init, client } = require('../db');
  const db = await init();
  const [laps, races, indexes] = await Promise.all([
    db.collection('laps').estimatedDocumentCount(),
    db.collection('races').countDocuments({ location: { $exists: true } }),
    db.collection('laps').indexes(),
  ]);
  console.log(`[setup] ${laps} laps, ${races} circuits with GeoJSON locations, laps indexes: ${indexes.map((i) => i.name).join(', ')}`);
  await client.close();
})().catch((err) => {
  console.error('[setup] ' + err.message);
  process.exit(1);
});
