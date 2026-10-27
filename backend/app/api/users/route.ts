import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ApiError, route } from "@/lib/api";

const select = { id: true, name: true, email: true, role: true, createdAt: true };

export const GET = route("manageUsers", () =>
  prisma.user.findMany({ select, orderBy: { id: "asc" } })
);

const body = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["ADMIN", "TECH_DIRECTOR", "OPERATOR", "VIEWER"]),
});

export const POST = route("manageUsers", async ({ req }) => {
  const data = body.parse(await req.json());
  const email = data.email.toLowerCase();
  if (await prisma.user.findUnique({ where: { email } }))
    throw new ApiError(409, "Email already registered");
  return prisma.user.create({
    data: { name: data.name, email, role: data.role, passwordHash: await bcrypt.hash(data.password, 10) },
    select,
  });
});
