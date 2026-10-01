// Optional, explicit database setup script for LOCAL development, where a
// real terminal is available: npm run init-db
//
// This is no longer required for the server to work — db.js now creates
// the schema automatically on every start (see ensureSchema() there),
// specifically because Render's free tier has no shell access, so a
// manual one-time script could never be run there at all. This file is
// kept only as a convenient, explicit way to set up (or inspect) the
// database by hand when working locally, where that's actually possible.
//
// It intentionally just re-uses db.js's own setup — requiring db.js runs
// ensureSchema() as a side effect of opening the connection, so there's
// only ever one place the table definitions actually live.

require("./db");

console.log(`Database ready at ${process.env.DATABASE_PATH || "./data/pilot.db"}`);
console.log("Tables: clients, strava_tokens, weekly_totals");
