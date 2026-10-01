// Handles the Strava OAuth 2.0 exchange.
//
// The flow, in plain terms:
//   1. We send the client to a Strava login page (buildAuthorizeUrl)
//   2. They log in and approve access on Strava's own site — we never
//      see their Strava password, only Strava does
//   3. Strava redirects them back to our server with a short-lived
//      "authorization code" in the URL
//   4. We exchange that code for a real access token (exchangeCodeForToken)
//      — this exchange requires our Client Secret, which is why it MUST
//      happen on the server and never in browser JavaScript
//   5. Strava also gives us a refresh token, which lets us get new
//      access tokens later without asking the client to log in again
//      (refreshAccessToken)

const fetch = require("node-fetch");

const STRAVA_AUTH_URL = "https://www.strava.com/oauth/authorize";
const STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token";

// Step 1 — build the URL we send the client to.
// "scope=activity:read_all" asks for permission to read their activities
// (including private ones) — the minimum needed for this pilot.
function buildAuthorizeUrl() {
  const params = new URLSearchParams({
    client_id: process.env.STRAVA_CLIENT_ID,
    redirect_uri: process.env.STRAVA_REDIRECT_URI,
    response_type: "code",
    approval_prompt: "auto",
    scope: "activity:read_all",
  });
  return `${STRAVA_AUTH_URL}?${params.toString()}`;
}

// Step 4 — exchange the one-time code Strava sent us for real tokens.
async function exchangeCodeForToken(code) {
  const res = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Strava token exchange failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  // data contains: access_token, refresh_token, expires_at, athlete {...}
  return data;
}

// Step 5 — get a fresh access token using the refresh token.
// Access tokens expire after 6 hours, so this gets called whenever
// we're about to make a request and the stored token has expired.
async function refreshAccessToken(refreshToken) {
  const res = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Strava token refresh failed (${res.status}): ${errText}`);
  }

  return res.json();
}

module.exports = { buildAuthorizeUrl, exchangeCodeForToken, refreshAccessToken };
