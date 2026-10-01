// The single place that talks directly to the database.
// Every other file goes through these functions rather than writing
// raw SQL itself — keeps the database details in one place, so if we
// ever needed to change how storage works, only this file changes.

const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

const dbPath = process.env.DATABASE_PATH || "./data/pilot.db";
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);
db.pragma("journal_mode = WAL"); // safer under concurrent access

// Creates the schema if it doesn't exist yet. Originally this lived in a
// separate init-db.js script meant to be run once by hand — but Render's
// free tier has no shell access and no way to run one-off commands, so
// that manual step is simply never possible there. Running this here
// instead, on every server start, is genuinely safe: every statement is
// "CREATE TABLE IF NOT EXISTS", so on the 2nd, 3rd, 100th start it's a
// cheap no-op against tables that already exist. init-db.js is kept for
// local development, where a real shell is available and a human may
// want to run it explicitly — but the server no longer depends on it.
//
// Three tables, deliberately minimal for a 10-client pilot:
//   clients        — one row per athlete who has connected Strava
//   strava_tokens  — their OAuth tokens, kept separate from client
//                    profile data so refresh logic can't touch it by accident
//   weekly_totals  — one row per (client, week), just the total training
//                    minutes, so the following week's digest has something
//                    real to compare against
//
// We still do NOT store raw activity history (individual runs, rides, GPS
// data) — that's pulled live from Strava each time a digest runs, never
// synced wholesale.
function ensureSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS clients (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      strava_athlete_id   TEXT UNIQUE NOT NULL,
      display_name        TEXT,
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
      week_start      TEXT NOT NULL,
      total_minutes   INTEGER NOT NULL,
      updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (client_id, week_start)
    );
  `);
}

ensureSchema();

// Find an existing client by their Strava athlete ID, or create one.
// Returns the client's internal database id.
function upsertClient(stravaAthleteId, displayName) {
  const existing = db
    .prepare("SELECT id FROM clients WHERE strava_athlete_id = ?")
    .get(String(stravaAthleteId));

  if (existing) {
    db.prepare("UPDATE clients SET display_name = ?, updated_at = datetime('now') WHERE id = ?")
      .run(displayName, existing.id);
    return existing.id;
  }

  const result = db
    .prepare("INSERT INTO clients (strava_athlete_id, display_name) VALUES (?, ?)")
    .run(String(stravaAthleteId), displayName);
  return result.lastInsertRowid;
}

// Save (or overwrite) a client's Strava tokens after login or refresh.
function saveTokens(clientId, { access_token, refresh_token, expires_at }) {
  db.prepare(`
    INSERT INTO strava_tokens (client_id, access_token, refresh_token, expires_at, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(client_id) DO UPDATE SET
      access_token = excluded.access_token,
      refresh_token = excluded.refresh_token,
      expires_at = excluded.expires_at,
      updated_at = datetime('now')
  `).run(clientId, access_token, refresh_token, expires_at);
}

function getTokens(clientId) {
  return db.prepare("SELECT * FROM strava_tokens WHERE client_id = ?").get(clientId);
}

function getClient(clientId) {
  return db.prepare("SELECT * FROM clients WHERE id = ?").get(clientId);
}

function listClients() {
  return db.prepare("SELECT * FROM clients ORDER BY created_at DESC").all();
}

// Stores one week's digest totals for a client, so the following week's
// digest has something real to compare against for the trend line. Keyed
// on (client_id, week_start) so re-running a digest for the same week
// overwrites rather than duplicates.
function saveWeeklyTotals(clientId, weekStartISO, totalMinutes) {
  db.prepare(`
    INSERT INTO weekly_totals (client_id, week_start, total_minutes, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(client_id, week_start) DO UPDATE SET
      total_minutes = excluded.total_minutes,
      updated_at = datetime('now')
  `).run(clientId, weekStartISO, totalMinutes);
}

// Returns the stored total for a client's prior week, or 0 if we have no
// record (e.g. their very first digest) — buildWeeklyDigest already handles
// a 0 prior-week value without a divide-by-zero error.
function getWeeklyTotal(clientId, weekStartISO) {
  const row = db
    .prepare("SELECT total_minutes FROM weekly_totals WHERE client_id = ? AND week_start = ?")
    .get(clientId, weekStartISO);
  return row ? row.total_minutes : 0;
}

module.exports = { upsertClient, saveTokens, getTokens, getClient, listClients, saveWeeklyTotals, getWeeklyTotal };
