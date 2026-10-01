// Routes for connecting a client's Strava account.
//
//   GET /auth/strava            — client clicks "Connect Strava", lands here,
//                                  gets sent to Strava's login page
//   GET /auth/strava/callback   — Strava sends the client back here after
//                                  they approve access, with a code we
//                                  exchange for real tokens

const express = require("express");
const router = express.Router();

const { buildAuthorizeUrl, exchangeCodeForToken } = require("../lib/strava-auth");
const { upsertClient, saveTokens } = require("../lib/db");

router.get("/strava", (req, res) => {
  const authorizeUrl = buildAuthorizeUrl();
  res.redirect(authorizeUrl);
});

router.get("/strava/callback", async (req, res) => {
  const { code, error } = req.query;

  // The client can decline permission on Strava's screen — handle that
  // honestly rather than showing a confusing crash.
  if (error) {
    return res.status(400).send(
      `Strava login was not completed (${error}). You can try connecting again.`
    );
  }

  if (!code) {
    return res.status(400).send("Missing authorization code from Strava.");
  }

  try {
    const tokenData = await exchangeCodeForToken(code);

    // tokenData.athlete contains basic profile info Strava includes
    // automatically with the first token exchange.
    const displayName =
      [tokenData.athlete?.firstname, tokenData.athlete?.lastname]
        .filter(Boolean)
        .join(" ") || `Athlete ${tokenData.athlete?.id}`;

    const clientId = upsertClient(tokenData.athlete.id, displayName);

    saveTokens(clientId, {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: tokenData.expires_at,
    });

    // Remember who's logged in for this browser session.
    req.session.clientId = clientId;

    res.send(`
      <h2>Connected!</h2>
      <p>${displayName}'s Strava account is now linked.</p>
      <p><a href="/">Return to dashboard</a></p>
    `);
  } catch (err) {
    console.error("Strava OAuth callback failed:", err.message);
    res.status(500).send(
      "Something went wrong connecting your Strava account. Please try again, or contact your coach if this keeps happening."
    );
  }
});

module.exports = router;
