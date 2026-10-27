"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/native-select";
import { api } from "@/lib/api";
import { formatParams, parseParams } from "@/lib/params";
import { DEVICE_TYPES, type Device, type DeviceType, type DiscoveredDevice } from "@/lib/types";
import { cn } from "@/lib/utils";

export function RegisterDeviceDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [tab, setTab] = useState<"auto" | "manual">("auto");
  const [found, setFound] = useState<DiscoveredDevice[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", type: "OTHER" as DeviceType, manufacturer: "", model: "", params: "" });

  async function scan() {
    setScanning(true);
    try {
      setFound(await api<DiscoveredDevice[]>("/discovery/scan", { method: "POST" }));
      setPicked(new Set());
    } catch (e) {
      toast.error((e as Error).message);
    }
    setScanning(false);
  }

  async function registerPicked() {
    setBusy(true);
    try {
      for (const d of found!.filter((d) => picked.has(d.identifier)))
        await api("/devices", { method: "POST", body: { ...d, source: "DISCOVERED" } });
      toast.success(`${picked.size} device(s) registered`);
      onDone();
      close();
    } catch (e) {
      toast.error((e as Error).message);
    }
    setBusy(false);
  }

  async function registerManual(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/devices", {
        method: "POST",
        body: {
          name: form.name,
          type: form.type,
          source: "MANUAL",
          manufacturer: form.manufacturer || undefined,
          model: form.model || undefined,
          params: parseParams(form.params),
        },
      });
      toast.success("Analogue device registered");
      onDone();
      close();
    } catch (err) {
      toast.error((err as Error).message);
    }
    setBusy(false);
  }

  function close() {
    setFound(null);
    setForm({ name: "", type: "OTHER", manufacturer: "", model: "", params: "" });
    onClose();
  }

  const tabBtn = (t: "auto" | "manual", label: string) => (
    <button
      type="button"
      onClick={() => setTab(t)}
      className={cn("flex-1 rounded-md px-3 py-1.5 text-sm", tab === t ? "bg-muted font-medium" : "text-muted-foreground")}
    >
      {label}
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Register devices</DialogTitle>
          <DialogDescription>Scan the network, or add analogue gear by hand.</DialogDescription>
        </DialogHeader>
        <div className="flex gap-1 rounded-lg border p-1">
          {tabBtn("auto", "Auto-discovery")}
          {tabBtn("manual", "Manual / Analogue")}
        </div>

        {tab === "auto" ? (
          <div className="space-y-3">
            <Button variant="outline" onClick={scan} disabled={scanning}>
              {scanning ? "Scanning..." : found ? "Scan again" : "Scan network"}
            </Button>
            {found && (
              <ul className="max-h-64 space-y-1 overflow-y-auto">
                {found.map((d) => (
                  <li key={d.identifier}>
                    <label className={cn("flex items-center gap-3 rounded-md border p-2 text-sm", d.registered && "opacity-50")}>
                      <input
                        type="checkbox"
                        disabled={d.registered}
                        checked={picked.has(d.identifier)}
                        onChange={(e) => {
                          const next = new Set(picked);
                          if (e.target.checked) next.add(d.identifier);
                          else next.delete(d.identifier);
                          setPicked(next);
                        }}
                      />
                      <span className="flex-1">
                        <span className="font-medium">{d.name}</span>
                        <span className="block text-xs text-muted-foreground">
                          {d.type} · {d.manufacturer} {d.model} · {d.ipAddress}
                        </span>
                      </span>
                      {d.registered && <span className="text-xs">Registered</span>}
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <DialogFooter>
              <Button onClick={registerPicked} disabled={busy || picked.size === 0}>
                Register selected ({picked.size})
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={registerManual} className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Stage monitor wedge" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <NativeSelect value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as DeviceType })}>
                  {DEVICE_TYPES.map((t) => <option key={t}>{t}</option>)}
                </NativeSelect>
              </div>
              <div className="space-y-1.5">
                <Label>Manufacturer</Label>
                <Input value={form.manufacturer} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Model</Label>
                <Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Settings (one key=value per line)</Label>
              <Textarea rows={3} value={form.params} onChange={(e) => setForm({ ...form, params: e.target.value })} placeholder={"gain=+10 dB\nconnector=XLR"} />
            </div>
            <p className="text-xs text-muted-foreground">Analogue devices cannot be verified automatically, so they show as Unknown in checks.</p>
            <DialogFooter>
              <Button type="submit" disabled={busy}>Register device</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Lets Admin/TD change live state; handy for simulating faults in a demo.
export function EditDeviceDialog({ device, onClose, onDone }: { device: Device | null; onClose: () => void; onDone: () => void }) {
  const [online, setOnline] = useState(true);
  const [params, setParams] = useState("");
  const [lastId, setLastId] = useState<number | null>(null);

  const currentId = device?.id ?? null;
  if (currentId !== lastId) {
    setLastId(currentId);
    if (device) {
      setOnline(device.online);
      setParams(formatParams(device.params));
    }
  }

  async function save() {
    try {
      await api(`/devices/${device!.id}`, { method: "PATCH", body: { online, params: parseParams(params) } });
      toast.success("Device updated");
      onDone();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <Dialog open={!!device} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{device?.name}</DialogTitle>
          <DialogDescription>Simulated live state. Change it to test how checks react.</DialogDescription>
        </DialogHeader>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={online} onChange={(e) => setOnline(e.target.checked)} /> Device is online
        </label>
        <div className="space-y-1.5">
          <Label>Live settings</Label>
          <Textarea rows={5} value={params} onChange={(e) => setParams(e.target.value)} />
        </div>
        <DialogFooter>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
