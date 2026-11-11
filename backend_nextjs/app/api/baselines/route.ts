import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { route } from "@/lib/api";

const include = { items: { orderBy: { id: "asc" as const }, include: { device: true } } };

export const GET = route(null, () =>
  prisma.baseline.findMany({ orderBy: { id: "desc" }, include })
);

const body = z.object({
  name: z.string().min(1),
  venue: z.string().optional(),
  eventDate: z.string().optional(),
  // Snapshot every registered device's current settings as the approved setup.
  fromLive: z.boolean().default(false),
});

export const POST = route("editBaseline", async ({ req }) => {
  const d = body.parse(await req.json());
  const devices = d.fromLive ? await prisma.device.findMany({ orderBy: { id: "asc" } }) : [];
  return prisma.baseline.create({
    data: {
      name: d.name,
      venue: d.venue || null,
      eventDate: d.eventDate ? new Date(d.eventDate) : null,
      items: {
        create: devices.map((dev) => ({
          label: dev.name,
          type: dev.type,
          expectedParams: dev.params as Prisma.InputJsonValue,
          deviceId: dev.id,
        })),
      },
    },
    include,
  });
});
