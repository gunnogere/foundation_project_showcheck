"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EditDeviceDialog, RegisterDeviceDialog } from "@/components/device-dialogs";
import { useAuth } from "@/components/auth-provider";
import { api } from "@/lib/api";
import { can } from "@/lib/permissions";
import { usePoll } from "@/lib/use-poll";
import type { Device } from "@/lib/types";

export default function DevicesPage() {
  const { user } = useAuth();
  const { data: devices, error, reload } = usePoll<Device[]>("/devices", 5000);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [editing, setEditing] = useState<Device | null>(null);
  const manage = can(user.role, "manageDevices");

  async function remove(d: Device) {
    if (!confirm(`Remove ${d.name}?`)) return;
    try {
      await api(`/devices/${d.id}`, { method: "DELETE" });
      reload();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Devices</h1>
          <p className="text-sm text-muted-foreground">Discovered and manually registered gear.</p>
        </div>
        {manage && <Button onClick={() => setRegisterOpen(true)}>Register devices</Button>}
      </div>

      {error && <p className="text-red-400">{error}</p>}
      <Card>
        <CardContent className="pt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>Online</TableHead>
                <TableHead>Baseline slot</TableHead>
                {manage && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {devices?.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>
                    <div className="font-medium">{d.name}</div>
                    <div className="text-xs text-muted-foreground">{[d.manufacturer, d.model].filter(Boolean).join(" ")}</div>
                  </TableCell>
                  <TableCell>{d.type}</TableCell>
                  <TableCell><Badge variant="outline">{d.source === "MANUAL" ? "Analogue" : "Discovered"}</Badge></TableCell>
                  <TableCell>{d.ipAddress ?? "-"}</TableCell>
                  <TableCell>{d.source === "MANUAL" ? "-" : d.online ? "Yes" : <span className="text-red-400">No</span>}</TableCell>
                  <TableCell>{d.baselineItem?.label ?? <span className="text-muted-foreground">Not mapped</span>}</TableCell>
                  {manage && (
                    <TableCell className="space-x-2 text-right">
                      <Button size="sm" variant="outline" onClick={() => setEditing(d)}>Edit</Button>
                      <Button size="sm" variant="ghost" onClick={() => remove(d)}>Remove</Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <RegisterDeviceDialog open={registerOpen} onClose={() => setRegisterOpen(false)} onDone={reload} />
      <EditDeviceDialog device={editing} onClose={() => setEditing(null)} onDone={reload} />
    </div>
  );
}
