import { route } from "@/lib/api";

export const GET = route(null, async ({ user }) => user);
