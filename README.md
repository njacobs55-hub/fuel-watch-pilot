# FUEL Watch Pilot

A small server for the watch-connected fueling pilot. Right now it does two things:

1. **Lets a client connect their Strava account** (OAuth) — this part has
   been used and confirmed working against real Strava accounts.
2. **Generates a weekly training digest** for each connected client —
   session count, total time, distance by activity type, and a trend
   against the prior week. This is a coach-facing numbers summary, not
   client-facing, and it never changes anyone's meal plan automatically.

## What's here

```
server/
  index.js                  — the server itself, wires everything together
  routes/auth.js             — the two URLs a client's browser hits during login
  routes/digests.js          — manually trigger and view this week's digests
  lib/strava-auth.js         — talks to Strava (build login URL, exchange/refresh tokens)
  lib/strava-activities.js   — fetches a client's activities, refreshing the token first if needed
  lib/digest.js              — pure digest-generation logic (no network/database calls)
  lib/generate-digests.js    — ties Strava + digest + database together for all clients
  lib/week.js                — Monday–Sunday week boundary math
  lib/db.js                  — talks to the database
  lib/init-db.js             — one-time script that creates the database tables
.env.example                 — every secret you need, documented
```

## What's been verified vs. what hasn't

- ✅ **OAuth connect flow** — used and confirmed working against real Strava accounts.
- ✅ **Digest logic** (`digest.js`) — tested directly with 17 cases covering normal weeks, empty weeks, large swings, missing heart-rate data, and the zero-prior-week edge case. This is pure logic with no network or database involved, so it's genuinely verified, not just syntax-checked.
- ✅ **Week boundary math** (`week.js`) — tested directly, including the Sunday edge case and a year-boundary crossing. 7/7 passing.
- ✅ **Digest orchestration** (`generate-digests.js`) — tested against fake stand-ins for the database and Strava API, confirming: the correct date range is requested, this week's total is only saved *after* a successful Strava fetch (so a failed request never corrupts stored history), and one client's failure doesn't block the rest of the batch. 14/14 passing.
- ❌ **Not yet run against live Strava activity data** — `strava-activities.js`'s actual HTTP calls to Strava's `/activities` endpoint haven't been exercised with a real connected account yet. The OAuth connection itself works; fetching activities through it is the next thing to try live.

One real bug was caught and fixed during this process: an early version of
the digest tried to flag "elevated heart rate" by comparing a week's
sessions against each other, but that's statistically circular — a couple
of genuinely high sessions pull the week's own average up with them, so
they end up judged against a threshold they just inflated, and the flag
silently never fires. It's been removed rather than shipped in a form that
looks like it works but isn't sound. A real version of that flag needs a
baseline from outside the week being checked (e.g. the client's trailing
few weeks), which isn't built yet.

## To actually run this (next session)

1. `npm install` — pull in the dependencies
2. Copy `.env.example` to `.env` and fill in your real Strava Client ID and Secret
3. `npm run init-db` — creates the database file and tables (now three: `clients`, `strava_tokens`, `weekly_totals`)
4. `npm run dev` — starts the server
5. Visit `http://localhost:3000/auth/strava` and connect a real Strava account (confirmed working)
6. Visit `http://localhost:3000/digests/run` to generate and view this week's digest for every connected client — **this is the step that hasn't been tried live yet**

If step 6 works and shows real session data, the digest pipeline is solid
end to end, and the next deliberate step is wiring `/digests/run` up to an
actual schedule (a weekly cron job) instead of a manual visit.

## What this deliberately does NOT do yet

- **No scheduler** — `/digests/run` is a manual trigger. Running it automatically every Sunday night needs a cron job set up wherever this is deployed, which is a small, well-understood addition once hosting is sorted.
- **No calorie/TDEE adjustment** — the digest reports training data, it doesn't feed into the meal planner's calorie targets. That's a separate, deliberate future step.
- **No client-facing output** — digests are for the coach to review, not sent to clients. Nothing here messages a client automatically.
- **No connection to the existing meal planner tools** — kept completely separate, nothing here touches `fuel-complete-planner.jsx` or `race-fueling-protocol.jsx`.
- **No real UI** — plain HTML, enough to confirm things work, not a finished interface.
