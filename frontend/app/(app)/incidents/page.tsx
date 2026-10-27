"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NativeSelect } from "@/components/native-select";
import { SeverityBadge } from "@/components/status-badge";
import { useAuth } from "@/components/auth-provider";
import { api } from "@/lib/api";
import { can } from "@/lib/permissions";
import { usePoll } from "@/lib/use-poll";
import type { Device, Incident, Severity } from "@/lib/types";

const SEVERITIES: Severity[] = ["INFO", "WARNING", "CRITICAL"];

export default function IncidentsPage() {
  const { user } = useAuth();
  const { data: incidents, error, reload } = usePoll<Incident[]>("/incidents", 5000);
  const { data: devices } = usePoll<Device[]>("/devices", 0);
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", severity: "WARNING" as Severity, deviceId: "" });

  async function create(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api("/incidents", {
        method: "POST",
        body: { title: form.title, description: form.description || undefined, severity: form.severity, deviceId: form.deviceId ? Number(form.deviceId) : null },
      });
      toast.success("Incident logged");
      setForm({ title: "", description: "", severity: "WARNING", deviceId: "" });
      setOpen(false);
      reload();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function setResolved(i: Incident, resolved: boolean) {
    try {
      await api(`/incidents/${i.id}`, { method: "PATCH", body: { resolved } });
      reload();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const rows = incidents?.filter((i) => filter === "all" || !i.resolved) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Incident Log</h1>
          <p className="text-sm text-muted-foreground">Record events during the show for later investigation.</p>
        </div>
        <div className="flex gap-2">
          <NativeSelect className="w-32" value={filter} onChange={(e) => setFilter(e.target.value as "open" | "all")}>
            <option value="open">Open</option>
            <option value="all">All</option>
          </NativeSelect>
          {can(user.role, "logIncident") && <Button onClick={() => setOpen(true)}>Log incident</Button>}
        </div>
      </div>

      {error && <p className="text-red-400">{error}</p>}
      <Card>
        <CardContent className="pt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Severity</TableHead>
                <TableHead>Incident</TableHead>
                <TableHead>Device</TableHead>
                <TableHead>Reported</TableHead>
                <TableHead>Status</TableHead>
                {can(user.role, "resolveIncident") && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((i) => (
                <TableRow key={i.id} className={i.resolved ? "opacity-60" : ""}>
                  <TableCell><SeverityBadge severity={i.severity} /></TableCell>
                  <TableCell>
                    <div className="font-medium">{i.title}</div>
                    {i.description && <div className="text-xs text-muted-foreground">{i.description}</div>}
                  </TableCell>
                  <TableCell>{i.device?.name ?? "-"}</TableCell>
                  <TableCell className="text-xs">
                    {new Date(i.createdAt).toLocaleString()}
                    <div className="text-muted-foreground">{i.reportedBy?.name}</div>
                  </TableCell>
                  <TableCell>{i.resolved ? "Resolved" : "Open"}</TableCell>
                  {can(user.role, "resolveIncident") && (
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => setResolved(i, !i.resolved)}>
                        {i.resolved ? "Reopen" : "Resolve"}
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No incidents.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log incident</DialogTitle>
            <DialogDescription>What happened, and how serious is it?</DialogDescription>
          </DialogHeader>
          <form onSubmit={create} className="space-y-3">
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Severity</Label>
                <NativeSelect value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value as Severity })}>
                  {SEVERITIES.map((s) => <option key={s}>{s}</option>)}
                </NativeSelect>
              </div>
              <div className="space-y-1.5">
                <Label>Device (optional)</Label>
                <NativeSelect value={form.deviceId} onChange={(e) => setForm({ ...form, deviceId: e.target.value })}>
                  <option value="">None</option>
                  {devices?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </NativeSelect>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <DialogFooter>
              <Button type="submit">Log incident</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
