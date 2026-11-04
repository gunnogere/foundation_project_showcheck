import {
  $,
  DEVICE_TYPES,
  api,
  can,
  esc,
  formatParams,
  guard,
  parseParams,
  poll,
  requireAuth,
  statusBadge,
  toast
} from "./common.js";

const user = await requireAuth("baseline.html");
const canEdit = can(user, "editBaseline");

let baselines = [], devices = [], slots = [];
let selectedId = null, editingItem = null;

const current = () =>
  baselines.find((b) => b.id === selectedId) ??
  baselines.find((b) => b.active) ??
  baselines[0];

const deviceOptions = (type, item) =>
  devices.filter(
    (d) => d.type === type &&
    (!d.baselineItem || d.baselineItem.id === item?.id)
  );

// ---------- Compare expected and live settings ----------
function comparison(item) {
  const live = item.device?.params ?? {};

  const rows = Object.entries(item.expectedParams).map(([k, v]) => {
    const same = item.device && String(live[k]) === String(v);

    const arrow = item.device && !same
      ? ` → ${esc(live[k] ?? "missing")}`
      : "";

    return `
      <div class="${same ? "" : "diff"} small-text">
        ${esc(k)}: ${esc(v)}${arrow}
      </div>
    `;
  });

  return rows.join("") || `<span class="muted">No settings defined</span>`;
}

// ---------- Render baseline information ----------
function render() {
  $("#empty").classList.toggle("hidden", baselines.length > 0);
  $("#baseline-area").classList.toggle("hidden", baselines.length === 0);

  const b = current();

  if (!b) return;

  $("#baseline-select").innerHTML = baselines
    .map((x) => `
      <option value="${x.id}" ${x.id === b.id ? "selected" : ""}>
        ${esc(x.name)}${x.active ? " (active)" : ""}
      </option>
    `)
    .join("");

  $("#active-badge").textContent = b.active ? "Active" : "Inactive";

  $("#active-badge").className =
    `badge ${b.active ? "pass" : "plain"}`;

  $("#venue").textContent = b.venue ?? "";

  $("#baseline-actions").classList.toggle("hidden", !canEdit);

  $("#set-active").classList.toggle("hidden", b.active);

  $("#run-check").classList.toggle(
    "hidden",
    !(can(user, "runCheck") && b.active)
  );

  $("#status-head").classList.toggle("hidden", !b.active);

  // Equipment slots
  $("#slots").innerHTML = b.items.map((item) => {
    const status = slots.find(
      (s) => s.itemId === item.id
    )?.status;

    const mapping = canEdit
      ? `
        <select class="inline" data-map="${item.id}">
          <option value="">Not mapped</option>
          ${deviceOptions(item.type, item)
            .map((d) => `
              <option value="${d.id}" ${d.id === item.deviceId ? "selected" : ""}>
                ${esc(d.name)}
              </option>
            `)
            .join("")}
        </select>
      `
      : esc(item.device?.name ?? "Not mapped");

    const recapture =
      item.deviceId && item.device?.source !== "MANUAL"
        ? `
          <button
            class="btn small"
            data-act="recapture"
            data-id="${item.id}"
            title="Accept the device's current settings as the baseline">
            Recapture
          </button>
        `
        : "";

    return `
      <tr>
        <td>
          <strong>${esc(item.label)}</strong>
          <div class="muted">${esc(item.type)}</div>
        </td>

        <td>${mapping}</td>

        <td>${comparison(item)}</td>

        <td>
          ${item.critical
            ? `<span class="badge warning">Critical</span>`
            : `<span class="badge plain">Non-critical</span>`}
        </td>

        ${b.active
          ? `<td>${status ? statusBadge(status) : `<span class="muted">Not checked</span>`}</td>`
          : `<td></td>`}

        <td class="actions">
          ${canEdit
            ? `${recapture}
              <button class="btn small" data-act="edit" data-id="${item.id}">
                Edit
              </button>
              <button class="btn small danger" data-act="remove" data-id="${item.id}">
                Remove
              </button>`
            : ""}
        </td>
      </tr>
    `;
  }).join("");

  if (!b.items.length) {
    $("#slots").innerHTML = `
      <tr>
        <td colspan="6" class="muted" style="text-align:center;padding:28px">
          No equipment slots yet. Add a slot to define the expected setup.
        </td>
      </tr>
    `;
  }
}

// ---------- Check history ----------
function renderHistory(runs) {
  $("#history-card").classList.toggle("hidden", runs.length === 0);

  $("#history").innerHTML = runs.map((r) => `
    <tr>
      <td>${new Date(r.createdAt).toLocaleString()}</td>
      <td>${esc(r.baseline.name)}</td>
      <td>${esc(r.runBy.name)}</td>
      <td>${r.pass}</td>
      <td>${r.warning}</td>
      <td>${r.fail}</td>
      <td>${r.unknown}</td>
    </tr>
  `).join("");
}

// ---------- Load baseline and device data ----------
async function load() {
  [baselines, devices, { slots }] = await Promise.all([
    api("/baselines"),
    api("/devices"),
    api("/dashboard")
  ]);

  render();
}

async function loadHistory() {
  renderHistory(await api("/checks"));
}

poll(load);
loadHistory();

// ---------- Baseline selection ----------
$("#baseline-select").onchange = (e) => {
  selectedId = Number(e.target.value);
  render();
};

// ---------- Run pre-show check ----------
$("#run-check").onclick = guard(async () => {
  await api("/checks", { method: "POST" });

  toast("Pre-show check complete", "success");

  await Promise.all([load(), loadHistory()]);
});

// ---------- Activate baseline ----------
$("#set-active").onclick = guard(async () => {
  await api(`/baselines/${current().id}`, {
    method: "PATCH",
    body: { active: true }
  });

  toast("Baseline activated", "success");

  await load();
});

// ---------- Delete baseline ----------
$("#delete-baseline").onclick = guard(async () => {
  if (!confirm(`Delete "${current().name}"?`)) return;

  await api(`/baselines/${current().id}`, {
    method: "DELETE"
  });

  selectedId = null;

  await load();
});

// ---------- New baseline dialog ----------
if (canEdit) {
  $("#new-baseline").classList.remove("hidden");
  $("#empty-create").classList.remove("hidden");
}

function openNewBaselineDialog() {
  $("#baseline-dialog").showModal();
}

$("#new-baseline").onclick = openNewBaselineDialog;
$("#empty-create").onclick = openNewBaselineDialog;

$("#baseline-form").onsubmit = guard(async (e) => {
  e.preventDefault();

  await api("/baselines", {
    method: "POST",
    body: {
      name: $("#b-name").value,
      venue: $("#b-venue").value,
      eventDate: $("#b-date").value || undefined,
      fromLive: $("#b-live").checked
    }
  });

  $("#baseline-dialog").close();

  e.target.reset();

  toast("Baseline created", "success");

  await load();
});

// ---------- Slot table actions ----------
$("#slots").addEventListener("change", guard(async (e) => {
  const itemId = e.target.dataset.map;

  if (!itemId) return;

  await api(
    `/baselines/${current().id}/items/${itemId}`,
    {
      method: "PATCH",
      body: {
        deviceId: e.target.value
          ? Number(e.target.value)
          : null
      }
    }
  );

  e.target.blur();

  await load();
}));

$("#slots").addEventListener("click", guard(async (e) => {
  const btn = e.target.closest("[data-act]");

  if (!btn) return;

  const item = current().items.find(
    (i) => i.id === Number(btn.dataset.id)
  );

  if (!item) return;

  const url = `/baselines/${current().id}/items/${item.id}`;

  if (btn.dataset.act === "edit") {
    return openSlotDialog(item);
  }

  if (btn.dataset.act === "remove") {
    await api(url, { method: "DELETE" });
  }

  if (btn.dataset.act === "recapture") {
    await api(url, {
      method: "PATCH",
      body: { recapture: true }
    });

    toast("Baseline updated from live settings", "success");
  }

  await load();
}));

// ---------- Add / edit equipment slot ----------
$("#s-type").innerHTML = DEVICE_TYPES
  .map((t) => `<option>${t}</option>`)
  .join("");

function fillDeviceSelect(selectedDeviceId) {
  $("#s-device").innerHTML =
    `<option value="">None</option>` +
    deviceOptions($("#s-type").value, editingItem)
      .map((d) => `
        <option value="${d.id}" ${d.id === selectedDeviceId ? "selected" : ""}>
          ${esc(d.name)}
        </option>
      `)
      .join("");
}

function openSlotDialog(item) {
  editingItem = item;

  $("#slot-title").textContent = item
    ? "Edit slot"
    : "Add slot";

  $("#s-label").value = item?.label ?? "";
  $("#s-type").value = item?.type ?? "MICROPHONE";
  $("#s-type").disabled = !!item;
  $("#s-params").value = formatParams(item?.expectedParams);
  $("#s-critical").checked = item?.critical ?? true;

  fillDeviceSelect(item?.deviceId);

  $("#slot-dialog").showModal();
}

$("#add-slot").onclick = () => openSlotDialog(null);

$("#s-type").onchange = () => fillDeviceSelect(null);

$("#slot-form").onsubmit = guard(async (e) => {
  e.preventDefault();

  const body = {
    label: $("#s-label").value,
    critical: $("#s-critical").checked,
    expectedParams: parseParams($("#s-params").value),
    deviceId: $("#s-device").value
      ? Number($("#s-device").value)
      : null
  };

  const base = `/baselines/${current().id}/items`;

  if (editingItem) {
    await api(`${base}/${editingItem.id}`, {
      method: "PATCH",
      body
    });
  } else {
    await api(base, {
      method: "POST",
      body: {
        ...body,
        type: $("#s-type").value
      }
    });
  }

  $("#slot-dialog").close();

  await load();
});