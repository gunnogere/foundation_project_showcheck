import { NextResponse, type NextRequest } from "next/server";

// The plain HTML/JS frontend runs on another port, so the API must allow it (with cookies).
const ALLOWED = (process.env.FRONTEND_ORIGIN ?? "http://localhost:3001").split(",").map((s) => s.trim());

export function proxy(req: NextRequest) {
  const origin = req.headers.get("origin") ?? "";
  const headers: Record<string, string> = { Vary: "Origin" };
  if (ALLOWED.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
    headers["Access-Control-Allow-Methods"] = "GET,POST,PATCH,DELETE,OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type";
  }

  if (req.method === "OPTIONS") return new NextResponse(null, { status: 204, headers });
  const res = NextResponse.next();
  Object.entries(headers).forEach(([k, v]) => res.headers.set(k, v));
  return res;
}

export const config = { matcher: "/api/:path*" };
