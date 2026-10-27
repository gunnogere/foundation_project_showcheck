import { $, api, can, esc, guard, poll, requireAuth, severityBadge, statusBadge, toast } from "./common.js";

const user = await requireAuth("index.html");

const STATS = [["PASS", "Pass"], ["WARNING", "Warning"], ["FAIL", "Fail"], ["UNKNOWN", "Unknown"]];

function render(d) {
  const b = d.baseline;
  $("#subtitle").textContent = b
    ? `${b.name}${b.venue ? " - " + b.venue : ""} · live, refreshes every 5s`
    : "No active baseline";

  const alerts = d.slots.filter((s) => s.status !== "PASS");
  if (!b) {
    $("#banner").innerHTML = `<div class="card">No baseline is active yet. <a href="baseline.html">Set one up</a>.</div>`;
  } else if (alerts.length === 0) {
    $("#banner").innerHTML = `<div class="banner pass">All checked properties match the baseline.</div>`;
  } else {
    const cls = d.counts.FAIL ? "fail" : "warning";
    $("#banner").innerHTML = `<div class="banner ${cls}">${alerts.length} item(s) need attention before showtime.</div>`;
  }

  $("#stats").innerHTML = STATS.map(
    ([key, label]) => `<div class="stat ${key.toLowerCase()}"><div class="n">${d.counts[key]}</div>${label}</div>`
  ).join("");

  $("#alerts").innerHTML = alerts.length
    ? alerts.map((s) => `<div class="card" style="margin-bottom:8px;display:flex;gap:12px;align-items:flex-start">
        ${statusBadge(s.status)}<div><strong>${esc(s.label)}</strong><div class="muted">${esc(s.details)}</div></div></div>`).join("")
    : `<p class="muted">No alerts.</p>`;

  $("#incidents").innerHTML = d.openIncidents.length
    ? d.openIncidents.map((i) => `<div class="row" style="justify-content:space-between;margin-bottom:8px"><span>${esc(i.title)}</span>${severityBadge(i.severity)}</div>`).join("")
    : `<p class="muted">None open.</p>`;

  $("#last-check").textContent = d.lastCheck
    ? `· last check by ${d.lastCheck.runBy.name} at ${new Date(d.lastCheck.createdAt).toLocaleTimeString()}`
    : "";

  $("#devices").innerHTML = d.slots.map((s) => `<tr>
      <td><strong>${esc(s.label)}</strong></td><td>${esc(s.deviceName ?? "-")}</td><td>${esc(s.type)}</td>
      <td>${statusBadge(s.status)}</td><td class="muted">${esc(s.details)}</td></tr>`).join("");
}

const reload = poll(async () => render(await api("/dashboard")));

if (can(user, "runCheck")) {
  $("#run-check").classList.remove("hidden");
  $("#run-check").onclick = guard(async () => {
    await api("/checks", { method: "POST" });
    toast("Pre-show check complete", "success");
    reload();
  });
}
