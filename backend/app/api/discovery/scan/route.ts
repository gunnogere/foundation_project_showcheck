import { prisma } from "@/lib/prisma";
import { route } from "@/lib/api";
import { scanNetwork } from "@/lib/network-scan";

// Real hosts on the local network. Only gear speaking a supported protocol is adoptable.
export const POST = route("manageDevices", async () => {
  const [{ subnet, hosts }, known] = await Promise.all([scanNetwork(), prisma.device.findMany({ select: { identifier: true } })]);
  const registered = new Set(known.map((d) => d.identifier));
  const devices = hosts.map((h) => ({ ...h, registered: registered.has(h.identifier) }));
  return { subnet, hostsFound: hosts.length, devices };
});
