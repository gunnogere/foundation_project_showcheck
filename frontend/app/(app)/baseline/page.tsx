"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NewBaselineDialog, SlotDialog } from "@/components/baseline-dialogs";
import { NativeSelect } from "@/components/native-select";
import { StatusBadge } from "@/components/status-badge";
import { useAuth } from "@/components/auth-provider";
import { api } from "@/lib/api";
import { can } from "@/lib/permissions";
import { usePoll } from "@/lib/use-poll";
import type { Baseline, BaselineItem, CheckRun, Dashboard, Device } from "@/lib/types";

function Comparison({ item }: { item: BaselineItem }) {
  const live = (item.device?.params ?? {}) as Record<string, string>;
  const entries = Object.entries(item.expectedParams);
  if (entries.length === 0) return <span className="text-muted-foreground">-</span>;
  return (
    <div className="space-y-0.5 text-xs">
      {entries.map(([k, v]) => {
        const same = !!item.device && String(live[k]) === String(v);
        return (
          <div key={k} className={same ? "" : "text-red-400"}>
            {k}: {v}
            {item.device && !same && <span> → {live[k] ?? "missing"}</span>}
          </div>
        );
      })}
    </div>
  );
}

export default function BaselinePage() {
  const { user } = useAuth();
  const edit = can(user.role, "editBaseline");
  const { data: baselines, reload } = usePoll<Baseline[]>("/baselines", 5000);
  const { data: devices, reload: reloadDevices } = usePoll<Device[]>("/devices", 5000);
  const { data: dash, reload: reloadDash } = usePoll<Dashboard>("/dashboard", 5000);
  const { data: runs, reload: reloadRuns } = usePoll<CheckRun[]>("/checks", 0);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [slotOpen, setSlotOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<BaselineItem | null>(null);

  const baseline = baselines?.find((b) => b.id === selectedId) ?? baselines?.find((b) => b.active) ?? baselines?.[0];
  const statusOf = (itemId: number) => dash?.slots.find((s) => s.itemId === itemId)?.status;

  const refresh = () => { reload(); reloadDevices(); reloadDash(); };

  async function call(fn: () => Promise<unknown>, ok?: string) {
    try {
      await fn();
      if (ok) toast.success(ok);
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const runCheck = () =>
    call(async () => {
      await api("/checks", { method: "POST" });
      reloadRuns();
    }, "Pre-show check complete");

  if (!baselines || !devices) return <p className="text-muted-foreground">Loading...</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Baseline & Pre-Show Check</h1>
          <p className="text-sm text-muted-foreground">Approve a setup, map devices to it, then compare the live rig.</p>
        </div>
        <div className="flex gap-2">
          {edit && <Button variant="outline" onClick={() => setNewOpen(true)}>New baseline</Button>}
          {can(user.role, "runCheck") && baseline?.active && <Button onClick={runCheck}>Run pre-show check</Button>}
        </div>
      </div>

      {baselines.length === 0 && <p className="text-muted-foreground">No baselines yet.{edit && " Create one from your registered devices."}</p>}

      {baseline && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <NativeSelect className="w-64" value={baseline.id} onChange={(e) => setSelectedId(Number(e.target.value))}>
              {baselines.map((b) => <option key={b.id} value={b.id}>{b.name}{b.active ? " (active)" : ""}</option>)}
            </NativeSelect>
            {baseline.active ? <Badge>Active</Badge> : <Badge variant="outline">Inactive</Badge>}
            {baseline.venue && <span className="text-sm text-muted-foreground">{baseline.venue}</span>}
            {edit && (
              <div className="ml-auto flex gap-2">
                {!baseline.active && (
                  <Button size="sm" onClick={() => call(() => api(`/baselines/${baseline.id}`, { method: "PATCH", body: { active: true } }), "Baseline activated")}>
                    Set active
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => { setEditingItem(null); setSlotOpen(true); }}>Add slot</Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => confirm(`Delete "${baseline.name}"?`) && call(() => api(`/baselines/${baseline.id}`, { method: "DELETE" }))}
                >
                  Delete
                </Button>
              </div>
            )}
          </div>

          <Card>
            <CardHeader><CardTitle>Slots: baseline vs live</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Role</TableHead>
                    <TableHead>Mapped device</TableHead>
                    <TableHead>Expected → live</TableHead>
                    <TableHead>Level</TableHead>
                    {baseline.active && <TableHead>Status</TableHead>}
                    {edit && <TableHead />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {baseline.items.map((item) => {
                    const options = devices.filter((d) => d.type === item.type && (!d.baselineItem || d.baselineItem.id === item.id));
                    const st = statusOf(item.id);
                    return (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="font-medium">{item.label}</div>
                          <div className="text-xs text-muted-foreground">{item.type}</div>
                        </TableCell>
                        <TableCell>
                          {edit ? (
                            <NativeSelect
                              className="w-48"
                              value={item.deviceId ?? ""}
                              onChange={(e) =>
                                call(() => api(`/baselines/${baseline.id}/items/${item.id}`, { method: "PATCH", body: { deviceId: e.target.value ? Number(e.target.value) : null } }))
                              }
                            >
                              <option value="">Not mapped</option>
                              {options.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                            </NativeSelect>
                          ) : (
                            item.device?.name ?? "Not mapped"
                          )}
                        </TableCell>
                        <TableCell><Comparison item={item} /></TableCell>
                        <TableCell>{item.critical ? "Critical" : "Non-critical"}</TableCell>
                        {baseline.active && <TableCell>{st && <StatusBadge status={st} />}</TableCell>}
                        {edit && (
                          <TableCell className="space-x-1 text-right">
                            {item.deviceId && item.device?.source !== "MANUAL" && (
                              <Button
                                size="sm"
                                variant="outline"
                                title="Accept the device's current settings as the baseline"
                                onClick={() => call(() => api(`/baselines/${baseline.id}/items/${item.id}`, { method: "PATCH", body: { recapture: true } }), "Baseline updated from live")}
                              >
                                Recapture
                              </Button>
                            )}
                            <Button size="sm" variant="outline" onClick={() => { setEditingItem(item); setSlotOpen(true); }}>Edit</Button>
                            <Button size="sm" variant="ghost" onClick={() => call(() => api(`/baselines/${baseline.id}/items/${item.id}`, { method: "DELETE" }))}>Remove</Button>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <SlotDialog
            baselineId={baseline.id}
            item={editingItem}
            open={slotOpen}
            devices={devices}
            onClose={() => setSlotOpen(false)}
            onDone={refresh}
          />
        </>
      )}

      {runs && runs.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Check history</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Baseline</TableHead>
                  <TableHead>Run by</TableHead>
                  <TableHead>Pass</TableHead>
                  <TableHead>Warning</TableHead>
                  <TableHead>Fail</TableHead>
                  <TableHead>Unknown</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{new Date(r.createdAt).toLocaleString()}</TableCell>
                    <TableCell>{r.baseline.name}</TableCell>
                    <TableCell>{r.runBy.name}</TableCell>
                    <TableCell>{r.pass}</TableCell>
                    <TableCell>{r.warning}</TableCell>
                    <TableCell>{r.fail}</TableCell>
                    <TableCell>{r.unknown}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <NewBaselineDialog open={newOpen} onClose={() => setNewOpen(false)} onDone={refresh} />
    </div>
  );
}
