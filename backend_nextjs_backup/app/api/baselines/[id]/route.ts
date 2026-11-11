import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { idOf, route } from "@/lib/api";

const body = z.object({
  name: z.string().min(1).optional(),
  venue: z.string().nullable().optional(),
  eventDate: z.string().nullable().optional(),
  active: z.boolean().optional(),
});

export const PATCH = route<{ id: string }>("editBaseline", async ({ req, params }) => {
  const id = idOf(params.id);
  const { eventDate, active, ...rest } = body.parse(await req.json());
  return prisma.$transaction(async (tx) => {
    // Only one baseline is active at a time.
    if (active) await tx.baseline.updateMany({ data: { active: false } });
    return tx.baseline.update({
      where: { id },
      data: {
        ...rest,
        ...(active !== undefined && { active }),
        ...(eventDate !== undefined && { eventDate: eventDate ? new Date(eventDate) : null }),
      },
    });
  });
});

export const DELETE = route<{ id: string }>("editBaseline", async ({ params }) => {
  await prisma.baseline.delete({ where: { id: idOf(params.id) } });
  return { ok: true };
});
