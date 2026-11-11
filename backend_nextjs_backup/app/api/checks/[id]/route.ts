import { prisma } from "@/lib/prisma";
import { ApiError, idOf, route } from "@/lib/api";

export const GET = route<{ id: string }>(null, async ({ params }) => {
  const run = await prisma.checkRun.findUnique({
    where: { id: idOf(params.id) },
    include: {
      runBy: { select: { name: true } },
      baseline: { select: { name: true } },
      results: { include: { item: { select: { label: true, type: true } } } },
    },
  });
  if (!run) throw new ApiError(404, "Check run not found");
  return run;
});
