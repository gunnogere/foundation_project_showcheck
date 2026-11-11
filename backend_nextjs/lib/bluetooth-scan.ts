import { spawn } from "node:child_process";
import type { NetworkHost } from "./network-scan";

// Devices only report details (name, icon, class) while discovery is running, so everything is read from the live scan output.
type Seen = { name?: string; alias?: string; icon?: string; cls?: number; rssi?: number; uuids: string[] };

const SCAN_SECONDS = 8;
// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g;
const AUDIO_UUIDS = ["0000110b", "0000110a", "0000111e", "00001108"]; // A2DP sink/source, handsfree, headset
const AUDIO_NAME = /speaker|headphone|\bphones\b|headset|earphone|earbud|buds|pods|disco|boom|jbl|soundbar|sound ?bar/i;
const HEADSET_NAME = /headphone|\bphones\b|headset|earphone|earbud|buds|pods|disco/i;

function discover(): Promise<Map<string, Seen>> {
  return new Promise((resolve, reject) => {
    const found = new Map<string, Seen>();
    const get = (mac: string) => found.get(mac) ?? found.set(mac, { uuids: [] }).get(mac)!;
    const p = spawn("bluetoothctl", ["--timeout", String(SCAN_SECONDS), "scan", "on"]);
    let buf = "";

    const onLine = (raw: string) => {
      const line = raw.replace(ANSI, "").trim();
      const m = line.match(/^\[(NEW|CHG)\] Device ([0-9A-F]{2}(?::[0-9A-F]{2}){5}) ?(.*)$/i);
      if (!m) return;
      const seen = get(m[2].toUpperCase());
      if (m[1] === "NEW") return void (m[3] && (seen.name = m[3]));
      const [key, ...rest] = m[3].split(": ");
      const value = rest.join(": ");
      if (key === "Name") seen.name = value;
      else if (key === "Alias") seen.alias = value;
      else if (key === "Icon") seen.icon = value;
      else if (key === "Class") seen.cls = parseInt(value, 16);
      else if (key === "RSSI") seen.rssi = Number(value.match(/\((-?\d+)\)/)?.[1] ?? NaN);
      else if (key === "UUIDs") seen.uuids.push(value.toLowerCase());
    };

    p.stdout.on("data", (d: Buffer) => {
      buf += d.toString();
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      lines.forEach(onLine);
    });
    p.on("error", reject);
    const kill = setTimeout(() => p.kill(), (SCAN_SECONDS + 4) * 1000);
    p.on("close", () => {
      clearTimeout(kill);
      resolve(found);
    });
  });
}

function classify(name: string, s: Seen) {
  const icon = s.icon ?? "";
  const major = s.cls === undefined ? -1 : (s.cls >> 8) & 0x1f;
  const looksAudio = icon.startsWith("audio") || AUDIO_NAME.test(name) || (!icon && (major === 4 || AUDIO_UUIDS.some((u) => s.uuids.some((x) => x.startsWith(u)))));

  if (looksAudio && !["phone", "computer"].includes(icon)) {
    const kind = icon === "audio-headset" || icon === "audio-headphones" || HEADSET_NAME.test(name) ? "headset" : "speaker";
    return { adoptable: true, kind, label: kind === "headset" ? "Bluetooth headset" : "Bluetooth speaker" };
  }
  if (icon === "phone") return { adoptable: false, kind: "phone", label: "Phone" };
  if (icon === "computer") return { adoptable: false, kind: "laptop", label: "Computer" };
  return { adoptable: false, kind: undefined, label: "" };
}

export async function scanBluetooth(): Promise<{ available: boolean; error?: string; hosts: NetworkHost[] }> {
  let found: Map<string, Seen>;
  try {
    found = await discover();
  } catch {
    return { available: false, error: "Bluetooth tools (bluetoothctl) not found on the server.", hosts: [] };
  }

  const hosts = [...found.entries()].map(([mac, s]): NetworkHost => {
    const dashed = mac.replace(/:/g, "-");
    const raw = (s.alias ?? s.name ?? "").slice(0, 60);
    const name = !raw || raw === dashed ? "Unknown device" : raw;
    const c = classify(name, s);
    return {
      identifier: `BT-${mac}`,
      name,
      type: "OTHER",
      manufacturer: "Bluetooth",
      model: c.label,
      macAddress: mac,
      params: { mac, via: "bluetooth", ...(c.kind ? { kind: c.kind } : {}) },
      adoptable: c.adoptable,
      reason: c.adoptable ? undefined : "Not audio gear. Only Bluetooth headsets and speakers can be adopted.",
      via: "bluetooth",
      kind: c.kind,
      rssi: s.rssi !== undefined && Number.isFinite(s.rssi) ? s.rssi : undefined,
    };
  });

  return { available: true, hosts };
}
