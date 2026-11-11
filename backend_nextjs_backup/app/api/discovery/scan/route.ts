import { prisma } from "@/lib/prisma";
import { route } from "@/lib/api";
import { scanNetwork } from "@/lib/network-scan";
import { scanBluetooth } from "@/lib/bluetooth-scan";

// Scans the LAN/Wi-Fi subnet and nearby Bluetooth at the same time.
export const POST = route("manageDevices", async () => {
  const [lan, bluetooth, known] = await Promise.all([
    scanNetwork(),
    scanBluetooth(),
    prisma.device.findMany({ select: { identifier: true } }),
  ]);
  const registered = new Set(known.map((d) => d.identifier));
  const devices = [...lan.hosts, ...bluetooth.hosts].map((h) => ({ ...h, registered: registered.has(h.identifier) }));

  return {
    subnet: lan.subnet,
    lanCount: lan.hosts.length,
    bluetooth: { available: bluetooth.available, error: bluetooth.error, count: bluetooth.hosts.length },
    devices,
  };
});
