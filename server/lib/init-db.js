// Sets up the database schema. Run once with: npm run init-db
//
// Three tables, deliberately minimal for a 10-client pilot:
//
//   clients          — one row per athlete who has connected Strava
//   strava_tokens    — their OAuth tokens, kept in a separate table
//                      so token refresh logic never touches client
//                      profile data by accident
//   weekly_totals    — one row per (client, week) storing just the total
//                      training minutes for that week, so the following
//                      week's digest has something to compare against
//
// We still do NOT store raw activity history (individual runs, rides,
// GPS data etc.) — those are pulled live from Strava each time a digest
// runs, never synced wholesale. weekly_totals is the one deliberate
// exception: a single number per week, kept only because a trend
// comparison is meaningless without it. If a real training-history
// feature is wanted later, that's a separate, deliberate next step.

const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

require("dotenv").config();

const dbPath = process.env.DATABASE_PATH || "./data/pilot.db";
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
  console.log(`Created directory: ${dbDir}`);
}

const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS clients (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    strava_athlete_id  TEXT UNIQUE NOT NULL,
    display_name       TEXT,
    weight_kg           REAL,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS strava_tokens (
    client_id       INTEGER PRIMARY KEY REFERENCES clients(id),
    access_token    TEXT NOT NULL,
    refresh_token   TEXT NOT NULL,
    expires_at      INTEGER NOT NULL,
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS weekly_totals (
    client_id       INTEGER NOT NULL REFERENCES clients(id),
    week_start      TEXT NOT NULL,  -- ISO date (YYYY-MM-DD) of the Monday that week starts
    total_minutes   INTEGER NOT NULL,
    updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (client_id, week_start)
  );
`);

console.log(`Database ready at ${dbPath}`);
console.log("Tables: clients, strava_tokens, weekly_totals");

db.close();
