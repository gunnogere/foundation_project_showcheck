import { PrismaClient, type Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { SIMULATED_NETWORK } from "../lib/discovery";

const prisma = new PrismaClient();
const json = (v: unknown) => v as Prisma.InputJsonValue;

async function main() {
  const hash = await bcrypt.hash("password123", 10);
  const users = [
    ["Alice Admin", "admin@showcheck.test", "ADMIN"],
    ["Tom Director", "td@showcheck.test", "TECH_DIRECTOR"],
    ["Olivia Operator", "operator@showcheck.test", "OPERATOR"],
    ["Victor Viewer", "viewer@showcheck.test", "VIEWER"],
  ] as const;
  for (const [name, email, role] of users)
    await prisma.user.upsert({ where: { email }, update: {}, create: { name, email, role, passwordHash: hash } });

  if ((await prisma.baseline.count()) > 0) return console.log("Demo data already present, users ensured.");

  // Leave Lapel Mic C and Camera FOH unregistered so there is something to discover.
  const skip = new Set(["SENN-EWD-C", "BMD-CAM-2"]);
  const dev: Record<string, number> = {};
  for (const d of SIMULATED_NETWORK.filter((d) => !skip.has(d.identifier))) {
    const row = await prisma.device.create({
      data: { ...d, params: json(d.params), source: "DISCOVERED" },
    });
    dev[d.identifier] = row.id;
  }
  const monitor = await prisma.device.create({
    data: { name: "Analogue Stage Monitor", type: "OTHER", source: "MANUAL", identifier: "MANUAL-MONITOR-1", params: {} },
  });

  const baseline = await prisma.baseline.create({
    data: { name: "Kigali Gala Night", venue: "Convention Centre", active: true },
  });
  const slot = (label: string, id: string, critical = true) => {
    const d = SIMULATED_NETWORK.find((x) => x.identifier === id)!;
    return { baselineId: baseline.id, label, type: d.type, expectedParams: json(d.params), critical, deviceId: dev[id] };
  };
  await prisma.baselineItem.createMany({
    data: [
      slot("Main Singer Mic", "SHURE-ULXD2-A"),
      slot("Backup Artist A Mic", "SHURE-ULXD2-B"),
      slot("Stage Left Camera", "SONY-PTZ-1"),
      slot("Moving Head 1", "DMX-MH-1"),
      slot("Truss LED Bar", "DMX-BAR-2"),
      slot("Core Switch", "NET-SW-1"),
      slot("FOH Mixer", "MIX-X32"),
      slot("Playback", "PLAY-LAPTOP"),
      slot("Main Projector", "PROJ-EPSON", false),
      { baselineId: baseline.id, label: "Stage Monitor", type: "OTHER", expectedParams: {}, critical: false, deviceId: monitor.id },
    ],
  });

  const links: [string, string][] = [
    ["PLAY-LAPTOP", "NET-SW-1"], ["NET-SW-1", "MIX-X32"], ["NET-SW-1", "PROJ-EPSON"],
    ["NET-SW-1", "SONY-PTZ-1"], ["NET-SW-1", "DMX-MH-1"], ["NET-SW-1", "DMX-BAR-2"],
    ["SHURE-ULXD2-A", "MIX-X32"], ["SHURE-ULXD2-B", "MIX-X32"],
  ];
  await prisma.connection.createMany({ data: links.map(([a, b]) => ({ fromDeviceId: dev[a], toDeviceId: dev[b] })) });
  await prisma.connection.create({ data: { fromDeviceId: dev["MIX-X32"], toDeviceId: monitor.id, label: "XLR" } });

  // Planted faults so the demo shows Warning and Fail.
  await prisma.device.update({ where: { id: dev["PROJ-EPSON"] }, data: { params: { input: "HDMI 2" } } });
  await prisma.device.update({ where: { id: dev["DMX-BAR-2"] }, data: { online: false } });
  console.log("Seeded demo data.");
}

main().finally(() => prisma.$disconnect());
