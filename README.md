# Lap by Lap

**The 2025 Formula 1 season, every lap and every car, stored in MongoDB.**

Lap by Lap is a full-stack web app built on a **local MongoDB** database. It holds the real 2025 season: all 24 Grands Prix, 21 drivers and **26,657 laps**, and every lap carries its own car telemetry (top speed, peak RPM, throttle, braking, DRS). You can replay each circuit, follow the title fight round by round, dig into any driver's laps, put two drivers head to head, and look under the hood at the MongoDB queries behind every screen.

- **Backend:** Node.js + Express, talking to MongoDB with the official driver.
- **Frontend:** React, built with Vite. Smooth scrolling with [Lenis](https://github.com/darkroomengineering/lenis), scroll-linked animation with [Motion](https://motion.dev), and circuit replays with [anime.js](https://animejs.com) motion paths.
- **Database:** MongoDB 7 running in Docker on your own laptop. No cloud account, no sign-up.

---

## 1. Run it on your laptop (one command)

**You need:** [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running. That's all. Node.js and MongoDB both run inside Docker.

1. Open a terminal.
2. Download the project and go into its folder:
   ```bash
   git clone https://github.com/AarushShetty346/motorsport-viz.git
   cd motorsport-viz
   ```
3. Start everything:
   ```bash
   docker compose up --build
   ```
4. Wait until the terminal prints `Lap by Lap is running at http://localhost:3000`, then open **http://localhost:3000** in your browser.

What happens on the first start:

- MongoDB starts as a single-node replica set (`rs0`, needed for transactions); the healthcheck runs `rs.initiate()` once.
- The server creates the `laps` collection with its `$jsonSchema` validator, creates the indexes, adds GeoJSON locations to the circuits, and loads the 2025 season from `data/season-2025.json.gz` into MongoDB (about 2 seconds). You'll see this in the terminal.
- Stop it with `Ctrl+C`. Start it again later with `docker compose up`.
- The data is kept in a Docker volume between runs. To wipe it and reload the season, turn on **Steward mode** on any Race page and click **Reset demo data**, or run `docker compose down -v` and start again.

> **Offline note:** the *first* `docker compose up --build` needs internet once, to download the `mongo:7` and `node:22-alpine` images and the npm packages. After that everything runs fully offline, including the fonts and the season data. **Run it once before your demo** while you're online.

### Option B: MongoDB in Docker, Node.js on your laptop

Use this if you have Node.js 20.19 or newer installed and want to run the server yourself.

1. Start only MongoDB:
   ```bash
   docker compose up -d mongo
   ```
2. Install the packages (first time only):
   ```bash
   npm install
   ```
3. Build the website and start the server:
   ```bash
   npm start
   ```
   (`npm start` builds the React app into `dist/` and then starts Express.) Open **http://localhost:3000**.

While you're changing the website, `npm run dev` gives you live reload on http://localhost:5173 (keep `npm run serve` running in a second terminal for the API).

### Option C: no Docker (MongoDB Community Server installed locally)

1. **Install Node.js 20.19 or newer** from https://nodejs.org (the LTS installer).
2. **Install MongoDB Community Server** (7.0 or 8.0):
   - **Windows:** download the `.msi` from https://www.mongodb.com/try/download/community. Choose *Complete* and keep **"Install MongoD as a Service"** ticked. MongoDB then runs automatically on `localhost:27017`.
   - **macOS (Homebrew):**
     ```bash
     brew tap mongodb/brew
     brew install mongodb-community@7.0
     brew services start mongodb-community@7.0
     ```
   - **Ubuntu/Debian:** follow https://www.mongodb.com/docs/manual/administration/install-on-linux/, then run `sudo systemctl start mongod`.
3. **Check it's running:** `mongosh --eval "db.adminCommand('ping')"` should print `{ ok: 1 }`.
4. **Run the app** from the project folder:
   ```bash
   npm install
   npm start
   ```
   Open **http://localhost:3000**.

The app connects to `mongodb://localhost:27017` by default. To use a different server, set environment variables, e.g. `MONGO_URI=mongodb://127.0.0.1:27018 DB_NAME=motorsport npm start` (Windows PowerShell: `$env:MONGO_URI="mongodb://127.0.0.1:27018"; npm start`).

### Handy commands

| Command | What it does |
|---|---|
| `docker compose up --build` | Start MongoDB + the app (the one command) |
| `docker compose down` | Stop everything (keeps the data) |
| `docker compose down -v` | Stop and **delete** the data volume (reloads the season next start) |
| `npm start` | Build the website, then start the server (Options B and C) |
| `npm run dev` | Website with live reload on port 5173 (needs the server running) |
| `npm run db:setup` | Set up the database by hand: start the replica set if needed, apply the validator, create the indexes and circuit locations, load the season |
| `npm run shell` | Open `mongosh` inside the MongoDB container, on the `motorsport` database |
| `npm test` | Run the API test suite (needs MongoDB on localhost:27017) |
| `npm run data:build` | Re-download and rebuild the season file (see section 4) |

Useful things to type in `mongosh` during a demo:

```js
db.laps.countDocuments()                                   // 26657
db.laps.find({ round: 16 }).limit(2)                        // Monza laps
db.laps.getIndexes()
db.getCollectionInfos({ name: "laps" })[0].options.validator
db.laps.insertOne({ circuit: "Monza" })                     // -> Document failed validation
rs.status().set                                             // "rs0"
db.laps.find({ $text: { $search: "silverstone" } }).count()
db.races.findOne({ round: 24 }, { results: { $slice: 3 }, track: 0 })
```

### Troubleshooting

- **"port is already allocated" for 27017:** another MongoDB is already running. Stop it, or change `"27017:27017"` to `"27018:27017"` in `docker-compose.yml`.
- **Port 3000 in use:** change `"3000:3000"` to e.g. `"8080:3000"` in `docker-compose.yml` and open http://localhost:8080 (or `PORT=8080 npm start` for Options B and C).
- **"Cannot connect to the Docker daemon":** start Docker Desktop and wait until it says it's running.
- **The server keeps printing "MongoDB not reachable yet":** MongoDB isn't running. Start it (see above). The server retries for about 2.5 minutes before giving up.
- **The page says the web app hasn't been built:** you ran `node server.js` directly. Run `npm start` (or `npm run build` once) instead.

---

## 2. The website

| Page | What's on it |
|---|---|
| **Season** (`/`) | Hero, the title fight (points chart that draws itself as you scroll), the 24-race calendar, a map of every circuit, final driver and constructor standings, the season's biggest movers and a season-wide speed trap. |
| **Race** (`/race/16`) | The circuit drawn from the car's GPS trace, the podium, every position change, the gap to the leader lap by lap, "Race in numbers", the classification, the fastest-lap leaderboard, nearby circuits, a speed trap, tyre strategy, pit stops, biggest movers and every lap of the race with **Steward mode**. |
| **Driver** (`/driver/lando-norris`) | Championship stats, the season at a glance, season lap stats, and a lap explorer: every lap of any race with its tyre, pit stops, telemetry and the theoretical best lap. |
| **Team** (`/team/mclaren`) | A 3D model of the team's car in its colours that you can drag around, the team's drivers, its points round by round and its tyre degradation against the field. |
| **Head to head** (`/compare`) | Two drivers compared race by race on average racing-lap pace, plus who finished ahead each weekend. |
| **Search** (press `/` or Ctrl+K) | Full-text search for a circuit (e.g. *monza*, *marina bay*), plus drivers by name. |

Every feature sits inside these normal pages. Under each one there is a small grey caption naming the feature and its type, e.g. *Aggregation: $group + $lookup (Mongo)* or *Head-to-head comparison (User)*, and an **Under the hood** drop-down with the exact query it ran and, for queries on `laps`, what `explain()` says (IXSCAN or COLLSCAN, documents examined, time).

Clicking any lap (in the Race page lap table, the Driver page lap explorer or a speed trap) opens a drawer with that lap's raw MongoDB document.

### Steward mode and "not real" data

The **Every lap** table on each Race page has a **Steward mode** switch. With it on you can add, edit, penalise, hide and delete laps:

- A lap added in Steward mode is stored with `source: "steward"`. It shows in purple with an **(added)** tag.
- A real lap a steward changes (edit or penalty) gets `stewardEdited: true` and an orange **(edited)** tag.
- Steward laps appear in the lap tables but are left out of every leaderboard, standing, fastest lap, chart and statistic.
- Real laps can't be deleted, only hidden (`deleted: true`). Hidden laps disappear from every page and query; in Steward mode they show greyed out with a **Restore** button.
- **Reset demo data** (in the Steward mode bar) reloads the whole season and undoes every steward change.

### The 20 features: where they are and how to show them in a demo

| # | Feature | Page | How to trigger it live | MongoDB query / pipeline |
|---|---|---|---|---|
| N1 | CRUD | Race → *Every lap* | Tick **Steward mode**. **Add lap** → fill in → *Add lap*. **Edit** a row → *Save lap*. **Delete** an added lap. The table itself is the read. | `insertOne`, `aggregate([$match, $sort, $skip, $limit, $lookup])`, `updateOne({ _id }, { $set })`, `deleteOne({ _id, source: "steward" })` |
| N2 | Aggregation ($group, $lookup) | Driver → *Season stats, every lap*; Season → *Final standings* | Open any driver page; on the Season page open the standings' *Under the hood* | laps: `$match` → `$group` (`$avg`, `$min`, `$sum`) → `$lookup` drivers → `$project`. Standings: `$unwind` results → `$group` → `$lookup` → `$sort` |
| N3 | Indexing | Race → *Race story* (and every *Under the hood*) | Open *Under the hood* under the race story: IXSCAN on `round_1_lapNumber_1`, ~970 docs examined vs all 26,657 for the forced COLLSCAN | `db.laps.createIndex({ round: 1, lapNumber: 1 })`, `find({ round }).sort({ lapNumber: 1 }).explain("executionStats")` vs `.hint({ $natural: 1 })` |
| N4 | Schema validation | Race → *Every lap* | Steward mode → **Add lap** → type `fast` as the lap time → *Add lap*. MongoDB's real error appears inside the form. | `$jsonSchema` validator on `laps` (`validationLevel: "strict"`), error code 121 `DocumentValidationFailure` |
| N5 | Embedded + referencing | Any lap table | Click a lap. The drawer highlights the embedded `telemetry` and `sectors`; click `driverId` or `raceId` to open that driver or race. | `db.laps.findOne({ _id })` |
| N6 | Update operators | Race → *Every lap* | Steward mode → **Apply 5 s penalty**, **Hide** / **Restore**, **Restore all hidden laps** | `$inc: { lapTime: 5, penaltySeconds: 5 }`, `$set: { deleted: true/false, stewardEdited: true }`, `updateMany({ round, deleted: true }, { $set: { deleted: false } })` |
| N7 | $facet + $bucket | Race → *Race in numbers* | Open any race | One `aggregate`: `$match` → `$facet { histogram: [$bucket on lapTime], compounds: [$group], summary: [$group] }` |
| N8 | Window functions | Race → *Gap to leader* | Open any race; hover a line | `$setWindowFields` (running `$sum` of lap time per driver) → `$setWindowFields` (`$min` per lap) → gap = race time − leader's |
| N9 | Geospatial | Season → *Where they raced*; Race → *Nearby circuits* | Open the Season page map, or any race's nearby list | `races.location` GeoJSON `Point`, `createIndex({ location: "2dsphere" })`, `$geoNear` |
| N10 | Transactions | Race → *Every lap* | Steward mode → **Apply 5 s penalty**. The lap and the race result (`+5s (edited)` in the classification) change together. | `session.withTransaction(() => { laps.updateOne($inc); races.updateOne({ "results.$[r].penaltySeconds": $inc }, { arrayFilters }) })` on the `rs0` replica set |
| U1 | All laps for a driver | Driver → *Lap explorer* | Pick a race in the dropdown or the season strip | `find({ driverId, round, deleted: { $ne: true } }).sort({ circuit: 1, lapNumber: 1 })` |
| U2 | Head-to-head | Head to head | Pick two drivers | `$match` → `$group` per circuit → `$group` overall → `$lookup`; `$filter` on the races' embedded results |
| U3 | Fastest lap leaderboard | Race → *Fastest laps* | Open any race | `$sort: { lapTime: 1 }` → `$group` with `$first: "$$ROOT"` → `$lookup` |
| U4 | Speed trap | Season and Race | Drag the speed slider | `find({ "telemetry.speed": { $gt: N } }).sort({ "telemetry.speed": -1 })` |
| U5 | Search by circuit | Search (`/` or Ctrl+K) | Type *monza* or *marina bay* | `$match: { $text: { $search } }` → `$group` by round, sorted by `textScore` |
| U6 | Tyre strategy chart | Race → *Tyre strategy* | Open any race | `$group` by driver + stint (compound, first and last lap) → `$group` by driver |
| U7 | Pit stop analysis | Race → *Pit stops* | Open any race | `$group` per driver: stops, `$push` pit laps, in-lap + out-lap time minus two average racing laps |
| U8 | Biggest movers | Race → *Biggest movers*; Season → *Season movers* | Open any race, or scroll the Season page | `$unwind` results → `$group` sum of `grid − position` → `$lookup` → `$sort` |
| U9 | Theoretical best lap | Driver → *Lap explorer* | Pick a race | `$group` with `$min` of `sectors.s1/s2/s3` and `lapTime` → `$add` → difference |
| U10 | Tyre degradation | Team → *Tyre degradation* | Open any team | `$setWindowFields` (race's fastest lap) → pace % → `$lookup` driver team → `$group` by tyre age (team vs field) |

---

## 3. How it works

### Data model

Three collections in the `motorsport` database.

**`drivers`** (21 documents)

```js
{ _id: ObjectId("..."), key: "lando-norris", code: "NOR", name: "Lando Norris",
  firstName: "Lando", lastName: "Norris", number: 4, team: "McLaren", teamColor: "#F47600",
  nationality: "British", countryCode: "GB", dateOfBirth: "1999-11-13" }
```

**`races`** (24 documents). Each race embeds its classification (and sprint classification) as arrays of sub-documents, the circuit trace used for the maps, and the circuit's location as GeoJSON.

```js
{ _id: ObjectId("..."), round: 16, name: "Italian Grand Prix", circuit: "Monza",
  circuitFullName: "Autodromo Nazionale Monza", country: "Italy", date: "2025-09-07", laps: 53,
  location: { type: "Point", coordinates: [9.289444, 45.620556] },   // 2dsphere index
  results: [ { position: 1, driverId: ObjectId("..."), team: "Red Bull Racing", grid: 1, points: 25, ... }, ... ],
  sprint: null,
  track: { x: [...], y: [...], speed: [...], lap: { code: "NOR", lapNumber: 53, lapTime: 80.901 } },
  corners: [ { number: 1, x: ..., y: ... }, ... ] }
```

**`laps`** (26,657 documents), validated by `$jsonSchema`. Required: `driverId`, `lapNumber`, `lapTime`, `telemetry` (with types and ranges checked). `source` may only be `"steward"`; `stewardEdited` and `deleted` must be booleans.

```js
{
  _id: ObjectId("..."),
  driverId: ObjectId("..."),   // reference -> drivers._id
  raceId: ObjectId("..."),     // reference -> races._id
  round: 16, race: "Italian Grand Prix", circuit: "Monza", country: "Italy",
  lapNumber: 53, lapTime: 80.901, position: 2,
  compound: "HARD", stint: 2, tyreLife: 29, pitIn: false, pitOut: false,
  deleted: false,              // true only when a steward hides the lap
  timeDeleted: false,          // true when the FIA struck off the lap time for track limits (still a real lap)
  sectors: { s1: 26.6, s2: 27.1, s3: 27.2 },   // embedded
  telemetry: { speed: 336.0, avgSpeed: 257.8, rpm: 11912, throttle: 81.3, brake: 10.9, drs: 21.4, gear: 8, speedTrap: 331 }
  // Steward mode only: source: "steward", stewardEdited: true, penaltySeconds: 5
}
```

**Indexes on `laps`:** `_id` (default), `{ driverId: 1, lapNumber: 1 }` (Driver page), `{ round: 1, lapNumber: 1 }` (Race page) and `{ circuit: "text" }` (search). `races` has a unique index on `round` and a `2dsphere` index on `location`; `drivers.key` is unique.

**Replica set:** MongoDB runs as a single-node replica set called `rs0`, because multi-document transactions (the steward penalty) need one. `docker compose up` starts it with `--replSet rs0` and the healthcheck runs `rs.initiate()` the first time.

---

## 4. Where the data comes from

All of it is real and free to reuse:

- **Race results, points, calendar, circuits and drivers:** [F1DB](https://github.com/f1db/f1db) (CC BY 4.0).
- **Every lap and its telemetry:** the [TracingInsights 2025 archive](https://github.com/TracingInsights/2025) (Apache-2.0), which is built from the official F1 live-timing feed via [FastF1](https://github.com/theOehrly/Fast-F1). For each lap the raw car data (several hundred samples) is summarised into top speed, peak RPM, throttle, braking and DRS figures.
- **Circuit maps:** the car's own X/Y position trace on each race's fastest lap, so every map is exactly the line the car drove.

The ready-made file `data/season-2025.json.gz` (about 1 MB) is in the repo, so you don't need to download anything. To rebuild it yourself (Python 3.9+ and `pip install pyyaml`; it downloads about 4 GB of telemetry and takes 15-45 minutes):

```bash
npm run data:build
```

### Hero photo

The home page hero is designed around a podium photo. Put a free-licensed photo at `web/public/img/podium.jpg` (Wikimedia Commons has real F1 podium champagne photos you can reuse: search [Formula 1 podium champagne](https://commons.wikimedia.org/w/index.php?search=Formula+1+podium+champagne&title=Special:MediaSearch&type=image)), then fill in the author, licence and link in `web/src/content.js`. The credit line appears on the photo and in the footer. Until a photo is there, the hero shows the Abu Dhabi circuit instead.

### Driver photos

The driver pages show a head-and-shoulders photo when one is in `web/public/img/drivers/`. To fetch free-licensed photos (CC BY, CC BY-SA, CC0 or public domain only) from Wikimedia Commons for every driver:

```bash
npm run photos:fetch
```

It writes `web/public/img/drivers/credits.json` with each photo's author, licence and source link, and the credit is shown under the photo. Drivers without a photo get a silhouette.

### Car photos and models

Each team page has an **Animated / Real car** switch. *Animated* is the 3D car the site draws in the team's colours. *Real* shows a photo or a 3D model of that team's actual 2025 car, loaded from `web/public/img/cars/`.

To add real car photos:

1. Run `npm run cars:fetch`. It downloads only freely licensed photos from Wikimedia Commons (CC BY, CC BY-SA, CC0 or public domain) to `web/public/img/cars/<team>.jpg`.
2. It also writes each photo's author, licence and source link to `web/public/img/cars/credits.json`. The team page shows that credit under the photo.
3. Open each photo and check that it really shows that team's 2025 car before you commit it.

To use a 3D model instead of a photo:

1. Put a `.glb` file of the car in `web/public/img/cars/`.
2. In `credits.json`, add these to that team's entry: `"model"` (the file name), `"modelAuthor"`, `"modelLicense"` and `"modelSourceUrl"`.
3. If the car faces the wrong way, also add `"modelRotate": 180`.

Until a team has a photo or a model, the real view shows a silhouette.

---

## 5. Tests

`npm test` (17 tests) starts the real server against a throwaway `motorsport_test` database, loads the full season and checks every feature: CRUD and the validator's code 121 rejection, Steward mode (added laps kept out of leaderboards and the speed trap, real laps refused by DELETE, hide / restore / `updateMany`, and the penalty transaction changing both the lap and the race result), the indexes and `explain()` (IXSCAN on `round_1_lapNumber_1` vs a full COLLSCAN), hidden laps being filtered out, standings, head to head, the fastest-lap leaderboard, the speed threshold, text search, the `$facet`, window-function, stint, pit stop, movers, theoretical best, tyre degradation and `$geoNear` queries, and reset. It needs MongoDB running (`docker compose up -d mongo`).

---

## Project structure

```
motorsport-viz/
├── docker-compose.yml   # mongo:7 as replica set rs0 (healthcheck initiates it, volume) and the app
├── Dockerfile           # builds the website, then runs the Express server
├── package.json         # npm start / dev / test / data:build
├── server.js            # Express API (one endpoint group per functionality) + serves the website
├── db.js                # connection + retry, $jsonSchema validator, indexes, circuit locations, loads the season
├── data/
│   └── season-2025.json.gz   # the 2025 season (results, circuits, 26,657 laps with telemetry)
├── scripts/
│   ├── setup-db.js      # npm run db:setup: replica set, validator, indexes, circuit locations, seed
│   └── build_season.py  # rebuilds the season file from F1DB + TracingInsights
├── vite.config.mjs      # builds web/ into dist/
├── web/
│   ├── index.html
│   ├── public/          # favicon, img/ (hero photo goes here)
│   └── src/
│       ├── App.jsx      # routes, smooth scrolling, page transitions
│       ├── pages/       # Home, Race, Driver, Team, Compare
│       ├── components/  # TrackMap, TitleFight, Calendar, RaceTrace, Leaderboard, SearchPalette, ...
│       ├── lib/         # API client, router, formatting, circuit geometry
│       └── styles.css
└── test/
    └── api.test.js      # end-to-end API tests (node:test)
```

### API reference

| Method & path | Feature |
|---|---|
| `GET /api/health`, `GET /api/drivers`, `GET /api/races`, `GET /api/races/:round`, `POST /api/reset` | every page, Reset demo data |
| `GET /api/races/:round/laps` | race story chart, N3 explain() |
| `GET /api/laps?round=&driverId=&page=&limit=&steward=1`, `GET /api/laps/:id`, `POST /api/laps`, `PUT /api/laps/:id`, `DELETE /api/laps/:id` | N1 CRUD, N4 validation, N5 lap drawer |
| `PATCH /api/laps/:id/hidden`, `POST /api/races/:round/restore` | N6 update operators |
| `POST /api/laps/:id/penalty` | N6 `$inc` + N10 transaction |
| `GET /api/drivers/:id/stats`, `GET /api/season/standings`, `GET /api/season/progression`, `GET /api/season/constructors`, `GET /api/teams/:team/season` | N2 aggregation |
| `GET /api/races/:round/numbers` | N7 `$facet` + `$bucket` |
| `GET /api/races/:round/gaps` | N8 `$setWindowFields` |
| `GET /api/races/:round/nearby` | N9 `$geoNear` |
| `GET /api/user/driver-laps/:driverId?round=`, `GET /api/drivers/:id/season` | U1 |
| `GET /api/user/compare?a=&b=` | U2 |
| `GET /api/user/leaderboard?round=` | U3 |
| `GET /api/user/speed?min=&round=` | U4 |
| `GET /api/user/search?q=` | U5 |
| `GET /api/races/:round/stints` | U6 |
| `GET /api/races/:round/pitstops` | U7 |
| `GET /api/movers?round=` | U8 |
| `GET /api/drivers/:id/theoretical?round=` | U9 |
| `GET /api/teams/:team/degradation` | U10 |

*Unofficial fan project. Not associated with Formula 1 or the FIA. F1 and related marks are trademarks of Formula One Licensing B.V.*
