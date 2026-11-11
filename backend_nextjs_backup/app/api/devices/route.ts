import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError, route } from "@/lib/api";

export const GET = route(null, () =>
  prisma.device.findMany({
    orderBy: { id: "asc" },
    include: { baselineItem: { select: { id: true, label: true, baselineId: true } } },
  })
);

const deviceBody = z.object({
  name: z.string().min(1),
  type: z.enum(["CAMERA", "LIGHT", "MICROPHONE", "SWITCH", "MIXER", "PROJECTOR", "PLAYBACK", "OTHER"]),
  source: z.enum(["DISCOVERED", "MANUAL"]).default("MANUAL"),
  identifier: z.string().min(1).optional(),
  manufacturer: z.string().optional(),
  model: z.string().optional(),
  ipAddress: z.string().optional(),
  params: z.record(z.string(), z.string()).default({}),
});

export const POST = route("manageDevices", async ({ req }) => {
  const d = deviceBody.parse(await req.json());
  const identifier = d.identifier ?? `MANUAL-${Date.now()}`;
  if (await prisma.device.findUnique({ where: { identifier } }))
    throw new ApiError(409, "Device already registered");
  return prisma.device.create({
    data: { ...d, identifier, params: d.params as Prisma.InputJsonValue },
  });
});
