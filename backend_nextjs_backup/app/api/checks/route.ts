import { prisma } from "@/lib/prisma";
import { ApiError, route } from "@/lib/api";
import { liveStatus } from "@/lib/status";

export const GET = route(null, () =>
  prisma.checkRun.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { runBy: { select: { name: true } }, baseline: { select: { name: true } } },
  })
);

// Runs the pre-show check against the active baseline and stores the result.
export const POST = route("runCheck", async ({ user }) => {
  const status = await liveStatus();
  if (!status) throw new ApiError(400, "No active baseline. Activate a baseline first.");

  const run = await prisma.checkRun.create({
    data: {
      baselineId: status.baseline.id,
      runById: user.id,
      pass: status.counts.PASS,
      warning: status.counts.WARNING,
      fail: status.counts.FAIL,
      unknown: status.counts.UNKNOWN,
      results: {
        create: status.slots.map((s) => ({ itemId: s.itemId, status: s.status, details: s.details })),
      },
    },
    include: { results: { include: { item: { select: { label: true, type: true } } } } },
  });

  // Log one open incident per failing device, without duplicating existing ones.
  for (const s of status.slots.filter((s) => s.status === "FAIL")) {
    const title = `Check failed: ${s.label}`;
    const open = await prisma.incident.findFirst({ where: { title, resolved: false } });
    if (!open)
      await prisma.incident.create({
        data: { title, description: s.details, severity: "CRITICAL", deviceId: s.deviceId, reportedById: user.id },
      });
  }
  return run;
});
