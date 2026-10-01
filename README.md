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

- The server creates the `laps` collection with its `$jsonSchema` validator, creates the indexes, and loads the 2025 season from `data/season-2025.json.gz` into MongoDB (about 2 seconds). You'll see this in the terminal.
- Stop it with `Ctrl+C`. Start it again later with `docker compose up`.
- The data is kept in a Docker volume between runs. To wipe it and reload the season, click **Reset demo data** in the Data lab, or run `docker compose down -v` and start again.

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
| **Season** (`/`) | Hero, the title fight (points chart that draws itself as you scroll), the 24-race calendar (slides sideways as you scroll), final driver and constructor standings, and a season-wide speed trap. |
| **Race** (`/race/16`) | The circuit drawn from the car's real GPS trace, coloured by speed, with a car lapping it at the real pace of that race's fastest lap. Podium, race story (every position change, lap by lap), full classification, fastest-lap leaderboard and a speed trap for that race. |
| **Driver** (`/driver/lando-norris`) | Championship stats, a portrait where hovering over the head puts the driver's helmet on, the season at a glance (result in every round), and a lap explorer: every lap of any race with its tyre, pit stops and telemetry. |
| **Team** (`/team/mclaren`) | A 3D model of the team's car in its colours that you can drag around (it settles back to the side view when you let go), the team's drivers, and its points round by round. |
| **Head to head** (`/compare`) | Two drivers compared race by race on average racing-lap pace, plus who finished ahead each weekend. |
| **Data lab** (`/lab`) | All 10 functionalities in one place, numbered 01 to 10 and labelled *NoSQL Functionality 1–5* and *User Functionality 1–5*, each with the exact query it runs. |
| **Search** (press `/` or ⌘K) | Full-text search for a circuit (e.g. *monza*, *marina bay*), plus drivers by name. |

Every feature has a **MongoDB query** drop-down that shows the exact query it ran, which is useful while presenting.

### Where each of the 10 functionalities lives

| # | Functionality | Where on the site | MongoDB feature shown |
|---|---|---|---|
| NoSQL 1 | CRUD operations | Data lab → 01 | `insertOne`, `aggregate` + `$lookup` (read), `replaceOne`, `deleteOne` |
| NoSQL 2 | Aggregation pipeline | Data lab → 02 (*Show avg + fastest lap per driver*) | `$group` with `$avg`, `$min`, `$sum`, then `$lookup`, `$sort` |
| NoSQL 3 | Indexing | Data lab → 03 | `getIndexes()` (`_id`, compound `{ driverId, lapNumber }`, text on `circuit`), `explain()` IXSCAN vs COLLSCAN |
| NoSQL 4 | Schema validation | Data lab → 04 (*Try inserting an invalid lap*) | `$jsonSchema` validator, error code 121 |
| NoSQL 5 | Embedded documents & referencing | Data lab → 05 | embedded `telemetry`, `driverId` reference to `drivers` |
| User 1 | All laps for a driver | Data lab → 06 (also the lap explorer on each driver page) | `find({ driverId })` sorted by circuit and lap number, on the compound index |
| User 2 | Head-to-head comparison | Data lab → 07 (also the Head to head page) | `$match` + `$group` (overall and per circuit) + `$lookup` |
| User 3 | Fastest lap leaderboard | Data lab → 08 (also per race on each race page) | `$sort` + `$group` with `$first: "$$ROOT"` |
| User 4 | Laps above a speed threshold | Data lab → 09 (also the speed trap on the season and race pages) | dot notation `find({ "telemetry.speed": { $gt: N } })` |
| User 5 | Search by circuit | Data lab → 10 (also the search box, `/`) | `$text: { $search }` on the circuit text index, sorted by `textScore` |

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

**`races`** (24 documents). Each race embeds its classification (and sprint classification) as arrays of sub-documents, plus the circuit trace used for the maps.

```js
{ _id: ObjectId("..."), round: 16, name: "Italian Grand Prix", circuit: "Monza",
  circuitFullName: "Autodromo Nazionale Monza", country: "Italy", date: "2025-09-07", laps: 53,
  results: [ { position: 1, driverId: ObjectId("..."), team: "Red Bull Racing", grid: 1, points: 25, ... }, ... ],
  sprint: null,
  track: { x: [...], y: [...], speed: [...], lap: { code: "NOR", lapNumber: 53, lapTime: 80.901 } },
  corners: [ { number: 1, x: ..., y: ... }, ... ] }
```

**`laps`** (26,657 documents), validated by `$jsonSchema`. Required: `driverId`, `lapNumber`, `lapTime`, `telemetry` (with types and ranges checked; `raceId` and `round` are type-checked when present).

```js
{
  _id: ObjectId("..."),
  driverId: ObjectId("..."),   // reference -> drivers._id
  raceId: ObjectId("..."),     // reference -> races._id
  round: 16, race: "Italian Grand Prix", circuit: "Monza", country: "Italy",
  lapNumber: 53, lapTime: 80.901, position: 2,
  compound: "HARD", stint: 2, tyreLife: 29, pitIn: false, pitOut: false, deleted: false,
  sectors: { s1: 26.6, s2: 27.1, s3: 27.2 },   // embedded
  telemetry: {                 // embedded sub-document, summarised from the car data of that lap
    speed: 336.0,              // top speed, km/h
    avgSpeed: 257.8,           // average speed, km/h
    rpm: 11912,                // peak engine RPM
    throttle: 81.3,            // % of the lap at full/partial throttle (time-weighted average)
    brake: 10.9,               // % of the lap on the brakes
    drs: 21.4,                 // % of the lap with DRS open
    gear: 8,                   // highest gear
    speedTrap: 331             // speed at the official speed trap
  }
}
```

**Indexes on `laps`:** three, exactly as `db.laps.getIndexes()` lists them: `_id` (default), `{ driverId: 1, lapNumber: 1 }` (compound) and `{ circuit: "text" }` (text). `races.round` and `drivers.key` have unique indexes.

### The 10 functionalities in detail

**NoSQL 1: CRUD.** The Data lab's lap editor builds a lap document (including the embedded `telemetry` object) and stores it with `insertOne()`. The table below it reads laps with an aggregation that filters by race and driver, pages with `$skip`/`$limit`, and `$lookup`s each lap's driver. *Edit* loads a row into the form and saving calls `replaceOne({ _id })`; *Delete* calls `deleteOne({ _id })`. The app doesn't validate fields itself, so leaving a required field blank lets you see MongoDB's validator reject the write. MongoDB has no foreign keys, so the app checks that the chosen driver exists and fills in `raceId` from the chosen round. After any write, every page re-reads MongoDB, so standings, charts and leaderboards update straight away.

**NoSQL 2: Aggregation pipeline.** The *Show avg + fastest lap per driver* button runs a pipeline inside MongoDB. `$group` groups laps by `driverId` and computes `$avg: "$lapTime"` (average lap), `$min: "$lapTime"` (fastest lap) and `$sum: 1` (lap count). `$lookup` joins the `drivers` collection to get each driver's name, `$unwind` flattens it, `$project` rounds the output and `$sort` orders drivers by average. It's the MongoDB equivalent of SQL's `GROUP BY` with `AVG()`, `MIN()` and a `JOIN`. The table shows each driver's gap to the best average as a bar. (A season average depends on which circuits a driver raced at, which is why User Functionality 2 also compares circuit by circuit.) The championship standings on the season page use the same stages on the race results embedded in each race document.

**NoSQL 3: Indexing.** Shows `db.laps.getIndexes()` with a card per index, then runs the same query, `find({ driverId, lapNumber })`, twice with `explain("executionStats")`: once normally (MongoDB picks an `IXSCAN` on `driverId_1_lapNumber_1` and reads only the ~24 matching documents) and once forced to a full collection scan with `hint({ $natural: 1 })` (it reads all 26,657). The bars make the difference obvious.

**NoSQL 4: Schema validation.** The `laps` collection has a `$jsonSchema` validator (`validationLevel: "strict"`, `validationAction: "error"`). The button tries `insertOne({ circuit: "Monza", lapNumber: "three" })`. MongoDB rejects it with `Document failed validation` (code `121`), and the page shows the full `errInfo` (code `121`, `DocumentValidationFailure`: missing `driverId`, `lapTime` and `telemetry`, and `lapNumber` has the wrong type) next to a readable summary and the validator itself.

**NoSQL 5: Embedded documents & referencing.** Shows a random lap as raw JSON next to the documents it references. `telemetry` and `sectors` are **embedded**: they belong to exactly one lap and come back in the same read. `driverId` and `raceId` are **references**: a driver is stored once and referenced by over a thousand laps (one-to-many), joined with `$lookup` when needed. Races show a third pattern: their classification is an embedded **array** of sub-documents, which the standings pipeline unwinds.

**User 1: All laps for a driver.** Choose a driver from the dropdown and it runs `db.laps.find({ driverId }).sort({ circuit: 1, lapNumber: 1 })`, listing every lap with its telemetry and highlighting the personal best. `driverId` is the leading field of the compound index, so MongoDB answers it with an index scan. Each driver's page has the same query for one race (`find({ driverId, round })`), with every lap plotted by tyre.

**User 2: Head to head.** Pick two drivers. `$match` keeps both drivers' racing laps (no lap 1, no pit laps), a first `$group` averages lap time per driver *per circuit*, a second `$group` rolls those up into an overall average with a `$push`ed per-circuit breakdown, and `$lookup` adds the driver. The result is two side-by-side cards with who's faster and by how much, plus a per-circuit table. The per-circuit table makes it fair, because a Silverstone lap is about 7 seconds longer than a Monza lap. The Head to head page also uses `$filter` on the races' embedded results to show who finished ahead each weekend.

**User 3: Fastest lap leaderboard.** *Show fastest lap per driver* `$sort`s every lap by time, then `$group` with `$first: "$$ROOT"` keeps each driver's whole fastest lap document (not just the time, as `$min` would), including its circuit, lap number and top speed. The result is a P1, P2, P3… table with each driver's gap to the leader. Each race page shows the same leaderboard for that race only.

**User 4: Laps above a speed threshold.** Enter a speed (default 340 km/h) and *Find laps* runs `db.laps.find({ "telemetry.speed": { $gt: N } }).sort({ "telemetry.speed": -1 })`. The speed trap sliders on the season and race pages run the same query. Dot notation filters on a field inside the embedded sub-document.

**User 5: Search by circuit.** The search box runs a full-text search, `$text: { $search: "..." }`, which uses the text index on `circuit`, and sorts results by relevance (`textScore`). *monza* finds the Monza laps, *MONZA* finds the same (it ignores case), and *monza silverstone* matches laps at either circuit. Drivers are matched by name on the page itself.

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

It writes `web/public/img/drivers/credits.json` with each photo's author, licence and source link, and the credit is shown under the photo. The `head` box in that file (`x`, `y`, `w` as percentages of the photo) is where the helmet appears on hover; nudge it if a helmet sits off someone's face. Drivers without a photo get a silhouette, and the helmets are drawn by the site in team colours, so they need no licence.

The same command also looks on Commons for a reusable photo of each driver's real helmet and saves it to `web/public/img/drivers/helmets/`. A **Drawn / Real** switch on the driver portrait flips between the drawn helmet and that photo (with its credit); the choice is remembered across driver pages, and **Real** stays greyed out for drivers with no helmet photo yet.

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

`npm test` (14 tests) starts the real server against a throwaway `motorsport_test` database, loads the full season and checks: the season loaded (24 races, 21 drivers, 26,657 laps) · CRUD insert / update / delete plus a validator rejection (121) and an unknown-driver rejection · the avg + fastest lap pipeline and its sort order · standings (Norris 423, Verstappen 421, Piastri 410) · exactly three indexes, and that `explain()` uses the compound index and examines only the matching documents while a forced scan examines all of them · the invalid insert's missing fields · embedded telemetry and both references · a driver's laps for the season and for one race · head to head · the fastest-lap leaderboard, season-wide and for Monza · the speed threshold · text search (monza, MONZA, monza silverstone, no match) · reset.

---

## Project structure

```
motorsport-viz/
├── docker-compose.yml   # mongo:7 (with healthcheck + volume) and the app
├── Dockerfile           # builds the website, then runs the Express server
├── package.json         # npm start / dev / test / data:build
├── server.js            # Express API (one endpoint group per functionality) + serves the website
├── db.js                # connection + retry, $jsonSchema validator, indexes, loads the season
├── data/
│   └── season-2025.json.gz   # the 2025 season (results, circuits, 26,657 laps with telemetry)
├── scripts/
│   └── build_season.py  # rebuilds the season file from F1DB + TracingInsights
├── vite.config.mjs      # builds web/ into dist/
├── web/
│   ├── index.html
│   ├── public/          # favicon, img/ (hero photo goes here)
│   └── src/
│       ├── App.jsx      # routes, smooth scrolling, page transitions
│       ├── pages/       # Home, Race, Driver, Compare, Lab
│       ├── components/  # TrackMap, TitleFight, Calendar, RaceTrace, Leaderboard, SearchPalette, ...
│       ├── lib/         # API client, router, formatting, circuit geometry
│       └── styles.css
└── test/
    └── api.test.js      # end-to-end API tests (node:test)
```

### API reference

| Method & path | Used by |
|---|---|
| `GET /api/health`, `GET /api/drivers`, `GET /api/races`, `GET /api/races/:round`, `POST /api/reset` | every page / Data lab reset |
| `GET /api/races/:round/laps` | race story chart |
| `GET /api/laps?round=&driverId=&page=&limit=`, `POST /api/laps`, `PUT /api/laps/:id`, `DELETE /api/laps/:id` | NoSQL 1 (CRUD) |
| `GET /api/nosql/aggregation`, `GET /api/season/progression`, `GET /api/season/constructors` | NoSQL 2 (standings, title chart, constructors) |
| `GET /api/nosql/indexes` | NoSQL 3 |
| `POST /api/nosql/invalid-insert` | NoSQL 4 |
| `GET /api/nosql/embedded` | NoSQL 5 |
| `GET /api/user/driver-laps/:driverId?round=`, `GET /api/drivers/:id/season` | User 1, driver page |
| `GET /api/user/compare?a=&b=` | User 2 |
| `GET /api/user/leaderboard?round=` | User 3 |
| `GET /api/user/speed?min=&round=` | User 4 |
| `GET /api/user/search?q=` | User 5 |

*Unofficial fan project. Not associated with Formula 1 or the FIA. F1 and related marks are trademarks of Formula One Licensing B.V.*
