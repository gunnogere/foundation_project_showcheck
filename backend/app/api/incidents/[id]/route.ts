import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { idOf, route } from "@/lib/api";

const body = z.object({ resolved: z.boolean() });

export const PATCH = route<{ id: string }>("resolveIncident", async ({ req, params }) => {
  const { resolved } = body.parse(await req.json());
  return prisma.incident.update({
    where: { id: idOf(params.id) },
    data: { resolved, resolvedAt: resolved ? new Date() : null },
  });
});
