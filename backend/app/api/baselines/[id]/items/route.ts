import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError, idOf, route } from "@/lib/api";

const body = z.object({
  label: z.string().min(1),
  type: z.enum(["CAMERA", "LIGHT", "MICROPHONE", "SWITCH", "MIXER", "PROJECTOR", "PLAYBACK", "OTHER"]),
  expectedParams: z.record(z.string(), z.string()).default({}),
  critical: z.boolean().default(true),
  deviceId: z.number().int().nullable().optional(),
});

export const POST = route<{ id: string }>("editBaseline", async ({ req, params }) => {
  const d = body.parse(await req.json());
  if (d.deviceId) {
    const dev = await prisma.device.findUnique({ where: { id: d.deviceId }, include: { baselineItem: true } });
    if (!dev) throw new ApiError(404, "Device not found");
    if (dev.baselineItem) throw new ApiError(409, "Device is already mapped to a baseline slot");
  }
  return prisma.baselineItem.create({
    data: { ...d, expectedParams: d.expectedParams as Prisma.InputJsonValue, baselineId: idOf(params.id) },
  });
});
