// Routes for generating and viewing weekly digests.
//
//   GET /digests/run    — generates this week's digest for every connected
//                         client right now, and shows the result. This is
//                         the manual trigger for testing before a real
//                         schedule (cron job) is wired up on deployment.

const express = require("express");
const router = express.Router();

const { generateAllDigests } = require("../lib/generate-digests");

function renderDigest(d) {
  if (!d.ok) {
    return `
      <div style="border-left:3px solid #c0392b;padding:8px 14px;margin-bottom:12px;">
        <strong>${d.clientName}</strong> — couldn't generate a digest.
        <div style="color:#888;font-size:0.9em;">${d.error}</div>
      </div>`;
  }

  const trend = d.weekOverWeek
    ? d.weekOverWeek.percent === null
      ? " (no prior week to compare)"
      : ` (${d.weekOverWeek.direction === "up" ? "▲" : "▼"} ${d.weekOverWeek.percent}% vs last week)`
    : "";

  const byTypeRows = Object.entries(d.byType)
    .map(([type, t]) => `<li>${type}: ${t.count} session${t.count === 1 ? "" : "s"}, ${Math.round(t.durationMin)} min, ${t.distanceKm}km</li>`)
    .join("");

  const flagRows = d.flags.length
    ? `<ul style="color:#b8860b;">${d.flags.map((f) => `<li>${f}</li>`).join("")}</ul>`
    : "";

  return `
    <div style="border-left:3px solid #2c7a4b;padding:8px 14px;margin-bottom:12px;">
      <strong>${d.clientName}</strong> — ${d.weekStart} to ${d.weekEnd}
      <div>${d.sessionCount} session${d.sessionCount === 1 ? "" : "s"}, ${d.totalHours}h total${trend}</div>
      <ul>${byTypeRows}</ul>
      ${flagRows}
    </div>`;
}

router.get("/run", async (req, res) => {
  try {
    const results = await generateAllDigests();
    const rendered = results.map(renderDigest).join("");
    res.send(`
      <h1>Weekly Digests</h1>
      <p><a href="/">Back to dashboard</a></p>
      ${rendered || "<p>No connected clients yet.</p>"}
    `);
  } catch (err) {
    console.error("Digest generation failed:", err.message);
    res.status(500).send("Something went wrong generating digests. Check the server logs.");
  }
});

module.exports = router;
