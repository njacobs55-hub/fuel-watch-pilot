// Small date helpers for computing week boundaries. Kept as pure functions
// (no "new Date()" defaults baked in) so they're easy to test with a fixed
// date rather than whatever day it happens to be when the test runs.
//
// Weeks run Monday to Sunday — matches how Strava's own weekly stats are
// grouped, so a coach cross-checking against the Strava app sees the same
// week boundaries.

// Returns the Monday (00:00:00 local time) of the week containing `date`.
function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday, 1 = Monday, ... 6 = Saturday
  const diff = day === 0 ? -6 : 1 - day; // if Sunday, go back 6 days to Monday
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Returns the Sunday (23:59:59 local time) of the week containing `date`.
function endOfWeek(date) {
  const start = startOfWeek(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

// Formats a Date as YYYY-MM-DD for use as a stable database key — using
// toISOString() directly would shift the date near midnight depending on
// timezone, so this builds the string from local date parts instead.
function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

module.exports = { startOfWeek, endOfWeek, toISODate };
