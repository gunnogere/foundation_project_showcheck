import { SignJWT, jwtVerify } from "jose";
import type { NextRequest } from "next/server";
import type { Role } from "@prisma/client";
import { prisma } from "./prisma";

export const COOKIE = "showcheck_token";
const secret = () => new TextEncoder().encode(process.env.JWT_SECRET);

export type SessionUser = { id: number; name: string; email: string; role: Role };

export const signToken = (userId: number) =>
  new SignJWT({ sub: String(userId) })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("8h")
    .sign(secret());

// Re-reads the user so role changes apply immediately.
export async function getUser(req: NextRequest): Promise<SessionUser | null> {
  const token = req.cookies.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    const user = await prisma.user.findUnique({
      where: { id: Number(payload.sub) },
      select: { id: true, name: true, email: true, role: true },
    });
    return user;
  } catch {
    return null;
  }
}
