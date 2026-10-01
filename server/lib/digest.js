// Turns a client's activities for a week into a plain-numbers summary.
//
// Deliberately NOT prose/AI-generated — a coach can scan numbers faster
// than paragraphs, and there's nothing here that needs fact-checking.
// This module has no database or network calls, so it can be tested with
// plain arrays of activities, independent of Strava or the database.

// Groups activities by Strava's "type" field (Run, Ride, Swim, etc.) and
// sums duration/distance/calories, and averages heart rate, per type —
// useful when a client cross-trains.
function summariseByType(activities) {
  const byType = {};
  for (const a of activities) {
    if (!byType[a.type]) {
      byType[a.type] = {
        count: 0, durationMin: 0, distanceKm: 0, caloriesTotal: 0,
        // Heart rate and calories aren't on every activity — not every
        // device reports them, and some activity types never have a
        // meaningful value. Tracked as a running sum + a count of how
        // many activities actually had the field, so the average is
        // only taken across activities that genuinely reported it,
        // rather than letting missing values silently drag it down.
        hrSum: 0, hrCount: 0, caloriesCount: 0,
      };
    }
    const t = byType[a.type];
    t.count += 1;
    t.durationMin += a.durationMin;
    t.distanceKm += a.distanceKm;
    if (a.avgHeartRate != null) { t.hrSum += a.avgHeartRate; t.hrCount += 1; }
    if (a.calories != null) { t.caloriesTotal += a.calories; t.caloriesCount += 1; }
  }
  // Round distance after summing, not per-activity, to avoid compounding
  // rounding error across a week of sessions. Compute the final avg HR
  // here too, then drop the running-sum fields — callers only need the
  // final numbers, not the bookkeeping used to get there.
  for (const type in byType) {
    const t = byType[type];
    t.distanceKm = Math.round(t.distanceKm * 10) / 10;
    t.avgHeartRate = t.hrCount > 0 ? Math.round(t.hrSum / t.hrCount) : null;
    t.caloriesTotal = t.caloriesCount > 0 ? Math.round(t.caloriesTotal) : null;
    delete t.hrSum;
    delete t.hrCount;
    delete t.caloriesCount;
  }
  return byType;
}

// Compares this week's total training minutes against last week's, so the
// digest can flag a meaningful change rather than just listing raw totals.
function weekOverWeekChange(thisWeekMin, lastWeekMin) {
  if (lastWeekMin === 0) {
    return thisWeekMin === 0 ? null : { direction: "up", percent: null }; // can't compute % from zero
  }
  const percent = Math.round(((thisWeekMin - lastWeekMin) / lastWeekMin) * 100);
  return { direction: percent >= 0 ? "up" : "down", percent: Math.abs(percent) };
}

// Flags worth a coach's attention — kept short and specific rather than a
// generic "good job" message, since the point is surfacing what to look at,
// not writing the client-facing note (that's still the coach's job).
//
// Deliberately NOT flagging "elevated heart rate" by comparing a week's
// sessions against each other — an early version of this tried that and it
// doesn't work: a couple of genuinely high sessions pull the week's own
// average or median up with them, so they end up judged against a threshold
// they just inflated, and the flag silently never fires. Detecting a real
// elevation needs a baseline from outside the week being checked (the
// client's trailing few weeks, or a known resting/typical HR) — this pilot
// doesn't store that history yet, so this flag is left out rather than
// shipped in a form that looks like it works but isn't statistically sound.
function buildFlags(activities, change) {
  const flags = [];

  if (activities.length === 0) {
    flags.push("No activity logged this week — worth a check-in.");
    return flags; // other flags don't apply to an empty week
  }

  if (change && change.direction === "down" && change.percent >= 40) {
    flags.push(`Training volume dropped ${change.percent}% vs last week.`);
  }
  if (change && change.direction === "up" && change.percent >= 50) {
    flags.push(`Training volume jumped ${change.percent}% vs last week — check this was planned.`);
  }

  return flags;
}

// Builds the full digest for one client's week. `activities` is the list
// already fetched from Strava (see strava-activities.js); `lastWeekMinutes`
// is a single number from the prior week, used only for the trend comparison.
function buildWeeklyDigest(activities, lastWeekMinutes) {
  const totalMin = activities.reduce((s, a) => s + a.durationMin, 0);
  const totalDistanceKm = Math.round(activities.reduce((s, a) => s + a.distanceKm, 0) * 10) / 10;
  const change = weekOverWeekChange(totalMin, lastWeekMinutes);

  return {
    sessionCount: activities.length,
    totalMinutes: totalMin,
    totalHours: Math.round((totalMin / 60) * 10) / 10,
    totalDistanceKm,
    byType: summariseByType(activities),
    weekOverWeek: change,
    flags: buildFlags(activities, change),
  };
}

module.exports = { summariseByType, weekOverWeekChange, buildFlags, buildWeeklyDigest };
