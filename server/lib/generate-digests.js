// Generates a weekly digest for every connected client. This is the one
// function the scheduled job (or a manual "run now" button) calls — it
// ties together Strava activity fetching, the digest logic, and storing
// this week's total for next week's trend comparison.

const { listClients, getWeeklyTotal, saveWeeklyTotals } = require("./db");
const { getActivities } = require("./strava-activities");
const { buildWeeklyDigest } = require("./digest");
const { startOfWeek, endOfWeek, toISODate } = require("./week");

// Generates one client's digest for the week containing `referenceDate`
// (defaults to now — pass a specific date only when testing or backfilling).
async function generateDigestForClient(client, referenceDate = new Date()) {
  const weekStart = startOfWeek(referenceDate);
  const weekEnd = endOfWeek(referenceDate);
  const priorWeekStart = startOfWeek(new Date(weekStart.getTime() - 1)); // one ms before weekStart = previous Sunday

  const activities = await getActivities(client.id, weekStart, weekEnd);
  const lastWeekMinutes = getWeeklyTotal(client.id, toISODate(priorWeekStart));

  const digest = buildWeeklyDigest(activities, lastWeekMinutes);

  // Persist this week's total now, so it's available as "last week" the
  // next time this runs — written after a successful fetch, not before,
  // so a failed Strava request never overwrites good data with a zero.
  saveWeeklyTotals(client.id, toISODate(weekStart), digest.totalMinutes);

  return {
    clientId: client.id,
    clientName: client.display_name,
    weekStart: toISODate(weekStart),
    weekEnd: toISODate(weekEnd),
    ...digest,
  };
}

// Generates digests for every connected client. Runs clients one at a time
// rather than in parallel — simpler to reason about for a 10-client pilot,
// and avoids bursting Strava's rate limit if it were ever a larger list.
// A failure for one client is recorded and skipped rather than aborting the
// whole run, so one broken connection doesn't block everyone else's digest.
async function generateAllDigests(referenceDate = new Date()) {
  const clients = listClients();
  const results = [];

  for (const client of clients) {
    try {
      const digest = await generateDigestForClient(client, referenceDate);
      results.push({ ok: true, ...digest });
    } catch (err) {
      results.push({
        ok: false,
        clientId: client.id,
        clientName: client.display_name,
        error: err.message,
      });
    }
  }

  return results;
}

module.exports = { generateDigestForClient, generateAllDigests };
