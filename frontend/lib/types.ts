export type Role = "ADMIN" | "TECH_DIRECTOR" | "OPERATOR" | "VIEWER";
export type DeviceType = "CAMERA" | "LIGHT" | "MICROPHONE" | "SWITCH" | "MIXER" | "PROJECTOR" | "PLAYBACK" | "OTHER";
export type CheckStatus = "PASS" | "WARNING" | "FAIL" | "UNKNOWN";
export type Severity = "INFO" | "WARNING" | "CRITICAL";
export type Params = Record<string, string>;

export const DEVICE_TYPES: DeviceType[] = ["CAMERA", "LIGHT", "MICROPHONE", "SWITCH", "MIXER", "PROJECTOR", "PLAYBACK", "OTHER"];

export type User = { id: number; name: string; email: string; role: Role; createdAt?: string };

export type Device = {
  id: number;
  name: string;
  type: DeviceType;
  source: "DISCOVERED" | "MANUAL";
  identifier: string;
  manufacturer: string | null;
  model: string | null;
  ipAddress: string | null;
  online: boolean;
  params: Params;
  lastSeen: string;
  baselineItem: { id: number; label: string; baselineId: number } | null;
};

export type DiscoveredDevice = {
  identifier: string;
  name: string;
  type: DeviceType;
  manufacturer: string;
  model: string;
  ipAddress: string;
  params: Params;
  registered: boolean;
};

export type BaselineItem = {
  id: number;
  baselineId: number;
  label: string;
  type: DeviceType;
  expectedParams: Params;
  critical: boolean;
  deviceId: number | null;
  device: Device | null;
};

export type Baseline = {
  id: number;
  name: string;
  venue: string | null;
  eventDate: string | null;
  active: boolean;
  items: BaselineItem[];
};

export type Slot = {
  itemId: number;
  label: string;
  type: DeviceType;
  critical: boolean;
  deviceId: number | null;
  deviceName: string | null;
  status: CheckStatus;
  details: string;
};

export type Incident = {
  id: number;
  title: string;
  description: string | null;
  severity: Severity;
  resolved: boolean;
  deviceId: number | null;
  createdAt: string;
  device: { name: string } | null;
  reportedBy?: { name: string };
};

export type Dashboard = {
  baseline: { id: number; name: string; venue: string | null } | null;
  slots: Slot[];
  counts: Record<CheckStatus, number>;
  deviceCount: number;
  openIncidents: Incident[];
  lastCheck: { id: number; createdAt: string; runBy: { name: string } } | null;
};

export type CheckRun = {
  id: number;
  createdAt: string;
  pass: number;
  warning: number;
  fail: number;
  unknown: number;
  runBy: { name: string };
  baseline: { name: string };
};

export type Connection = { id: number; fromDeviceId: number; toDeviceId: number; label: string | null };
