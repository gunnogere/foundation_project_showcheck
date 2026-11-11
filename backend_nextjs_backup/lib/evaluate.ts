import type { CheckStatus, Device } from "@prisma/client";

export type Evaluation = { status: CheckStatus; details: string };

type Slot = { critical: boolean; expectedParams: unknown };

// Pass / Warning / Fail / Unknown rules from the project deck.
export function evaluate(slot: Slot, device: Device | null): Evaluation {
  if (!device) return { status: "UNKNOWN", details: "No device mapped to this baseline slot" };
  if (!device.online) return { status: "FAIL", details: "Device is not responding" };
  if (device.source === "MANUAL")
    return { status: "UNKNOWN", details: "Analogue device - cannot be verified automatically" };

  const expected = (slot.expectedParams ?? {}) as Record<string, unknown>;
  const live = (device.params ?? {}) as Record<string, unknown>;
  const diffs = Object.entries(expected)
    .filter(([k, v]) => String(live[k]) !== String(v))
    .map(([k, v]) => `${k}: expected ${v}, found ${live[k] ?? "nothing"}`);

  if (diffs.length === 0) return { status: "PASS", details: "Matches baseline" };
  return { status: slot.critical ? "FAIL" : "WARNING", details: diffs.join("; ") };
}
