import { prisma } from "@/lib/prisma";
import { route } from "@/lib/api";
import { SIMULATED_NETWORK } from "@/lib/discovery";

export const POST = route("manageDevices", async () => {
  const known = await prisma.device.findMany({ select: { identifier: true } });
  const registered = new Set(known.map((d) => d.identifier));
  await prisma.device.updateMany({
    where: { identifier: { in: SIMULATED_NETWORK.map((d) => d.identifier) } },
    data: { lastSeen: new Date() },
  });
  return SIMULATED_NETWORK.map((d) => ({ ...d, registered: registered.has(d.identifier) }));
});
