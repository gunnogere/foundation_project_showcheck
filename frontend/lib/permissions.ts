import type { Role } from "./types";

// Mirrors backend/lib/rbac.ts. Only hides buttons; the API enforces it.
const PERMISSIONS = {
  manageUsers: ["ADMIN"],
  editBaseline: ["ADMIN", "TECH_DIRECTOR"],
  manageDevices: ["ADMIN", "TECH_DIRECTOR"],
  runCheck: ["ADMIN", "TECH_DIRECTOR", "OPERATOR"],
  logIncident: ["ADMIN", "TECH_DIRECTOR", "OPERATOR"],
  resolveIncident: ["ADMIN", "TECH_DIRECTOR"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export const can = (role: Role | undefined, p: Permission) =>
  !!role && (PERMISSIONS[p] as readonly Role[]).includes(role);

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Admin",
  TECH_DIRECTOR: "Technical Director",
  OPERATOR: "Operator",
  VIEWER: "Viewer",
};
