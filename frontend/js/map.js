import { $, STATUS_COLOR, api, can, esc, guard, poll, requireAuth, statusBadge, toast } from "./common.js";

const user = await requireAuth("map.html");
const manage = can(user, "manageDevices");

// Columns follow the signal flow: sources -> network -> audio hub -> outputs.
const TIER = { PLAYBACK: 0, MICROPHONE: 0, SWITCH: 1, MIXER: 2, PROJECTOR: 3, LIGHT: 3, CAMERA: 3, OTHER: 3 };
const W = 190, H = 56, GAP_X = 90, GAP_Y = 34, PAD = 24;

let devices = [], connections = [], slots = [];
let selected = null; // { kind: "node" | "edge", id }

function layout() {
  const rows = [];
  const pos = new Map();
  for (const d of devices) {
    const tier = TIER[d.type] ?? 3;
    const row = (rows[tier] = (rows[tier] ?? -1) + 1);
    pos.set(d.id, { x: PAD + tier * (W + GAP_X), y: PAD + row * (H + GAP_Y) });
  }
  return pos;
}

function drawMap() {
  const pos = layout();
  const statusOf = new Map(slots.filter((s) => s.deviceId).map((s) => [s.deviceId, s]));
  const width = PAD * 2 + 4 * W + 3 * GAP_X;
  const height = PAD * 2 + Math.max(1, ...Object.values(Object.groupBy(devices, (d) => TIER[d.type] ?? 3)).map((g) => g.length)) * (H + GAP_Y);

  const edges = connections.map((c) => {
    const a = pos.get(c.fromDeviceId), b = pos.get(c.toDeviceId);
    if (!a || !b) return "";
    const x1 = a.x + W, y1 = a.y + H / 2, x2 = b.x, y2 = b.y + H / 2;
    const mx = (x1 + x2) / 2;
    const d = `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
    const sel = selected?.kind === "edge" && selected.id === c.id ? " selected" : "";
    return `<g data-edge="${c.id}"><path class="edge-hit" d="${d}"/><path class="edge${sel}" d="${d}" marker-end="url(#arrow)"/></g>`;
  }).join("");

  const nodes = devices.map((d) => {
    const p = pos.get(d.id);
    const s = statusOf.get(d.id);
    const color = s ? STATUS_COLOR[s.status] : "#475569";
    const sel = selected?.kind === "node" && selected.id === d.id ? " selected" : "";
    return `<g class="node${sel}" data-node="${d.id}" transform="translate(${p.x},${p.y})">
      <rect width="${W}" height="${H}" rx="8" fill="${color}33" stroke="${color}" ${s ? "" : 'stroke-dasharray="5 4"'}/>
      <text x="10" y="23" font-weight="600">${esc(d.name.slice(0, 26))}</text>
      <text x="10" y="42" class="sub">${esc(d.type)} · ${s ? esc(s.status) : "not in baseline"}</text>
    </g>`;
  }).join("");

  $("#map").innerHTML = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#64748b"/></marker></defs>
    ${edges}${nodes}</svg>`;
}

function drawDetails() {
  const box = $("#details");
  if (selected?.kind === "node") {
    const d = devices.find((x) => x.id === selected.id);
    if (!d) return;
    const s = slots.find((x) => x.deviceId === d.id);
    const params = Object.entries(d.params).map(([k, v]) => `<div>${esc(k)}: ${esc(v)}</div>`).join("") || "No settings";
    box.innerHTML = `<h2>${esc(d.name)}</h2>
      ${s ? statusBadge(s.status) : `<span class="muted">Not in the active baseline</span>`}
      ${s ? `<p class="muted">${esc(s.label)}: ${esc(s.details)}</p>` : ""}
      <p>Type: ${esc(d.type)}<br>Online: ${d.source === "MANUAL" ? "n/a (analogue)" : d.online ? "Yes" : "No"}
      ${d.ipAddress ? `<br>IP: ${esc(d.ipAddress)}` : ""}</p>
      <div class="params-box">${params}</div>`;
  } else if (selected?.kind === "edge") {
    const c = connections.find((x) => x.id === selected.id);
    if (!c) return;
    const name = (id) => devices.find((d) => d.id === id)?.name ?? "?";
    box.innerHTML = `<h2>Connection</h2><p>${esc(name(c.fromDeviceId))} → ${esc(name(c.toDeviceId))}${c.label ? `<br><span class="muted">${esc(c.label)}</span>` : ""}</p>
      ${manage ? `<button class="btn danger small" id="remove-edge">Remove connection</button>` : ""}`;
    const rm = $("#remove-edge");
    if (rm) rm.onclick = guard(async () => {
      await api(`/connections/${c.id}`, { method: "DELETE" });
      selected = null;
      await load();
    });
  } else {
    box.innerHTML = `<p class="muted">Select a device or connection.</p>`;
  }
}

function fillSelects() {
  const options = devices.map((d) => `<option value="${d.id}">${esc(d.name)}</option>`).join("");
  for (const id of ["#from", "#to"]) {
    const el = $(id), keep = el.value;
    el.innerHTML = options;
    if (keep) el.value = keep;
  }
}

async function load() {
  [devices, connections, { slots }] = await Promise.all([api("/devices"), api("/connections"), api("/dashboard")]);
  fillSelects();
  drawMap();
  drawDetails();
}

$("#map").addEventListener("click", (e) => {
  const node = e.target.closest("[data-node]");
  const edge = e.target.closest("[data-edge]");
  if (node) selected = { kind: "node", id: Number(node.dataset.node) };
  else if (edge) selected = { kind: "edge", id: Number(edge.dataset.edge) };
  else selected = null;
  drawMap();
  drawDetails();
});

if (manage) {
  $("#add-connection").classList.remove("hidden");
  $("#connect").onclick = guard(async () => {
    await api("/connections", {
      method: "POST",
      body: { fromDeviceId: Number($("#from").value), toDeviceId: Number($("#to").value), label: $("#label").value || undefined },
    });
    $("#label").value = "";
    toast("Connection added", "success");
    await load();
  });
}

poll(load);
