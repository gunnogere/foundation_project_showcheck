import { prisma } from "@/lib/prisma";
import { idOf, route } from "@/lib/api";

export const DELETE = route<{ id: string }>("manageDevices", async ({ params }) => {
  await prisma.connection.delete({ where: { id: idOf(params.id) } });
  return { ok: true };
});
