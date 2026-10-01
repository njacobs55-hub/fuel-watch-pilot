// The single place that talks directly to the database.
// Every other file goes through these functions rather than writing
// raw SQL itself — keeps the database details in one place, so if we
// ever needed to change how storage works, only this file changes.

const Database = require("better-sqlite3");
require("dotenv").config();

const db = new Database(process.env.DATABASE_PATH || "./data/pilot.db");
db.pragma("journal_mode = WAL"); // safer under concurrent access

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
