import { $, DEVICE_TYPES, api, can, esc, formatParams, guard, parseParams, poll, requireAuth, toast } from "./common.js";
import { deviceIcon, hostIcon } from "./icons.js";

const user = await requireAuth("devices.html");
const manage = can(user, "manageDevices");

let devices = [], found = [], editing = null;

const VIA_LABEL = { lan: "LAN / Wi-Fi", bluetooth: "Bluetooth" };
const viaBadge = (via) => `<span class="badge ${via === "bluetooth" ? "sev-info" : "plain"}">${VIA_LABEL[via]}</span>`;

function render() {
  $("#devices").innerHTML = devices.map((d) => `<tr>
    <td><div class="name-cell">${deviceIcon(d)}<div><strong>${esc(d.name)}</strong><div class="muted">${esc([d.manufacturer, d.model].filter(Boolean).join(" "))}</div></div></div></td>
    <td>${esc(d.type)}</td>
    <td>${d.source === "MANUAL" ? `<span class="badge plain">Analogue</span>` : viaBadge(d.params?.via === "bluetooth" ? "bluetooth" : "lan")}</td>
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

const DOTS = `<span class="dots"><i></i><i></i><i></i></span>`;

$("#scan").onclick = guard(async () => {
  $("#scan").disabled = true;
  $("#scan").innerHTML = `Scanning${DOTS}`;
  $("#scan-summary").textContent = "";
  $("#found").innerHTML = `<li class="scan-wait">Looking for devices on your network and nearby Bluetooth${DOTS}</li>`;
  updatePickedButton();
  let result;
  try {
    result = await api("/discovery/scan", { method: "POST" });
  } finally {
    $("#scan").disabled = false;
    $("#scan").textContent = "Scan again";
    if (!result) $("#found").innerHTML = "";
  }
  // Adoptable first, then registered, then named hosts we cannot adopt, then unknown hosts.
  const rank = (d) => (d.adoptable ? (d.registered ? 1 : 0) : d.name === "Unknown device" ? 3 : 2);
  found = result.devices.sort((a, b) => rank(a) - rank(b));
  const lan = result.subnet ? `${result.lanCount} on ${result.subnet} (LAN / Wi-Fi)` : "no network connection found";
  const bt = result.bluetooth.available ? `${result.bluetooth.count} nearby (Bluetooth)` : `Bluetooth unavailable: ${result.bluetooth.error}`;
  $("#scan-summary").textContent = `Found ${lan}; ${bt}. ${found.filter((d) => !d.adoptable).length} cannot be adopted.`;
  $("#found").innerHTML = found.map((d) => {
    const locked = d.registered || !d.adoptable;
    const tag = d.registered ? "Registered" : d.adoptable ? "Adoptable" : "Not adoptable";
    const details = [
      d.adoptable && d.via === "lan" ? d.type : null,
      d.adoptable ? (d.via === "bluetooth" ? d.model : [d.manufacturer, d.model].filter((x) => x && x !== "-").join(" ")) : null,
      d.ipAddress,
      `MAC ${d.macAddress ?? "unknown"}`,
      d.rssi !== undefined ? `Signal ${d.rssi} dBm` : null,
    ].filter(Boolean).join(" · ");
    return `<li class="${locked ? "done" : ""}"><label>
      <input type="checkbox" value="${esc(d.identifier)}" ${locked ? "disabled" : ""}>
      ${hostIcon(d)}
      <span class="grow"><strong>${esc(d.name)}</strong><br><span class="muted">${esc(details)}</span></span>
      ${viaBadge(d.via)}
      <span class="badge plain">${tag}</span></label></li>`;
  }).join("");
  updatePickedButton();
});

$("#found").addEventListener("change", updatePickedButton);

$("#register-picked").onclick = guard(async () => {
  const ids = picked();
  for (const d of found.filter((x) => ids.includes(x.identifier))) {
    const { registered, adoptable, reason, macAddress, via, kind, rssi, ...body } = d;
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
