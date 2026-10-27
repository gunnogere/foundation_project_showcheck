import { API_URL } from "./config.js";

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Calls the backend. Throws ApiError with the server's message on failure.
export async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(`${API_URL}/api${path}`, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error || "Request failed");
  return data;
}

// ---------- Roles (mirrors backend/lib/rbac.ts; only hides buttons, the API enforces it) ----------
const PERMISSIONS = {
  manageUsers: ["ADMIN"],
  editBaseline: ["ADMIN", "TECH_DIRECTOR"],
  manageDevices: ["ADMIN", "TECH_DIRECTOR"],
  runCheck: ["ADMIN", "TECH_DIRECTOR", "OPERATOR"],
  logIncident: ["ADMIN", "TECH_DIRECTOR", "OPERATOR"],
  resolveIncident: ["ADMIN", "TECH_DIRECTOR"],
};
export const ROLE_LABEL = { ADMIN: "Admin", TECH_DIRECTOR: "Technical Director", OPERATOR: "Operator", VIEWER: "Viewer" };
export const can = (user, permission) => PERMISSIONS[permission].includes(user.role);

export const DEVICE_TYPES = ["CAMERA", "LIGHT", "MICROPHONE", "SWITCH", "MIXER", "PROJECTOR", "PLAYBACK", "OTHER"];

// ---------- Small helpers ----------
// Always escape server data before putting it in innerHTML.
export const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export const $ = (selector, root = document) => root.querySelector(selector);

export const statusBadge = (s) => `<span class="badge ${s.toLowerCase()}">${esc(s)}</span>`;
export const severityBadge = (s) => `<span class="badge sev-${s.toLowerCase()}">${esc(s)}</span>`;

export const STATUS_COLOR = { PASS: "#10b981", WARNING: "#f59e0b", FAIL: "#ef4444", UNKNOWN: "#94a3b8" };

// "key=value" per line <-> object
export function parseParams(text) {
  const out = {};
  for (const line of text.split("\n")) {
    const i = line.indexOf("=");
    if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}
export const formatParams = (p) => Object.entries(p || {}).map(([k, v]) => `${k}=${v}`).join("\n");

export function toast(message, type = "info") {
  let box = $("#toasts");
  if (!box) {
    box = document.createElement("div");
    box.id = "toasts";
    document.body.append(box);
  }
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  box.append(el);
  setTimeout(() => el.remove(), 3500);
}

// Runs fn now and every `ms`. Ticks are skipped while the user is in a dialog or choosing from a dropdown.
export function poll(fn, ms = 5000) {
  const run = () => fn().catch((e) => console.error(e));
  run();
  setInterval(() => {
    if (document.querySelector("dialog[open]") || document.activeElement?.tagName === "SELECT") return;
    run();
  }, ms);
  return run;
}

// Wrap a click/submit handler so errors become toasts.
export const guard = (fn) => async (e) => {
  try {
    await fn(e);
  } catch (err) {
    toast(err.message, "error");
  }
};

// ---------- Page shell: login check + sidebar ----------
const NAV = [
  ["index.html", "Dashboard"],
  ["map.html", "Network Map"],
  ["baseline.html", "Baseline & Check"],
  ["devices.html", "Devices"],
  ["incidents.html", "Incidents"],
  ["users.html", "Users"],
];

// Call at the top of every page except login. Returns the logged-in user.
export async function requireAuth(page) {
  let user;
  try {
    user = await api("/auth/me");
  } catch {
    location.href = "login.html";
    return new Promise(() => {}); // stop the page script
  }

  const links = NAV.filter(([href]) => href !== "users.html" || can(user, "manageUsers"))
    .map(([href, label]) => `<a href="${href}" class="${href === page ? "active" : ""}">${label}</a>`)
    .join("");
  $("#sidebar").innerHTML = `
    <div class="logo">Show<span>Check</span></div>
    <nav>${links}</nav>
    <div class="user">
      <strong>${esc(user.name)}</strong>
      <div class="muted">${esc(ROLE_LABEL[user.role])}</div>
      <button id="logout" class="btn small">Log out</button>
    </div>`;
  $("#logout").onclick = async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => {});
    location.href = "login.html";
  };

  // Any button with data-close closes the dialog it is inside.
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-close]");
    if (btn) btn.closest("dialog").close();
  });
  return user;
}
