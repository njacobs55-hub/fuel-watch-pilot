require("dotenv").config();

const express = require("express");
const session = require("express-session");

const authRoutes = require("./routes/auth");
const digestRoutes = require("./routes/digests");
const { listClients } = require("./lib/db");

const app = express();
const PORT = process.env.PORT || 3000;

// Basic sanity check — fail loudly and early if secrets are missing,
// rather than mysteriously breaking the first time someone logs in.
const required = ["STRAVA_CLIENT_ID", "STRAVA_CLIENT_SECRET", "STRAVA_REDIRECT_URI", "SESSION_SECRET"];
const missing = required.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error("Missing required environment variables:", missing.join(", "));
  console.error("Copy .env.example to .env and fill in real values before starting.");
  process.exit(1);
}

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 }, // 7 days
  })
);

app.use("/auth", authRoutes);
app.use("/digests", digestRoutes);

// Minimal dashboard — just enough to see the pilot working.
// This is intentionally plain; the point right now is proving the
// OAuth connection works, not building a polished interface.
app.get("/", (req, res) => {
  const clients = listClients();
  const rows = clients
    .map((c) => `<li>${c.display_name} — connected ${c.created_at}</li>`)
    .join("");

  res.send(`
    <h1>FUEL Watch Pilot</h1>
    <p><a href="/auth/strava">Connect a new athlete's Strava account</a></p>
    <p><a href="/digests/run">View this week's digests</a> (generates on demand — no schedule wired up yet)</p>
    <h3>Connected athletes (${clients.length}/10)</h3>
    <ul>${rows || "<li>None yet</li>"}</ul>
  `);
});

app.listen(PORT, () => {
  console.log(`FUEL Watch Pilot server running at http://localhost:${PORT}`);
  console.log(`Connect flow: http://localhost:${PORT}/auth/strava`);
});
