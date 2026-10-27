import type { DeviceType } from "@prisma/client";

export type DiscoveredDevice = {
  identifier: string;
  name: string;
  type: DeviceType;
  manufacturer: string;
  model: string;
  ipAddress: string;
  params: Record<string, string>;
};

// Simulated network scan. Replace with real protocol adapters (Shure, NMOS, Art-Net...) later.
export const SIMULATED_NETWORK: DiscoveredDevice[] = [
  { identifier: "SHURE-ULXD2-A", name: "Handheld Mic A", type: "MICROPHONE", manufacturer: "Shure", model: "ULXD2", ipAddress: "192.168.10.21", params: { frequency: "584.250 MHz", channel: "A1", gain: "+10 dB" } },
  { identifier: "SHURE-ULXD2-B", name: "Handheld Mic B", type: "MICROPHONE", manufacturer: "Shure", model: "ULXD2", ipAddress: "192.168.10.22", params: { frequency: "586.500 MHz", channel: "A2", gain: "+10 dB" } },
  { identifier: "SENN-EWD-C", name: "Lapel Mic C", type: "MICROPHONE", manufacturer: "Sennheiser", model: "EW-D", ipAddress: "192.168.10.23", params: { frequency: "606.100 MHz", channel: "B1", gain: "+6 dB" } },
  { identifier: "SONY-PTZ-1", name: "PTZ Camera Stage Left", type: "CAMERA", manufacturer: "Sony", model: "SRG-X400", ipAddress: "192.168.10.31", params: { input: "HDMI 1", resolution: "1080p60" } },
  { identifier: "BMD-CAM-2", name: "Camera FOH", type: "CAMERA", manufacturer: "Blackmagic", model: "Studio 6K", ipAddress: "192.168.10.32", params: { input: "SDI 1", resolution: "1080p50" } },
  { identifier: "DMX-MH-1", name: "Moving Head 1", type: "LIGHT", manufacturer: "Chauvet", model: "Rogue R2", ipAddress: "192.168.10.41", params: { dmxAddress: "101", mode: "16ch" } },
  { identifier: "DMX-BAR-2", name: "LED Bar Truss", type: "LIGHT", manufacturer: "Chauvet", model: "Colorband", ipAddress: "192.168.10.42", params: { dmxAddress: "201", mode: "8ch" } },
  { identifier: "NET-SW-1", name: "Core Switch", type: "SWITCH", manufacturer: "Cisco", model: "SG350", ipAddress: "192.168.10.1", params: { vlan: "10" } },
  { identifier: "MIX-X32", name: "Digital Mixer", type: "MIXER", manufacturer: "Behringer", model: "X32", ipAddress: "192.168.10.11", params: { sampleRate: "48 kHz" } },
  { identifier: "PLAY-LAPTOP", name: "Playback Laptop", type: "PLAYBACK", manufacturer: "Apple", model: "MacBook Pro", ipAddress: "192.168.10.12", params: { app: "QLab", session: "Show v3" } },
  { identifier: "PROJ-EPSON", name: "Main Projector", type: "PROJECTOR", manufacturer: "Epson", model: "EB-L1000", ipAddress: "192.168.10.51", params: { input: "HDMI 1" } },
];
