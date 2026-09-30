# Motorsport Lap by Lap Visualiser

A full-stack DBMS / MongoDB demo: a single-page dashboard for motorsport lap data. It runs **entirely on your own machine** — Node.js + Express backend, plain HTML/CSS/JS frontend (no build step), and a **local MongoDB** in Docker. No MongoDB Atlas, no cloud account, no sign-up.

The dashboard has 10 clearly labelled sections, and each one runs a live query against MongoDB:

| # | Section | MongoDB feature shown |
|---|---------|-----------------------|
| NoSQL Functionality 1 | CRUD Operations | `insertOne`, `find`/`aggregate`, `replaceOne`, `deleteOne` |
| NoSQL Functionality 2 | Aggregation Pipeline | `$group`, `$avg`, `$min`, `$lookup`, `$sort` |
| NoSQL Functionality 3 | Indexing | `getIndexes()`, compound + text index, `explain()` |
| NoSQL Functionality 4 | Schema Validation | `$jsonSchema` validator, error code 121 |
| NoSQL Functionality 5 | Embedded Documents & Referencing | nested `telemetry`, `driverId` → `drivers._id` |
| User Functionality 1 | All laps for a driver | `find({ driverId })` (uses the compound index) |
| User Functionality 2 | Head-to-head average lap time | two-stage `$group` + `$lookup` |
| User Functionality 3 | Fastest lap leaderboard | `$sort` + `$group` with `$first` |
| User Functionality 4 | Laps above a speed threshold | dot notation `{ "telemetry.speed": { $gt: N } }` |
| User Functionality 5 | Search laps by circuit | `$text` search on the text index + `textScore` |

Every section has a **"MongoDB query"** drop-down that shows the exact shell query it ran, which is useful while presenting.

---

## 1. Setup on your laptop (one command)

**You need:** [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running. That's all. Node.js and MongoDB run inside Docker.

```bash
git clone https://github.com/AarushShetty346/motorsport-viz.git
cd motorsport-viz
docker compose up --build
```

Then open **http://localhost:3000**.

- On first start, the server creates the `laps` collection with its `$jsonSchema` validator, creates the indexes, and seeds 3 drivers and 8 laps. You'll see this in the terminal.
- Stop it with `Ctrl+C`. Start it again later with `docker compose up`.
- The data is kept in a Docker volume between runs. To wipe it and re-seed, click **Reset demo data** in the dashboard header, or run `docker compose down -v` and start again.
- (If you downloaded a ZIP instead of cloning, unzip it, `cd` into the folder, and run `docker compose up --build`.)

> **Offline note:** the *first* `docker compose up --build` needs internet access once, to download the `mongo:7` and `node:22-alpine` images and the two npm packages. After that, everything runs fully offline. **Run it once before your demo** while you're online.

### Option B: MongoDB in Docker, Node.js on your laptop

If you have Node.js 18+ installed and want to run the server directly:

```bash
docker compose up -d mongo     # start only MongoDB (same as: npm run db:up)
npm install
npm start                      # http://localhost:3000
```

### Option C: no Docker (install MongoDB Community Server locally)

Use this if Docker isn't available on the laptop. MongoDB Community Server is a free download and needs no account.

1. **Install Node.js 18 or newer** from https://nodejs.org (the LTS installer).
2. **Install MongoDB Community Server** (version 7.0 or 8.0):
   - **Windows:** download the `.msi` from https://www.mongodb.com/try/download/community. In the installer choose *Complete* and keep **"Install MongoD as a Service"** ticked. MongoDB then runs automatically on `localhost:27017`. You can also tick "Install MongoDB Compass" to get a GUI.
   - **macOS (Homebrew):**
     ```bash
     brew tap mongodb/brew
     brew install mongodb-community@7.0
     brew services start mongodb-community@7.0
     ```
   - **Ubuntu/Debian:** follow https://www.mongodb.com/docs/manual/administration/install-on-linux/ (adds MongoDB's apt repo and installs `mongodb-org`), then run `sudo systemctl start mongod`.
3. **Check that it's running:** `mongosh --eval "db.adminCommand('ping')"` should print `{ ok: 1 }`. (On Windows, install *mongosh* from the same download page if it isn't there.)
4. **Run the app** from the project folder:
   ```bash
   npm install
   npm start
   ```
   Open **http://localhost:3000**.

The app connects to `mongodb://localhost:27017` by default. To use a different server, set environment variables, e.g. `MONGO_URI=mongodb://127.0.0.1:27018 DB_NAME=motorsport npm start` (on Windows PowerShell: `$env:MONGO_URI="mongodb://127.0.0.1:27018"; npm start`).

### Handy commands

| Command | What it does |
|---|---|
| `docker compose up --build` | Start MongoDB + the app (the one command) |
| `docker compose down` | Stop everything (keeps data) |
| `docker compose down -v` | Stop and **delete** the data volume (re-seeds next start) |
| `npm run shell` | Open `mongosh` inside the MongoDB container, on the `motorsport` DB |
| `npm test` | Run the automated API test suite (needs MongoDB running on localhost:27017) |

Useful commands to show live in `mongosh` during a demo:

```js
db.drivers.find()
db.laps.find().limit(2)
db.laps.getIndexes()
db.getCollectionInfos({ name: "laps" })[0].options.validator
db.laps.insertOne({ circuit: "Monza" })      // -> MongoServerError: Document failed validation
db.laps.find({ $text: { $search: "monza" } })
```

### Troubleshooting

- **"port is already allocated" for 27017**: you already have a MongoDB running locally. Stop it, or just use Option C with that one. Alternatively, change `"27017:27017"` to `"27018:27017"` in `docker-compose.yml`. The app container doesn't use that host port.
- **Port 3000 in use:** change `"3000:3000"` to e.g. `"8080:3000"` in `docker-compose.yml` and open http://localhost:8080 (or run `PORT=8080 npm start` for options B and C).
- **"Cannot connect to the Docker daemon":** start Docker Desktop and wait until it says it's running.
- **The server keeps printing "MongoDB not reachable yet":** MongoDB isn't running. Start it (see above). The server retries for about 2.5 minutes before giving up.
- Apple Silicon and Intel Macs, Windows and Linux are all supported. The images are multi-architecture.

---

## Data model

**`drivers`**: `{ _id, name, team, number }`

```js
{ _id: ObjectId("..."), name: "Max Verstappen", team: "Red Bull", number: 1 }
```

**`laps`**: validated by `$jsonSchema`. Required: `driverId`, `lapNumber`, `lapTime`, `telemetry`.

```js
{
  _id: ObjectId("..."),
  driverId: ObjectId("..."),   // reference -> drivers._id
  lapNumber: 2,                // int >= 1
  lapTime: 80.987,             // seconds (displayed as 1:20.987)
  circuit: "Monza",
  telemetry: {                 // embedded sub-document
    speed: 351.6,              // top speed, km/h
    rpm: 11950,                // peak engine RPM
    throttle: 82.1,            // average throttle application, %
    brake: 10.8                // % of the lap spent braking
  }
}
```

**Indexes on `laps`:** `{ _id: 1 }` (default), `{ driverId: 1, lapNumber: 1 }` (compound), `{ circuit: "text" }` (text).

**Seed data** (inserted only if the collections are empty): Max Verstappen / Red Bull / 1, Charles Leclerc / Ferrari / 16, Lando Norris / McLaren / 4, plus 8 laps across Monza and Silverstone with realistic telemetry. Monza is a low-downforce circuit with ~350 km/h top speeds and ~1:21 laps; Silverstone has ~320 km/h and ~1:28 laps.

---

## 2. The 10 functionalities (for the report)

### NoSQL Functionality 1: CRUD Operations
This section shows all four basic operations on the `laps` collection. **Create:** the form builds a lap document, including the nested `telemetry` object, and the server stores it with `insertOne()`. **Read:** the laps table is loaded with an aggregation that `$lookup`s each lap's driver so names can be displayed. **Update:** clicking *Edit* loads a row into the form, and saving calls `replaceOne({ _id })`. **Delete:** each row's *Delete* button calls `deleteOne({ _id })`. The app does no field validation of its own, so leaving a required field blank lets you see MongoDB's validator reject the write. MongoDB has no foreign keys, so the app checks that the chosen `driverId` exists before inserting. That is the usual application-level approach to referential integrity in a document database. After each change, the table and any other sections you have already run refresh automatically.

### NoSQL Functionality 2: Aggregation Pipeline
The button *"Show avg + fastest lap per driver"* runs a multi-stage pipeline on the server. `$group` groups laps by `driverId` and computes `$avg: "$lapTime"` (average lap), `$min: "$lapTime"` (fastest lap) and `$sum: 1` (lap count). `$lookup` joins to the `drivers` collection to get each driver's name, team and number, and `$unwind` flattens the joined array. `$project` shapes and rounds the output, and `$sort` orders drivers by average lap time. All of the work happens inside MongoDB, and only three summary documents come back. This is MongoDB's equivalent of SQL's `GROUP BY` with `AVG()`/`MIN()` and a `JOIN`. The dashboard shows each driver's gap to the best average as a bar.

### NoSQL Functionality 3: Indexing
This section displays the raw output of `db.laps.getIndexes()`, along with a card explaining each index. `_id_` is created automatically and is unique. `driverId_1_lapNumber_1` is a **compound index**: entries are sorted by driver and then by lap number, so it serves queries on `driverId` alone (its prefix) or on `driverId` + `lapNumber`. `circuit_text` is a **text index**: it tokenises and stems the `circuit` string for full-text search. The section also runs `explain()` on a `find({ driverId, lapNumber })` query. The winning plan is `FETCH ← IXSCAN (driverId_1_lapNumber_1)`, which shows MongoDB is using the index instead of a full collection scan (`COLLSCAN`).

### NoSQL Functionality 4: Schema Validation
MongoDB is schema-flexible by default, but a collection can enforce a schema. The `laps` collection is created with a `$jsonSchema` validator (`validationLevel: "strict"`, `validationAction: "error"`). The validator requires `driverId` (ObjectId), `lapNumber` (int ≥ 1), `lapTime` (number ≥ 0) and `telemetry` (an object that itself requires `speed`, `rpm`, `throttle` and `brake`, each with ranges). The button *"Try inserting an invalid lap"* attempts `insertOne({ circuit: "Monza", lapNumber: "three" })`. MongoDB rejects it with `MongoServerError: Document failed validation` (code `121`, `DocumentValidationFailure`). The dashboard shows the full `errInfo`, which explains that `driverId`, `lapTime` and `telemetry` are missing and that `lapNumber` has the wrong type, alongside a readable summary and the validator itself.

### NoSQL Functionality 5: Embedded Documents & Referencing
This section displays one random lap document as raw JSON, with two modelling techniques highlighted. The green **`telemetry`** object is an **embedded sub-document**: it belongs to exactly one lap, so it is stored inside the lap and comes back in the same read, with no join. The purple **`driverId`** is a **reference**: it holds the `_id` of a document in the `drivers` collection, and that referenced driver is shown alongside it. A driver has many laps (one-to-many), so storing the driver once and referencing it avoids duplicating driver data in every lap. The trade-off is that reading the driver needs a second query or a `$lookup`. Embedding suits data that is always read together and owned by its parent. Referencing suits shared entities.

### User Functionality 1: All laps for a driver
A dropdown lists every driver from the `drivers` collection. Selecting one runs `db.laps.find({ driverId: ObjectId(...) }).sort({ circuit: 1, lapNumber: 1 })` and shows all of that driver's laps, with lap times, top speed, RPM, and throttle/brake bars, plus their personal best. `driverId` is the leading field of the compound index, so MongoDB answers this query with an index scan. This is the typical "one-to-many via reference" lookup.

### User Functionality 2: Head-to-head average lap time
Two dropdowns pick Driver A and Driver B, and *Compare* runs an aggregation. `$match` keeps only the two drivers' laps (`$in`). A first `$group` averages lap time per driver *per circuit*. A second `$group` rolls those up into a weighted overall average per driver, with a per-circuit breakdown (`$push`). Then `$lookup` adds the driver details. The result is shown as two side-by-side cards with each driver's average and who is faster by how much, plus a like-for-like per-circuit table. The per-circuit table matters because Silverstone laps are about 7 seconds longer than Monza laps, so the overall average depends on which circuits a driver has laps at.

### User Functionality 3: Fastest lap leaderboard
The button *"Show fastest lap per driver"* sorts every lap by `lapTime` ascending, then uses `$group` with `$first: "$$ROOT"` to keep each driver's single fastest **whole lap document**. Unlike Functionality 2's `$min`, which returns only the time, this keeps the circuit, lap number and telemetry of that lap. After a `$lookup` for driver names and a final `$sort`, it shows a race-style leaderboard (P1, P2, P3) with the gap to the leader drawn as a bar. Inserting a faster lap in the CRUD section updates the leaderboard immediately.

### User Functionality 4: Laps above a speed threshold
Enter a speed (default 340 km/h) to find every lap whose top speed exceeded it: `db.laps.find({ "telemetry.speed": { $gt: N } }).sort({ "telemetry.speed": -1 })`. This shows **dot notation**, which lets a query filter directly on a field inside an embedded sub-document, together with a comparison operator (`$gt`). With the seed data, 340 returns all 4 Monza laps, 350 returns the fastest 2, and 300 returns all 8 laps.

### User Functionality 5: Search laps by circuit
The search box runs a **full-text search** using the `circuit` text index: `db.laps.find({ $text: { $search: "<query>" } })`, sorted by `{ $meta: "textScore" }` relevance. The results table shows the score. Text search is case-insensitive, matches whole words with English stemming, and treats several words as OR. For example, `monza` returns the 4 Monza laps and `monza silverstone` returns all 8. `$text` requires a text index and fails without one, so this section depends on the index created in Functionality 3.

---

## 3. What was tested and verified

Everything below was run for real in a Linux sandbox before delivery. The results were checked against a real MongoDB 7 (`mongo:7` image), not mocks.

**Startup and data**
- `docker compose up` started `motorsport-mongo`, which passed its health check, then `motorsport-app`. App logs confirmed: *Created "laps" collection with $jsonSchema validator → Ensured indexes → Inserted 3 drivers → Inserted 8 laps → running at http://localhost:3000*.
- Checked directly in `mongosh` inside the container: 3 drivers and 8 laps; indexes `_id_`, `driverId_1_lapNumber_1`, `circuit_text`; the validator's `required` list is `[driverId, lapNumber, lapTime, telemetry]`; `db.laps.insertOne({circuit:"Monza"})` was rejected with code 121; `$text` search for "monza" returned 4.
- **Persistence and idempotent startup:** after inserting a lap and running `docker compose down` then `up`, the lap was still there (9 laps), drivers were **not** re-seeded (still 3), and the validator was re-applied with `collMod`.
- **Option B path** (MongoDB in Docker, `npm start` on the host) was tested and passed the same browser test suite.
- With MongoDB unreachable, the server retries with a clear "Is MongoDB running?" hint instead of crashing.

**Automated API tests: `npm test` (12/12 passing).** The suite starts the real server against a throwaway `motorsport_test` database and checks:
seed contents · CRUD insert/update/delete, a validator rejection (121) and an unknown-driver rejection · aggregation values (e.g. Verstappen avg = 83.580, fastest = 80.987) and sort order · all three indexes plus `explain()` using `driverId_1_lapNumber_1` · the invalid insert returning code 121 with `missingProperties = [driverId, lapTime, telemetry]` and nothing stored · embedded telemetry keys and `driverId === drivers._id` · per-driver laps (Norris = 3) · head-to-head averages · leaderboard order (VER 80.987, LEC 81.203, NOR 81.588) · speed threshold (>350 → 2 laps, >0 → 8, non-numeric → 400) · text search (monza 4, Silverstone 4, "monza silverstone" 8, monaco 0) · reset re-seeding.

**Browser end-to-end test (Playwright + Chromium, 37 checks, all passing)** against the Docker stack, clicking through the real UI:
- The header shows "MongoDB connected"; all ten "NoSQL Functionality N" / "User Functionality N" labels are present.
- N1: the table shows the 8 seeded laps; inserting a lap via the form adds a 9th row; submitting with blank fields shows MongoDB's "Document failed validation" naming `lapTime`; Edit → Update changes the time; Delete removes the row, and the already-open leaderboard refreshes automatically.
- N2: all 3 drivers are shown, and the fastest-lap value reflects the lap just edited.
- N3: all 3 indexes are shown, and the explain plan shows IXSCAN.
- N4: code 121 and the list of missing fields are shown.
- N5: telemetry is highlighted as embedded, `driverId` and `drivers._id` are highlighted as the reference, and ObjectIds are rendered.
- U1: Verstappen → 3 laps. U2: verdict plus Monza/Silverstone breakdown. U3: the newly inserted 1:20.444 lap takes P1. U4: >350 km/h → 3 laps (including the inserted one). U5: "silverstone" → 4 laps.
- *Reset demo data* restores 8 laps; no JavaScript console errors; no horizontal scrolling on a 390 px-wide phone screen in dark mode.

**Two notes on how the sandbox differed from your laptop** (neither affects you):
1. Docker Hub rate-limited the sandbox (HTTP 429), so the official `mongo:7` and `node:22-alpine` images were pulled from Google's Docker Hub mirror (`mirror.gcr.io`, the same images) and tagged locally.
2. The sandbox routes HTTPS through an inspecting proxy, so the `npm ci` step inside the Docker build needed that proxy's CA certificate. The app image was built with a sandbox-only copy of this `Dockerfile` that added the certificate, then started with `docker compose up`. On a normal laptop the plain `Dockerfile` in this repo builds as-is.

---

## Project structure

```
motorsport-viz/
├── docker-compose.yml   # mongo:7 (with healthcheck + volume) and the app
├── Dockerfile           # node:22-alpine image for the Express app
├── package.json         # npm start / npm test / helper scripts
├── server.js            # Express API: one endpoint group per functionality
├── db.js                # connection + retry, $jsonSchema validator, indexes, seed data
├── public/
│   ├── index.html       # single-page dashboard (10 labelled sections)
│   ├── style.css        # styling, light + dark mode, responsive
│   └── app.js           # frontend logic (plain JS, fetch API)
└── test/
    └── api.test.js      # end-to-end API tests (node:test)
```

### API reference

| Method & path | Used by |
|---|---|
| `GET /api/health`, `GET /api/drivers`, `POST /api/reset` | header / dropdowns / reset button |
| `GET /api/laps`, `POST /api/laps`, `PUT /api/laps/:id`, `DELETE /api/laps/:id` | NoSQL 1 (CRUD) |
| `GET /api/nosql/aggregation` | NoSQL 2 |
| `GET /api/nosql/indexes` | NoSQL 3 |
| `POST /api/nosql/invalid-insert` | NoSQL 4 |
| `GET /api/nosql/embedded` | NoSQL 5 |
| `GET /api/user/driver-laps/:driverId` | User 1 |
| `GET /api/user/compare?a=&b=` | User 2 |
| `GET /api/user/leaderboard` | User 3 |
| `GET /api/user/speed?min=` | User 4 |
| `GET /api/user/search?q=` | User 5 |
