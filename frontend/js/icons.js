// Simple line icons (24x24). `deviceIcon` is for registered devices, `hostIcon` for scan results.
const PATHS = {
  phone: '<rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>',
  tablet: '<rect x="4" y="2" width="16" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>',
  laptop: '<path d="M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9m16 0H4m16 0 1.28 2.55a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45L4 16"/>',
  desktop: '<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>',
  camera: '<polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>',
  microphone: '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/>',
  light: '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>',
  mixer: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
  network: '<rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/>',
  projector: '<rect x="2" y="7" width="20" height="10" rx="2"/><circle cx="16" cy="12" r="2.5"/><line x1="6" y1="17" x2="6" y2="19"/><line x1="18" y1="17" x2="18" y2="19"/>',
  playback: '<circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/>',
  box: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>',
  headset: '<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>',
  speaker: '<rect x="4" y="2" width="16" height="20" rx="2"/><circle cx="12" cy="14" r="4"/><line x1="12" y1="6" x2="12.01" y2="6"/>',
};

const BY_TYPE = {
  CAMERA: "camera", LIGHT: "light", MICROPHONE: "microphone", SWITCH: "network",
  MIXER: "mixer", PROJECTOR: "projector", PLAYBACK: "playback", OTHER: "box",
};

const box = (name) =>
  `<span class="icon-box"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${PATHS[name]}</svg></span>`;

// Bluetooth devices carry a `kind` (headset, speaker, phone, laptop) from the scan.
const byKind = (kind) => (PATHS[kind] ? box(kind) : null);

export const deviceIcon = (device) => byKind(device.params?.kind) ?? box(BY_TYPE[device.type] ?? "box");

// Guesses phone/laptop/etc. from a scanned host's name. Unknown hosts get no icon.
export function hostIcon(host) {
  if (host.kind && byKind(host.kind)) return byKind(host.kind);
  if (host.adoptable) return deviceIcon(host);
  const n = host.name;
  if (/this computer/i.test(n)) return box("laptop");
  if (/ipad|tablet|\btab\b/i.test(n)) return box("tablet");
  if (/iphone|android|pixel|galaxy|phone|redmi|oneplus|huawei|tecno|infinix/i.test(n)) return box("phone");
  if (/macbook|laptop|yoga|thinkpad|notebook|book|mac\b/i.test(n)) return box("laptop");
  if (/desktop|\bpc\b|imac|workstation/i.test(n)) return box("desktop");
  return `<span class="icon-box empty"></span>`;
}
