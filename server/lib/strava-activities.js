// Fetches a client's training activities from Strava.
//
// Access tokens expire after 6 hours, so every call here first checks the
// stored expiry and refreshes if needed — the caller never has to think
// about token freshness, just asks for a client's activities.

const fetch = require("node-fetch");
const { refreshAccessToken } = require("./strava-auth");
const { getTokens, saveTokens } = require("./db");

const STRAVA_API_BASE = "https://www.strava.com/api/v3";

// Returns a valid access token for this client, refreshing it first if the
// stored one has expired. Throws if the client has never connected Strava.
async function getValidAccessToken(clientId) {
  const tokens = getTokens(clientId);
  if (!tokens) {
    throw new Error(`No Strava tokens stored for client ${clientId} — they need to connect first.`);
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  // Strava's expires_at is a Unix timestamp. Refresh a little early (5 min
  // buffer) rather than right at the edge, to avoid a request failing mid-flight.
  if (tokens.expires_at > nowSeconds + 300) {
    return tokens.access_token;
  }

  const refreshed = await refreshAccessToken(tokens.refresh_token);
  saveTokens(clientId, {
    access_token: refreshed.access_token,
    refresh_token: refreshed.refresh_token,
    expires_at: refreshed.expires_at,
  });
  return refreshed.access_token;
}

// Fetches a client's activities between two dates (JS Date objects).
// Strava's API takes Unix timestamps and paginates at up to 200 per page —
// for a weekly digest on a 10-client pilot this will always be a single
// page, but we loop just in case someone has an unusually busy week.
async function getActivities(clientId, afterDate, beforeDate) {
  const accessToken = await getValidAccessToken(clientId);
  const after = Math.floor(afterDate.getTime() / 1000);
  const before = Math.floor(beforeDate.getTime() / 1000);

  let page = 1;
  const perPage = 100;
  const all = [];

  while (true) {
    const params = new URLSearchParams({
      after: String(after),
      before: String(before),
      page: String(page),
      per_page: String(perPage),
    });
    const res = await fetch(`${STRAVA_API_BASE}/athlete/activities?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Strava activities fetch failed (${res.status}): ${errText}`);
    }

    const batch = await res.json();
    all.push(...batch);

    if (batch.length < perPage) break; // last page
    page++;
  }

  // Keep only the fields the digest actually needs. Strava returns a lot
  // more (GPS streams, kudos counts, etc.) that we deliberately don't store
  // or pass around — this pilot only ever needs a same-request summary.
  return all.map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type, // "Run", "Ride", "Swim", etc.
    startDate: a.start_date_local,
    durationMin: Math.round(a.moving_time / 60),
    distanceKm: Math.round((a.distance / 1000) * 10) / 10,
    avgHeartRate: a.average_heartrate || null,
    maxHeartRate: a.max_heartrate || null,
    calories: a.calories || null, // only present if the activity device reports it
  }));
}

module.exports = { getValidAccessToken, getActivities };
