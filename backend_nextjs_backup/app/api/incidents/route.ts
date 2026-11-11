import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { route } from "@/lib/api";

export const GET = route(null, () =>
  prisma.incident.findMany({
    orderBy: [{ resolved: "asc" }, { createdAt: "desc" }],
    take: 200,
    include: { device: { select: { name: true } }, reportedBy: { select: { name: true } } },
  })
);

const body = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  severity: z.enum(["INFO", "WARNING", "CRITICAL"]),
  deviceId: z.number().int().nullable().optional(),
});

export const POST = route("logIncident", async ({ req, user }) => {
  const d = body.parse(await req.json());
  return prisma.incident.create({ data: { ...d, reportedById: user.id } });
});
