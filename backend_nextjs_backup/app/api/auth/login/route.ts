import { NextResponse, type NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { COOKIE, signToken } from "@/lib/auth";

const body = z.object({ email: z.string().email(), password: z.string().min(1) });

export async function POST(req: NextRequest) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Email and password required" }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  const ok = user && (await bcrypt.compare(parsed.data.password, user.passwordHash));
  if (!user || !ok) return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });

  const res = NextResponse.json({ id: user.id, name: user.name, email: user.email, role: user.role });
  res.cookies.set(COOKIE, await signToken(user.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  return res;
}
