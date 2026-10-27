import os from "node:os";
import net from "node:net";
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
  ipAddress: string;
  params: Record<string, string>;
  adoptable: boolean;
  reason?: string;
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
      return { self: a.address, base: `${p1}.${p2}.${p3}`, subnet: `${p1}.${p2}.${p3}.0/24` };
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

const hostname = (ip: string) =>
  Promise.race([dns.reverse(ip).then((n) => n[0]), new Promise<undefined>((r) => setTimeout(r, 800))]).catch(() => undefined);

export async function scanNetwork(): Promise<{ subnet: string | null; hosts: NetworkHost[] }> {
  const network = localNetwork();
  if (!network) return { subnet: null, hosts: [] };

  const ips = Array.from({ length: 254 }, (_, i) => `${network.base}.${i + 1}`);
  const alive = (await mapLimit(ips, 64, async (ip) => (ip === network.self || (await ping(ip)) ? ip : null))).filter(
    (ip): ip is string => !!ip
  );
  const macs = await arpTable();

  const hosts = await mapLimit(alive, 16, async (ip): Promise<NetworkHost> => {
    const mac = macs.get(ip);
    const params: Record<string, string> = mac ? { mac } : {};
    const base = { identifier: `NET-${mac ?? ip}`, ipAddress: ip, params };

    if (ip === network.self)
      return { ...base, name: `${os.hostname()} (this computer)`, type: "OTHER", manufacturer: "-", model: "ShowCheck server", adoptable: false, reason: "This is the computer running ShowCheck." };

    const name = await hostname(ip);
    for (const sig of SIGNATURES)
      if (await portOpen(ip, sig.port))
        return { ...base, name: name ?? `${sig.model} (${ip})`, type: sig.type, manufacturer: sig.manufacturer, model: sig.model, adoptable: true };

    return { ...base, name: name ?? `Unknown host (${ip})`, type: "OTHER", manufacturer: "Unknown", model: "", adoptable: false, reason: NOT_AV };
  });

  return { subnet: network.subnet, hosts };
}
