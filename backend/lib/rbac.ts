import type { Role } from "@prisma/client";

// Who may do what. Everyone logged in can read.
export const PERMISSIONS = {
  manageUsers: ["ADMIN"],
  editBaseline: ["ADMIN", "TECH_DIRECTOR"],
  manageDevices: ["ADMIN", "TECH_DIRECTOR"],
  runCheck: ["ADMIN", "TECH_DIRECTOR", "OPERATOR"],
  logIncident: ["ADMIN", "TECH_DIRECTOR", "OPERATOR"],
  resolveIncident: ["ADMIN", "TECH_DIRECTOR"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export const can = (role: Role, p: Permission) =>
  (PERMISSIONS[p] as readonly Role[]).includes(role);
