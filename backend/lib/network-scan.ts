import os from "node:os";
import net from "node:net";
import dgram from "node:dgram";
import dns from "node:dns/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import type { DeviceType } from "@prisma/client";

const run = promisify(execFile);

export type NetworkHost = {
  identifier: string;
  name: string;
  type: DeviceType;
  manufacturer: string;
  model: string;
  ipAddress?: string;
  macAddress?: string;
  params: Record<string, string>;
  adoptable: boolean;
  reason?: string;
  via: "lan" | "bluetooth";
  kind?: string;
  rssi?: number;
};

// A host is only adoptable if it answers a protocol we know how to talk to.
const SIGNATURES: { port: number; type: DeviceType; manufacturer: string; model: string }[] = [
  { port: 4352, type: "PROJECTOR", manufacturer: "Unknown", model: "PJLink projector" },
  { port: 2202, type: "MICROPHONE", manufacturer: "Shure", model: "Shure network receiver" },
  { port: 554, type: "CAMERA", manufacturer: "Unknown", model: "RTSP camera" },
];

const NOT_AV = "Not a recognised AV device. Only gear answering PJLink, Shure control or RTSP can be adopted.";

// First real IPv4 interface, scanned as a /24 around our address.
function localNetwork() {
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    if (/^(lo|docker|br-|veth|virbr)/.test(name)) continue;
    const a = addrs?.find((x) => x.family === "IPv4" && !x.internal);
    if (a) {
      const [p1, p2, p3] = a.address.split(".");
      return { self: a.address, selfMac: a.mac, base: `${p1}.${p2}.${p3}`, subnet: `${p1}.${p2}.${p3}.0/24` };
    }
  }
  return null;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    })
  );
  return out;
}

async function ping(ip: string) {
  try {
    await run("ping", ["-c", "1", "-W", "1", ip]);
    return true;
  } catch {
    return false;
  }
}

// Linux only: the kernel's ARP table is filled by the pings above.
async function arpTable() {
  const macs = new Map<string, string>();
  try {
    const lines = (await readFile("/proc/net/arp", "utf8")).split("\n").slice(1);
    for (const l of lines) {
      const [ip, , , mac] = l.trim().split(/\s+/);
      if (ip && mac && mac !== "00:00:00:00:00:00") macs.set(ip, mac);
    }
  } catch {
    /* no ARP table, MAC addresses stay blank */
  }
  return macs;
}

const portOpen = (ip: string, port: number) =>
  new Promise<boolean>((resolve) => {
    const s = net.connect({ host: ip, port, timeout: 800 });
    s.once("connect", () => { s.destroy(); resolve(true); });
    s.once("timeout", () => { s.destroy(); resolve(false); });
    s.once("error", () => resolve(false));
  });

// ---------- Device names ----------
// Phones answer mDNS (Apple: "Joshuas-iPhone"), Windows PCs answer NetBIOS ("DESKTOP-PC"),
// and routers often know DHCP hostnames via reverse DNS.

function udpQuery(ip: string, port: number, packet: Buffer): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const sock = dgram.createSocket("udp4");
    let finished = false;
    const finish = (b: Buffer | null) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      sock.close();
      resolve(b);
    };
    const timer = setTimeout(() => finish(null), 1000);
    sock.once("message", (m) => finish(m));
    sock.once("error", () => finish(null));
    sock.send(packet, port, ip, (err) => err && finish(null));
  });
}

// Reads a DNS-style name (with compression pointers) and where it ends.
function readName(buf: Buffer, start: number) {
  const labels: string[] = [];
  let off = start, end = -1, hops = 0;
  while (off < buf.length && hops < 20) {
    const len = buf[off];
    if (len === 0) {
      if (end < 0) end = off + 1;
      break;
    }
    if ((len & 0xc0) === 0xc0) {
      if (end < 0) end = off + 2;
      off = ((len & 0x3f) << 8) | buf[off + 1];
      hops++;
      continue;
    }
    labels.push(buf.toString("latin1", off + 1, off + 1 + len));
    off += len + 1;
  }
  return { name: labels.join("."), end: end < 0 ? off : end };
}

async function mdnsName(ip: string) {
  const labels = [...ip.split(".").reverse(), "in-addr", "arpa"].map((l) => Buffer.concat([Buffer.from([l.length]), Buffer.from(l)]));
  const query = Buffer.concat([Buffer.from([0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0]), ...labels, Buffer.from([0, 0, 12, 0x80, 1])]);
  const res = await udpQuery(ip, 5353, query);
  if (!res || res.length < 12 || res.readUInt16BE(6) === 0) return undefined;

  let off = 12;
  for (let i = 0; i < res.readUInt16BE(4); i++) off = readName(res, off).end + 4;
  const answerName = readName(res, off);
  return readName(res, answerName.end + 10).name;
}

async function netbiosName(ip: string) {
  const query = Buffer.concat([
    Buffer.from([0x12, 0x34, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0x20]),
    Buffer.from("CK" + "A".repeat(30)),
    Buffer.from([0, 0, 0x21, 0, 1]),
  ]);
  const res = await udpQuery(ip, 137, query);
  if (!res || res.length < 57) return undefined;

  const rdata = readName(res, 12).end + 10;
  const count = res[rdata];
  for (let i = 0; i < count; i++) {
    const e = rdata + 1 + i * 18;
    const suffix = res[e + 15], flags = res.readUInt16BE(e + 16);
    if (suffix === 0 && (flags & 0x8000) === 0) return res.toString("latin1", e, e + 15).trim();
  }
  return undefined;
}

const reverseDns = (ip: string) =>
  Promise.race([dns.reverse(ip).then((n) => n[0]), new Promise<undefined>((r) => setTimeout(r, 1000))]).catch(() => undefined);

async function deviceName(ip: string) {
  const [mdns, netbios, rdns] = await Promise.all([mdnsName(ip).catch(() => undefined), netbiosName(ip).catch(() => undefined), reverseDns(ip)]);
  // Some routers answer reverse DNS with the IP itself; that is not a name.
  const real = [mdns, netbios, rdns].find((n) => n && !/^\d+\.\d+\.\d+\.\d+/.test(n) && !n.endsWith("arpa"));
  return real?.split(".")[0] || undefined;
}

export async function scanNetwork(): Promise<{ subnet: string | null; hosts: NetworkHost[] }> {
  const network = localNetwork();
  if (!network) return { subnet: null, hosts: [] };

  const ips = Array.from({ length: 254 }, (_, i) => `${network.base}.${i + 1}`);
  const alive = (await mapLimit(ips, 64, async (ip) => (ip === network.self || (await ping(ip)) ? ip : null))).filter(
    (ip): ip is string => !!ip
  );
  const macs = await arpTable();

  const hosts = await mapLimit(alive, 16, async (ip): Promise<NetworkHost> => {
    const macAddress = ip === network.self ? network.selfMac : macs.get(ip);
    const params: Record<string, string> = macAddress ? { mac: macAddress } : {};
    const base = { identifier: `NET-${macAddress ?? ip}`, ipAddress: ip, macAddress, params, via: "lan" as const };

    if (ip === network.self)
      return { ...base, name: `${os.hostname()} (this computer)`, type: "OTHER", manufacturer: "-", model: "ShowCheck server", adoptable: false, reason: "This is the computer running ShowCheck." };

    const name = (await deviceName(ip)) ?? "Unknown device";
    for (const sig of SIGNATURES)
      if (await portOpen(ip, sig.port))
        return { ...base, name, type: sig.type, manufacturer: sig.manufacturer, model: sig.model, adoptable: true };

    return { ...base, name, type: "OTHER", manufacturer: "Unknown", model: "", adoptable: false, reason: NOT_AV };
  });

  return { subnet: network.subnet, hosts };
}
