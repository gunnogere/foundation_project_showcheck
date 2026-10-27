import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { idOf, route } from "@/lib/api";

// Also used to simulate faults (offline / changed settings) while demoing.
const body = z.object({
  name: z.string().min(1).optional(),
  online: z.boolean().optional(),
  params: z.record(z.string(), z.string()).optional(),
});

export const PATCH = route<{ id: string }>("manageDevices", async ({ req, params }) => {
  const { params: p, ...rest } = body.parse(await req.json());
  return prisma.device.update({
    where: { id: idOf(params.id) },
    data: { ...rest, ...(p && { params: p as Prisma.InputJsonValue }), lastSeen: new Date() },
  });
});

export const DELETE = route<{ id: string }>("manageDevices", async ({ params }) => {
  await prisma.device.delete({ where: { id: idOf(params.id) } });
  return { ok: true };
});
