import {
  $,
  api,
  can,
  esc,
  guard,
  poll,
  requireAuth,
  severityBadge,
  toast
} from "./common.js";

const user = await requireAuth("incidents.html");
const canResolve = can(user, "resolveIncident");

let incidents = [];

// ---------- Render incident register ----------
function render() {
  const filter = $("#filter").value;

  const rows = incidents.filter((i) =>
    filter === "all" || !i.resolved
  );

  $("#incidents").innerHTML = rows.length
    ? rows.map((i) => `
        <tr class="${i.resolved ? "resolved" : ""}">
          <td>
            ${severityBadge(i.severity)}
          </td>

          <td>
            <strong>${esc(i.title)}</strong>
            ${i.description
              ? `<div class="muted">${esc(i.description)}</div>`
              : ""}
          </td>

          <td>
            ${esc(i.device?.name ?? "-")}
          </td>

          <td class="small-text">
            ${new Date(i.createdAt).toLocaleString()}
            <div class="muted">
              ${esc(i.reportedBy?.name ?? "")}
            </div>
          </td>

          <td>
            ${i.resolved
              ? `<span class="badge pass">Resolved</span>`
              : `<span class="badge warning">Open</span>`}
          </td>

          <td class="actions">
            ${canResolve
              ? `<button
                   class="btn small ${i.resolved ? "" : "primary"}"
                   data-id="${i.id}"
                   data-resolved="${!i.resolved}"
                 >
                   ${i.resolved ? "Reopen" : "Resolve"}
                 </button>`
              : ""}
          </td>
        </tr>
      `).join("")
    : `
        <tr>
          <td colspan="6" class="muted" style="text-align:center;padding:30px">
            ${filter === "open"
              ? "No open incidents. Your production system has no unresolved reports."
              : "No incidents have been recorded yet."}
          </td>
        </tr>
      `;
}

// ---------- Load incidents ----------
const load = poll(async () => {
  incidents = await api("/incidents");
  render();
});

// ---------- Filter incidents ----------
$("#filter").onchange = render;

// ---------- Resolve or reopen incident ----------
$("#incidents").addEventListener(
  "click",
  guard(async (e) => {
    const btn = e.target.closest("button[data-id]");

    if (!btn) return;

    const resolved = btn.dataset.resolved === "true";

    await api(`/incidents/${btn.dataset.id}`, {
      method: "PATCH",
      body: { resolved }
    });

    toast(
      resolved ? "Incident resolved" : "Incident reopened",
      "success"
    );

    await load();
  })
);

// ---------- Show incident logging button ----------
if (can(user, "logIncident")) {
  $("#log").classList.remove("hidden");
}

// ---------- Open incident dialog ----------
$("#log").onclick = guard(async () => {
  const devices = await api("/devices");

  $("#i-device").innerHTML = `
    <option value="">None</option>
    ${devices.map((d) =>
      `<option value="${d.id}">${esc(d.name)}</option>`
    ).join("")}
  `;

  $("#incident-dialog").showModal();
});

// ---------- Submit incident ----------
$("#incident-form").onsubmit = guard(async (e) => {
  e.preventDefault();

  await api("/incidents", {
    method: "POST",
    body: {
      title: $("#i-title").value,
      description: $("#i-notes").value || undefined,
      severity: $("#i-severity").value,
      deviceId: $("#i-device").value
        ? Number($("#i-device").value)
        : null
    }
  });

  e.target.reset();
  $("#incident-dialog").close();

  toast("Incident logged", "success");

  await load();
});

// ---------- Close dialog ----------
document.querySelectorAll("#incident-dialog [data-close]")
  .forEach((button) => {
    button.addEventListener("click", () => {
      $("#incident-dialog").close();
    });
  });