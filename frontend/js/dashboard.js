import {
  $,
  api,
  can,
  esc,
  guard,
  poll,
  requireAuth,
  severityBadge,
  statusBadge,
  toast,
  setLiveIndicator
} from "./common.js";

const user = await requireAuth("index.html");

const STATS = [
  ["PASS", "Pass"],
  ["WARNING", "Warning"],
  ["FAIL", "Fail"],
  ["UNKNOWN", "Unknown"]
];

// Dashboard monitoring state
let previousDeviceStatuses = new Map();
let firstDashboardLoad = true;

// Update the last successful refresh time
function updateLastUpdated() {
  const element = $("#last-updated");

  if (element) {
    element.textContent =
      `Last updated: ${new Date().toLocaleTimeString()}`;
  }
}

// Detect changes in monitored device statuses
function detectDeviceStatusChanges(slots) {
  const currentStatuses = new Map(
    slots
      .filter((s) => s.deviceId)
      .map((s) => [
        s.deviceId,
        {
          name: s.deviceName || s.label,
          status: s.status
        }
      ])
  );

  if (!firstDashboardLoad) {
    for (const [id, current] of currentStatuses) {
      const previous = previousDeviceStatuses.get(id);

      if (previous && previous.status !== current.status) {
        toast(
          `${current.name}: ${previous.status} → ${current.status}`,
          current.status === "FAIL" ? "error" : "info"
        );
      }
    }
  }

  previousDeviceStatuses = currentStatuses;
  firstDashboardLoad = false;
}

function render(d) {
  const b = d.baseline;

  updateLastUpdated();
  detectDeviceStatusChanges(d.slots);

  $("#subtitle").textContent = b
    ? `${b.name}${b.venue ? " - " + b.venue : ""} · live, refreshes every 5s`
    : "No active baseline";

  // Overall system health
  const alerts = d.slots.filter((s) => s.status !== "PASS");

  if (!b) {
    $("#banner").innerHTML =
      `<div class="card">No baseline is active yet. <a href="baseline.html">Set one up</a>.</div>`;
  } else if (alerts.length === 0) {
    $("#banner").innerHTML =
      `<div class="banner pass">All checked properties match the baseline.</div>`;
  } else {
    const cls = d.counts.FAIL ? "fail" : "warning";

    $("#banner").innerHTML =
      `<div class="banner ${cls}">${alerts.length} item(s) need attention before showtime.</div>`;
  }

  // Status statistics
  $("#stats").innerHTML = STATS.map(
    ([key, label]) =>
      `<div class="stat ${key.toLowerCase()}">
        <div class="n">${d.counts[key]}</div>
        ${label}
      </div>`
  ).join("");

  // Health alerts
  $("#alerts").innerHTML = alerts.length
    ? alerts.map((s) =>
        `<div class="card" style="margin-bottom:8px;display:flex;gap:12px;align-items:flex-start">
          ${statusBadge(s.status)}
          <div>
            <strong>${esc(s.label)}</strong>
            <div class="muted">${esc(s.details)}</div>
          </div>
        </div>`
      ).join("")
    : `<p class="muted">No alerts.</p>`;

  // Open incidents
  $("#incidents").innerHTML = d.openIncidents.length
    ? d.openIncidents.map((i) =>
        `<div class="row" style="justify-content:space-between;margin-bottom:8px">
          <span>${esc(i.title)}</span>
          ${severityBadge(i.severity)}
        </div>`
      ).join("")
    : `<p class="muted">None open.</p>`;

  // Last completed pre-show check
  $("#last-check").textContent = d.lastCheck
    ? `Last check by ${d.lastCheck.runBy.name} at ${new Date(d.lastCheck.createdAt).toLocaleTimeString()}`
    : "";

  // Device monitoring table
  $("#devices").innerHTML = d.slots.map((s) =>
    `<tr>
      <td><strong>${esc(s.label)}</strong></td>
      <td>${esc(s.deviceName ?? "-")}</td>
      <td>${esc(s.type)}</td>
      <td>${statusBadge(s.status)}</td>
      <td class="muted">${esc(s.details)}</td>
    </tr>`
  ).join("");
}

// Refresh dashboard using the existing backend endpoint
const reload = poll(async () => {
  setLiveIndicator("connecting", "Updating...");

  try {
    const data = await api("/dashboard");

    render(data);

    setLiveIndicator("live", "Live monitoring");
  } catch (error) {
    setLiveIndicator("offline", "Connection issue");
    throw error;
  }
});

// Run pre-show check button
if (can(user, "runCheck")) {
  const button = $("#run-check");

  button.classList.remove("hidden");

  const originalLabel = button.textContent.trim();

  button.onclick = guard(async () => {
    // Prevent duplicate checks
    if (button.disabled) return;

    // Immediate visual feedback
    button.disabled = true;
    button.classList.add("checking");

    button.innerHTML = `
      <span class="check-spinner" aria-hidden="true">⟳</span>
      Running check...
    `;

    button.setAttribute("aria-busy", "true");

    try {
      // Existing backend request remains unchanged
      await api("/checks", {
        method: "POST"
      });

      toast("Pre-show check complete", "success");

      await reload();

    } finally {
      // Restore button whether the request succeeds or fails
      button.disabled = false;
      button.classList.remove("checking");
      button.removeAttribute("aria-busy");
      button.textContent = originalLabel;
    }
  });
}