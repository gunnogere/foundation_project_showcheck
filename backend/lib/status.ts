import { prisma } from "./prisma";
import { evaluate } from "./evaluate";

// Evaluates the active baseline against the devices' current state.
export async function liveStatus() {
  const baseline = await prisma.baseline.findFirst({
    where: { active: true },
    include: { items: { orderBy: { id: "asc" }, include: { device: true } } },
  });
  if (!baseline) return null;

  const slots = baseline.items.map((item) => {
    const { status, details } = evaluate(item, item.device);
    return {
      itemId: item.id,
      label: item.label,
      type: item.type,
      critical: item.critical,
      deviceId: item.deviceId,
      deviceName: item.device?.name ?? null,
      status,
      details,
    };
  });

  const counts = { PASS: 0, WARNING: 0, FAIL: 0, UNKNOWN: 0 };
  slots.forEach((s) => counts[s.status]++);
  return { baseline: { id: baseline.id, name: baseline.name, venue: baseline.venue, eventDate: baseline.eventDate }, slots, counts };
}
