import {
  $,
  STATUS_COLOR,
  api,
  can,
  esc,
  guard,
  poll,
  requireAuth,
  statusBadge,
  toast
} from "./common.js";

const user = await requireAuth("map.html");
const manage = can(user, "manageDevices");

// Columns follow the signal flow:
// sources -> network -> audio hub -> outputs.
const TIER = {
  PLAYBACK: 0,
  MICROPHONE: 0,
  SWITCH: 1,
  MIXER: 2,
  PROJECTOR: 3,
  LIGHT: 3,
  CAMERA: 3,
  OTHER: 3
};

const W = 190;
const H = 64;
const GAP_X = 90;
const GAP_Y = 34;
const PAD = 24;

let devices = [], connections = [], slots = [];
let selected = null;

// ---------- Automatic map layout ----------
function layout() {
  const rows = [];
  const pos = new Map();

  for (const d of devices) {
    const tier = TIER[d.type] ?? 3;
    const row = (rows[tier] = (rows[tier] ?? -1) + 1);

    pos.set(d.id, {
      x: PAD + tier * (W + GAP_X),
      y: PAD + row * (H + GAP_Y)
    });
  }

  return pos;
}

// ---------- Draw network map ----------
function drawMap() {
  const mapElement = $("#map");

  if (!devices.length) {
    mapElement.innerHTML = `
      <div class="map-empty muted" style="padding:40px;text-align:center">
        <h3>No registered devices</h3>
        <p>Register equipment to display the network dependency map.</p>
      </div>
    `;
    return;
  }

  const pos = layout();

  const statusOf = new Map(
    slots
      .filter((s) => s.deviceId)
      .map((s) => [s.deviceId, s])
  );

  const tierCounts = {};

  for (const d of devices) {
    const tier = TIER[d.type] ?? 3;
    tierCounts[tier] = (tierCounts[tier] ?? 0) + 1;
  }

  const maxRows = Math.max(1, ...Object.values(tierCounts));

  const width = PAD * 2 + 4 * W + 3 * GAP_X;
  const height = PAD * 2 + maxRows * (H + GAP_Y);

  // Draw connections first so nodes appear above them.
  const edges = connections.map((c) => {
    const a = pos.get(c.fromDeviceId);
    const b = pos.get(c.toDeviceId);

    if (!a || !b) return "";

    const x1 = a.x + W;
    const y1 = a.y + H / 2;
    const x2 = b.x;
    const y2 = b.y + H / 2;

    const mx = (x1 + x2) / 2;

    const path =
      `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;

    const selectedClass =
      selected?.kind === "edge" && selected.id === c.id
        ? " selected"
        : "";

    return `
      <g data-edge="${c.id}">
        <path class="edge-hit" d="${path}"/>
        <path
          class="edge${selectedClass}"
          d="${path}"
          marker-end="url(#arrow)"
        />
      </g>
    `;
  }).join("");

  // Draw device nodes.
  const nodes = devices.map((d) => {
    const p = pos.get(d.id);
    const s = statusOf.get(d.id);

    const color = s
      ? STATUS_COLOR[s.status] ?? STATUS_COLOR.UNKNOWN
      : "#64748b";

    const selectedClass =
      selected?.kind === "node" && selected.id === d.id
        ? " selected"
        : "";

    const statusText = s
      ? esc(s.status)
      : "Not in baseline";

    const onlineText = d.source === "MANUAL"
      ? "Analogue"
      : d.online
        ? "Online"
        : "Offline";

    const deviceName = d.name.length > 26
      ? `${esc(d.name.slice(0, 23))}...`
      : esc(d.name);

    return `
      <g
        class="node${selectedClass}"
        data-node="${d.id}"
        transform="translate(${p.x},${p.y})"
      >
        <title>${esc(d.name)} - ${statusText} - ${onlineText}</title>

        <rect
          width="${W}"
          height="${H}"
          rx="9"
          fill="${color}22"
          stroke="${color}"
        />

        <text x="12" y="24" font-weight="600">
          ${deviceName}
        </text>

        <text x="12" y="44" class="sub">
          ${esc(d.type)} · ${statusText}
        </text>
      </g>
    `;
  }).join("");

  mapElement.innerHTML = `
    <svg
      width="${width}"
      height="${height}"
      viewBox="0 0 ${width} ${height}"
      role="img"
      aria-label="Network dependency map"
    >
      <defs>
        <marker
          id="arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path
            d="M0,0 L10,5 L0,10 z"
            fill="#777777"
          />
        </marker>
      </defs>

      ${edges}
      ${nodes}
    </svg>
  `;
}

// ---------- Device and connection details ----------
function drawDetails() {
  const box = $("#details");

  if (selected?.kind === "node") {
    const d = devices.find((x) => x.id === selected.id);

    if (!d) {
      selected = null;
      drawDetails();
      return;
    }

    const s = slots.find((x) => x.deviceId === d.id);

    const params = Object.entries(d.params ?? {})
      .map(([k, v]) => `
        <div>
          <strong>${esc(k)}:</strong> ${esc(v)}
        </div>
      `)
      .join("") || `<span class="muted">No settings available</span>`;

    const onlineStatus = d.source === "MANUAL"
      ? `<span class="badge plain">Analogue</span>`
      : d.online
        ? `<span class="badge pass">Online</span>`
        : `<span class="badge fail">Offline</span>`;

    const healthStatus = s
      ? statusBadge(s.status)
      : `<span class="badge plain">Not in baseline</span>`;

    box.innerHTML = `
      <div class="dashboard-eyebrow">DEVICE INSPECTION</div>

      <h2>${esc(d.name)}</h2>

      <div class="row">
        ${healthStatus}
        ${onlineStatus}
      </div>

      ${s
        ? `<p class="muted">
            <strong>Baseline role:</strong> ${esc(s.label)}
          </p>
          <p class="muted">${esc(s.details)}</p>`
        : ""}

      <div class="params-box">
        <p><strong>Device information</strong></p>

        <p>
          <strong>Type:</strong> ${esc(d.type)}
          <br>
          <strong>Manufacturer:</strong> ${esc(d.manufacturer ?? "-")}
          <br>
          <strong>Model:</strong> ${esc(d.model ?? "-")}
          <br>
          <strong>IP address:</strong> ${esc(d.ipAddress ?? "-")}
        </p>
      </div>

      <div class="params-box">
        <p><strong>Device settings</strong></p>
        ${params}
      </div>
    `;

  } else if (selected?.kind === "edge") {
    const c = connections.find((x) => x.id === selected.id);

    if (!c) {
      selected = null;
      drawDetails();
      return;
    }

    const name = (id) =>
      devices.find((d) => d.id === id)?.name ?? "?";

    box.innerHTML = `
      <div class="dashboard-eyebrow">CONNECTION INSPECTION</div>

      <h2>Connection details</h2>

      <div class="params-box">
        <p><strong>Source device</strong></p>
        <p>${esc(name(c.fromDeviceId))}</p>

        <p><strong>Destination device</strong></p>
        <p>${esc(name(c.toDeviceId))}</p>

        ${c.label
          ? `<p><strong>Connection label</strong><br>${esc(c.label)}</p>`
          : ""}
      </div>

      ${manage
        ? `<button class="btn danger small" id="remove-edge">
             Remove connection
           </button>`
        : ""}
    `;

    const rm = $("#remove-edge");

    if (rm) {
      rm.onclick = guard(async () => {
        await api(`/connections/${c.id}`, {
          method: "DELETE"
        });

        selected = null;

        toast("Connection removed", "success");

        await load();
      });
    }

  } else {
    box.innerHTML = `
      <div class="dashboard-eyebrow">INSPECTION PANEL</div>
      <h2>Device details</h2>
      <p class="muted">
        Select a device or connection on the map to inspect
        its information.
      </p>
    `;
  }
}

// ---------- Populate connection selectors ----------
function fillSelects() {
  const options = devices.length
    ? devices.map((d) =>
        `<option value="${d.id}">${esc(d.name)}</option>`
      ).join("")
    : `<option value="">No registered devices</option>`;

  for (const id of ["#from", "#to"]) {
    const el = $(id);
    const keep = el.value;

    el.innerHTML = options;

    if (keep) el.value = keep;
  }
}

// ---------- Load map information ----------
async function load() {
  [devices, connections, { slots }] = await Promise.all([
    api("/devices"),
    api("/connections"),
    api("/dashboard")
  ]);

  // Clear selection if its device or connection no longer exists.
  if (
    selected?.kind === "node" &&
    !devices.some((d) => d.id === selected.id)
  ) {
    selected = null;
  }

  if (
    selected?.kind === "edge" &&
    !connections.some((c) => c.id === selected.id)
  ) {
    selected = null;
  }

  fillSelects();
  drawMap();
  drawDetails();
}

// ---------- Select map devices and connections ----------
$("#map").addEventListener("click", (e) => {
  const node = e.target.closest("[data-node]");
  const edge = e.target.closest("[data-edge]");

  if (node) {
    selected = {
      kind: "node",
      id: Number(node.dataset.node)
    };
  } else if (edge) {
    selected = {
      kind: "edge",
      id: Number(edge.dataset.edge)
    };
  } else {
    selected = null;
  }

  drawMap();
  drawDetails();
});

// ---------- Add connection ----------
if (manage) {
  $("#add-connection").classList.remove("hidden");

  $("#connect").onclick = guard(async () => {
    await api("/connections", {
      method: "POST",
      body: {
        fromDeviceId: Number($("#from").value),
        toDeviceId: Number($("#to").value),
        label: $("#label").value || undefined
      }
    });

    $("#label").value = "";

    toast("Connection added", "success");

    await load();
  });
}

// ---------- Automatic refresh ----------
poll(load);