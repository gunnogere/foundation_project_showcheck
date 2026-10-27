import { $, DEVICE_TYPES, api, can, esc, formatParams, guard, parseParams, poll, requireAuth, toast } from "./common.js";
import { deviceIcon, hostIcon } from "./icons.js";

const user = await requireAuth("devices.html");
const manage = can(user, "manageDevices");

let devices = [], found = [], editing = null;

function render() {
  $("#devices").innerHTML = devices.map((d) => `<tr>
    <td><div class="name-cell">${deviceIcon(d.type)}<div><strong>${esc(d.name)}</strong><div class="muted">${esc([d.manufacturer, d.model].filter(Boolean).join(" "))}</div></div></div></td>
    <td>${esc(d.type)}</td>
    <td><span class="badge plain">${d.source === "MANUAL" ? "Analogue" : "Discovered"}</span></td>
    <td>${esc(d.ipAddress ?? "-")}${d.params?.mac ? `<div class="muted">${esc(d.params.mac)}</div>` : ""}</td>
    <td>${d.source === "MANUAL" ? "-" : d.online ? "Yes" : `<span class="diff">No</span>`}</td>
    <td>${d.baselineItem ? esc(d.baselineItem.label) : `<span class="muted">Not mapped</span>`}</td>
    <td class="actions">${manage ? `<button class="btn small" data-act="edit" data-id="${d.id}">Edit</button>
      <button class="btn small danger" data-act="remove" data-id="${d.id}">Remove</button>` : ""}</td>
  </tr>`).join("");
}

const load = poll(async () => {
  devices = await api("/devices");
  render();
});

$("#devices").addEventListener("click", guard(async (e) => {
  const btn = e.target.closest("[data-act]");
  if (!btn) return;
  const device = devices.find((d) => d.id === Number(btn.dataset.id));
  if (btn.dataset.act === "remove") {
    if (!confirm(`Remove ${device.name}?`)) return;
    await api(`/devices/${device.id}`, { method: "DELETE" });
    await load();
  } else {
    editing = device;
    $("#edit-title").textContent = device.name;
    $("#e-online").checked = device.online;
    $("#e-params").value = formatParams(device.params);
    $("#edit-dialog").showModal();
  }
}));

$("#edit-form").onsubmit = guard(async (e) => {
  e.preventDefault();
  await api(`/devices/${editing.id}`, { method: "PATCH", body: { online: $("#e-online").checked, params: parseParams($("#e-params").value) } });
  $("#edit-dialog").close();
  toast("Device updated", "success");
  await load();
});

// ---------- Register dialog ----------
if (manage) $("#register").classList.remove("hidden");
$("#register").onclick = () => $("#register-dialog").showModal();
$("#m-type").innerHTML = DEVICE_TYPES.map((t) => `<option ${t === "OTHER" ? "selected" : ""}>${t}</option>`).join("");

document.querySelectorAll("[data-tab]").forEach((btn) =>
  btn.addEventListener("click", () => {
    document.querySelectorAll("[data-tab]").forEach((b) => b.classList.toggle("active", b === btn));
    $("#tab-auto").classList.toggle("hidden", btn.dataset.tab !== "auto");
    $("#tab-manual").classList.toggle("hidden", btn.dataset.tab !== "manual");
  })
);

const picked = () => [...document.querySelectorAll("#found input:checked")].map((i) => i.value);

function updatePickedButton() {
  const n = picked().length;
  $("#register-picked").textContent = `Register selected (${n})`;
  $("#register-picked").disabled = n === 0;
}

$("#scan").onclick = guard(async () => {
  $("#scan").disabled = true;
  $("#scan").textContent = "Scanning the network (about 10s)...";
  let result;
  try {
    result = await api("/discovery/scan", { method: "POST" });
  } finally {
    $("#scan").disabled = false;
    $("#scan").textContent = "Scan again";
  }
  // Adoptable first, then registered, then named hosts we cannot adopt, then unknown hosts.
  const rank = (d) => (d.adoptable ? (d.registered ? 1 : 0) : d.name === "Unknown device" ? 3 : 2);
  found = result.devices.sort((a, b) => rank(a) - rank(b));
  $("#scan-summary").textContent = result.subnet
    ? `Scanned ${result.subnet}: ${result.hostsFound} host(s) responded, ${found.filter((d) => !d.adoptable).length} cannot be adopted.`
    : "No network connection found to scan.";
  $("#found").innerHTML = found.map((d) => {
    const locked = d.registered || !d.adoptable;
    const tag = d.registered ? "Registered" : d.adoptable ? "Adoptable" : "Not adoptable";
    const kind = d.adoptable ? `${d.type} · ${[d.manufacturer, d.model].filter((x) => x && x !== "-").join(" ")} · ` : "";
    return `<li class="${locked ? "done" : ""}"><label>
      <input type="checkbox" value="${esc(d.identifier)}" ${locked ? "disabled" : ""}>
      ${hostIcon(d)}
      <span class="grow"><strong>${esc(d.name)}</strong><br><span class="muted">${esc(kind)}${esc(d.ipAddress)} · MAC ${esc(d.macAddress ?? "unknown")}</span></span>
      <span class="badge plain" style="margin-left:auto">${tag}</span></label></li>`;
  }).join("");
  updatePickedButton();
});

$("#found").addEventListener("change", updatePickedButton);

$("#register-picked").onclick = guard(async () => {
  const ids = picked();
  for (const d of found.filter((x) => ids.includes(x.identifier))) {
    const { registered, adoptable, reason, macAddress, ...body } = d;
    await api("/devices", { method: "POST", body: { ...body, source: "DISCOVERED" } });
  }
  toast(`${ids.length} device(s) registered`, "success");
  $("#register-dialog").close();
  $("#found").innerHTML = "";
  updatePickedButton();
  await load();
});

$("#tab-manual").onsubmit = guard(async (e) => {
  e.preventDefault();
  await api("/devices", {
    method: "POST",
    body: {
      name: $("#m-name").value,
      type: $("#m-type").value,
      source: "MANUAL",
      manufacturer: $("#m-manufacturer").value || undefined,
      model: $("#m-model").value || undefined,
      params: parseParams($("#m-params").value),
    },
  });
  e.target.reset();
  $("#register-dialog").close();
  toast("Analogue device registered", "success");
  await load();
});
