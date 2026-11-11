import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError, idOf, route } from "@/lib/api";

const body = z.object({
  label: z.string().min(1).optional(),
  expectedParams: z.record(z.string(), z.string()).optional(),
  critical: z.boolean().optional(),
  deviceId: z.number().int().nullable().optional(), // null = unmap
  recapture: z.boolean().optional(), // copy the mapped device's current settings into the baseline
});

type P = { id: string; itemId: string };

export const PATCH = route<P>("editBaseline", async ({ req, params }) => {
  const itemId = idOf(params.itemId);
  const { expectedParams, deviceId, recapture, ...rest } = body.parse(await req.json());
  const item = await prisma.baselineItem.findUnique({ where: { id: itemId } });
  if (!item) throw new ApiError(404, "Baseline slot not found");

  let expected = expectedParams;
  const targetId = deviceId === undefined ? item.deviceId : deviceId;

  if (deviceId) {
    const dev = await prisma.device.findUnique({ where: { id: deviceId }, include: { baselineItem: true } });
    if (!dev) throw new ApiError(404, "Device not found");
    if (dev.type !== item.type) throw new ApiError(400, `Slot expects a ${item.type}, device is a ${dev.type}`);
    if (dev.baselineItem && dev.baselineItem.id !== itemId)
      throw new ApiError(409, `Device is already mapped to "${dev.baselineItem.label}"`);
  }
  if (recapture && targetId) {
    const dev = await prisma.device.findUnique({ where: { id: targetId } });
    expected = (dev?.params ?? {}) as Record<string, string>;
  }

  return prisma.baselineItem.update({
    where: { id: itemId },
    data: {
      ...rest,
      ...(deviceId !== undefined && { deviceId }),
      ...(expected && { expectedParams: expected as Prisma.InputJsonValue }),
    },
  });
});

export const DELETE = route<P>("editBaseline", async ({ params }) => {
  await prisma.baselineItem.delete({ where: { id: idOf(params.itemId) } });
  return { ok: true };
});
