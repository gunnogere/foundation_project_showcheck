import { prisma } from "@/lib/prisma";
import { route } from "@/lib/api";
import { SIMULATED_NETWORK } from "@/lib/discovery";
import { scanNetwork } from "@/lib/network-scan";

// Real hosts on the local network (mostly not adoptable) plus the simulated demo gear.
export const POST = route("manageDevices", async () => {
  const [{ subnet, hosts }, known] = await Promise.all([scanNetwork(), prisma.device.findMany({ select: { identifier: true } })]);
  const registered = new Set(known.map((d) => d.identifier));

  await prisma.device.updateMany({
    where: { identifier: { in: SIMULATED_NETWORK.map((d) => d.identifier) } },
    data: { lastSeen: new Date() },
  });

  const devices = [
    ...SIMULATED_NETWORK.map((d) => ({ ...d, origin: "simulated", adoptable: true })),
    ...hosts.map((h) => ({ ...h, origin: "network" })),
  ].map((d) => ({ ...d, registered: registered.has(d.identifier) }));

  return { subnet, hostsFound: hosts.length, devices };
});
