import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { getUser, type SessionUser } from "./auth";
import { can, type Permission } from "./rbac";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

type Ctx<P> = { req: NextRequest; user: SessionUser; params: P };

// Wraps a route: checks login + permission, turns thrown errors into JSON.
export function route<P = Record<string, never>>(
  permission: Permission | null,
  fn: (ctx: Ctx<P>) => Promise<unknown>
) {
  return async (req: NextRequest, ctx: { params: Promise<P> }) => {
    try {
      const user = await getUser(req);
      if (!user) throw new ApiError(401, "Not logged in");
      if (permission && !can(user.role, permission))
        throw new ApiError(403, "Your role is not allowed to do this");
      const result = await fn({ req, user, params: await ctx.params });
      return result instanceof Response ? result : NextResponse.json(result);
    } catch (e) {
      if (e instanceof ApiError)
        return NextResponse.json({ error: e.message }, { status: e.status });
      if (e instanceof ZodError)
        return NextResponse.json(
          { error: e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ") },
          { status: 400 }
        );
      console.error(e);
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
  };
}

export const idOf = (v: string) => {
  const n = Number(v);
  if (!Number.isInteger(n)) throw new ApiError(400, "Invalid id");
  return n;
};
