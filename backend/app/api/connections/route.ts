import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ApiError, route } from "@/lib/api";

export const GET = route(null, () => prisma.connection.findMany());

const body = z.object({
  fromDeviceId: z.number().int(),
  toDeviceId: z.number().int(),
  label: z.string().optional(),
});

export const POST = route("manageDevices", async ({ req }) => {
  const d = body.parse(await req.json());
  if (d.fromDeviceId === d.toDeviceId) throw new ApiError(400, "A device cannot connect to itself");
  const exists = await prisma.connection.findFirst({
    where: { fromDeviceId: d.fromDeviceId, toDeviceId: d.toDeviceId },
  });
  if (exists) throw new ApiError(409, "Connection already exists");
  return prisma.connection.create({ data: d });
});
