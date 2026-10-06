// Rebuilds the season_summary collection (standings + per-driver season stats)
// from races and the clean_laps view with $merge. Run after the data changes:
//   npm run summary:rebuild   (MONGO_URI and DB_NAME are read from the environment)
const { init, rebuildSeasonSummary, client } = require('../db');

init()
  .then(rebuildSeasonSummary)
  .then((n) => console.log(`[summary] season_summary rebuilt with $merge: ${n} drivers`))
  .catch((err) => { console.error(err.message); process.exitCode = 1; })
  .finally(() => client.close());
