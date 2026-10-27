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
import { DEVICE_TYPES, type BaselineItem, type Device, type DeviceType } from "@/lib/types";

export function NewBaselineDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState("");
  const [venue, setVenue] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [fromLive, setFromLive] = useState(true);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api("/baselines", { method: "POST", body: { name, venue, eventDate: eventDate || undefined, fromLive } });
      toast.success("Baseline created");
      setName("");
      setVenue("");
      onDone();
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New baseline</DialogTitle>
          <DialogDescription>The approved setup for a show.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Show name</Label>
            <Input required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Venue</Label>
              <Input value={venue} onChange={(e) => setVenue(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Event date</Label>
              <Input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={fromLive} onChange={(e) => setFromLive(e.target.checked)} />
            Capture current settings of all registered devices
          </label>
          <DialogFooter>
            <Button type="submit">Create</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type SlotProps = {
  baselineId: number;
  item: BaselineItem | null; // null = add
  open: boolean;
  devices: Device[];
  onClose: () => void;
  onDone: () => void;
};

export function SlotDialog({ baselineId, item, open, devices, onClose, onDone }: SlotProps) {
  const [label, setLabel] = useState("");
  const [type, setType] = useState<DeviceType>("MICROPHONE");
  const [critical, setCritical] = useState(true);
  const [params, setParams] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [seen, setSeen] = useState<string | null>(null);

  // Reset the form whenever the dialog opens for a different slot.
  const key = open ? `${item?.id ?? "new"}` : null;
  if (key !== seen) {
    setSeen(key);
    if (open) {
      setLabel(item?.label ?? "");
      setType(item?.type ?? "MICROPHONE");
      setCritical(item?.critical ?? true);
      setParams(formatParams(item?.expectedParams));
      setDeviceId(item?.deviceId ? String(item.deviceId) : "");
    }
  }

  const options = devices.filter((d) => d.type === type && (!d.baselineItem || d.baselineItem.id === item?.id));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const body = { label, critical, expectedParams: parseParams(params), deviceId: deviceId ? Number(deviceId) : null };
    try {
      if (item) await api(`/baselines/${baselineId}/items/${item.id}`, { method: "PATCH", body });
      else await api(`/baselines/${baselineId}/items`, { method: "POST", body: { ...body, type } });
      onDone();
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item ? "Edit slot" : "Add slot"}</DialogTitle>
          <DialogDescription>A role in the show, e.g. &quot;Main singer mic&quot;.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Role / label</Label>
            <Input required value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <NativeSelect value={type} disabled={!!item} onChange={(e) => { setType(e.target.value as DeviceType); setDeviceId(""); }}>
                {DEVICE_TYPES.map((t) => <option key={t}>{t}</option>)}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label>Mapped device</Label>
              <NativeSelect value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
                <option value="">None</option>
                {options.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </NativeSelect>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Expected settings (key=value per line)</Label>
            <Textarea rows={4} value={params} onChange={(e) => setParams(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={critical} onChange={(e) => setCritical(e.target.checked)} />
            Critical (a mismatch counts as Fail instead of Warning)
          </label>
          <DialogFooter>
            <Button type="submit">Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
