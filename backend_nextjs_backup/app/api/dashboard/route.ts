import { prisma } from "@/lib/prisma";
import { route } from "@/lib/api";
import { liveStatus } from "@/lib/status";

// Polled by the dashboard and network map.
export const GET = route(null, async () => {
  const [status, devices, openIncidents, lastCheck] = await Promise.all([
    liveStatus(),
    prisma.device.count(),
    prisma.incident.findMany({
      where: { resolved: false },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { device: { select: { name: true } } },
    }),
    prisma.checkRun.findFirst({ orderBy: { createdAt: "desc" }, include: { runBy: { select: { name: true } } } }),
  ]);
  return {
    ...(status ?? { baseline: null, slots: [], counts: { PASS: 0, WARNING: 0, FAIL: 0, UNKNOWN: 0 } }),
    deviceCount: devices,
    openIncidents,
    lastCheck,
  };
});
