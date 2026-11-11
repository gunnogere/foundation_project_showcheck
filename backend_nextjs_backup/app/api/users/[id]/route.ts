import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ApiError, idOf, route } from "@/lib/api";

const body = z.object({ role: z.enum(["ADMIN", "TECH_DIRECTOR", "OPERATOR", "VIEWER"]) });

export const PATCH = route<{ id: string }>("manageUsers", async ({ req, user, params }) => {
  const id = idOf(params.id);
  if (id === user.id) throw new ApiError(400, "You cannot change your own role");
  const { role } = body.parse(await req.json());
  return prisma.user.update({
    where: { id },
    data: { role },
    select: { id: true, name: true, email: true, role: true },
  });
});
