import { API_URL } from "./config.js";

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const THEME_STORAGE_KEY = "showcheck-theme";

function updateThemeButtons() {
  const isDark = document.documentElement.dataset.theme === "dark";
  const label = isDark ? "Light mode" : "Dark mode";
  document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
    button.textContent = label;
    button.setAttribute("aria-label", `Switch to ${label.toLowerCase()}`);
    button.setAttribute("aria-pressed", String(isDark));
    button.title = `Switch to ${label.toLowerCase()}`;
  });
}

let savedTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
try {
  const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  if (storedTheme === "light" || storedTheme === "dark") savedTheme = storedTheme;
} catch {
}
document.documentElement.dataset.theme = savedTheme;
updateThemeButtons();

document.addEventListener("click", (event) => {
  if (!event.target.closest("[data-theme-toggle]")) return;

  const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
  }
  updateThemeButtons();
}

// Sends requests to the backend and handles unsuccessful responses.
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

// Escape server data before displaying it in HTML.
export const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export const $ = (selector, root = document) => root.querySelector(selector);

export const statusBadge = (s) => `<span class="badge ${s.toLowerCase()}">${esc(s)}</span>`;
export const severityBadge = (s) => `<span class="badge sev-${s.toLowerCase()}">${esc(s[0] + s.slice(1).toLowerCase())}</span>`;

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

// Refreshes the data regularly, but skips updates while a dialog or dropdown is open.
export function poll(fn, ms = 5000) {
  const run = () => fn().catch((e) => console.error(e));
  run();
  setInterval(() => {
    if (document.querySelector("dialog[open]") || document.activeElement?.tagName === "SELECT") return;
    run();
  }, ms);
  return run;
}

// Shows errors as toast messages instead of leaving them unhandled.
export const guard = (fn) => async (e) => {
  try {
    await fn(e);
  } catch (err) {
    toast(err.message, "error");
  }
};

const NAV = [
  ["index.html", "Dashboard"],
  ["map.html", "Network Map"],
  ["baseline.html", "Baseline & Check"],
  ["devices.html", "Devices"],
  ["incidents.html", "Incidents"],
  ["users.html", "Users"],
];

// Checks that a user is logged in and sets up the page sidebar.
export async function requireAuth(page) {
  let user;
  try {
    user = await api("/auth/me");
  } catch {
    location.href = "login.html";
    return new Promise(() => {}); // Stop the page script if authentication fails.
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
      <div class="user-actions">
        <button type="button" class="btn small" data-theme-toggle>Dark mode</button>
        <button id="logout" type="button" class="btn small">Log out</button>
      </div>
    </div>`;
  updateThemeButtons();
  $("#logout").onclick = async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => {});
    location.href = "login.html";
  };

  // Allows dialog buttons to close their parent dialog.
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-close]");
    if (btn) btn.closest("dialog").close();
  });
  return user;
}

// Updates the shared indicator when the live monitoring connection changes.
export function setLiveIndicator(state, message = "") {
  const indicator = $("#live-indicator");
  if (!indicator) return;

  indicator.classList.remove("live", "connecting", "offline");
  indicator.classList.add(state);

  const label = indicator.querySelector(".live-label");
  if (label) {
    label.textContent = message || {
      live: "Live monitoring",
      connecting: "Connecting...",
      offline: "Connection issue",
    }[state] || "Monitoring status unknown";
  }

  indicator.setAttribute("aria-label", message || state);
}