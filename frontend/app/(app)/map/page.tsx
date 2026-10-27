"use client";

import { useMemo, useState } from "react";
import { Background, Controls, ReactFlow, type Connection as FlowConnection, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge, STATUS_COLOR } from "@/components/status-badge";
import { useAuth } from "@/components/auth-provider";
import { api } from "@/lib/api";
import { can } from "@/lib/permissions";
import { usePoll } from "@/lib/use-poll";
import type { CheckStatus, Connection, Dashboard, Device, DeviceType } from "@/lib/types";

// Left-to-right signal flow: sources, network, audio hub, outputs.
const TIER: Record<DeviceType, number> = {
  PLAYBACK: 0, MICROPHONE: 0, SWITCH: 1, MIXER: 2, PROJECTOR: 3, LIGHT: 3, CAMERA: 3, OTHER: 3,
};

export default function MapPage() {
  const { user } = useAuth();
  const manage = can(user.role, "manageDevices");
  const { data: devices } = usePoll<Device[]>("/devices", 5000);
  const { data: connections, reload } = usePoll<Connection[]>("/connections", 5000);
  const { data: dash } = usePoll<Dashboard>("/dashboard", 5000);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const statusOf = useMemo(() => {
    const m = new Map<number, { status: CheckStatus; details: string; label: string }>();
    dash?.slots.forEach((s) => s.deviceId && m.set(s.deviceId, s));
    return m;
  }, [dash]);

  const nodes: Node[] = useMemo(() => {
    const rowCount: number[] = [];
    return (devices ?? []).map((d) => {
      const tier = TIER[d.type];
      const row = (rowCount[tier] = (rowCount[tier] ?? -1) + 1);
      const st = statusOf.get(d.id)?.status;
      const color = st ? STATUS_COLOR[st] : "#475569";
      return {
        id: String(d.id),
        position: { x: tier * 280, y: row * 100 },
        data: { label: (
          <div className="text-left text-xs">
            <div className="font-semibold">{d.name}</div>
            <div className="opacity-70">{d.type}{st ? ` · ${st}` : " · not in baseline"}</div>
          </div>
        ) },
        style: { border: `2px solid ${color}`, background: `${color}22`, color: "#e2e8f0", borderRadius: 8, width: 190, borderStyle: st ? "solid" : "dashed" },
      };
    });
  }, [devices, statusOf]);

  const edges: Edge[] = (connections ?? []).map((c) => ({
    id: String(c.id),
    source: String(c.fromDeviceId),
    target: String(c.toDeviceId),
    label: c.label ?? undefined,
    animated: true,
  }));

  async function onConnect(c: FlowConnection) {
    try {
      await api("/connections", { method: "POST", body: { fromDeviceId: Number(c.source), toDeviceId: Number(c.target) } });
      reload();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function onEdgeClick(_: unknown, edge: Edge) {
    if (!manage || !confirm("Remove this connection?")) return;
    await api(`/connections/${edge.id}`, { method: "DELETE" }).catch((e) => toast.error(e.message));
    reload();
  }

  const selected = devices?.find((d) => d.id === selectedId);
  const sel = selected && statusOf.get(selected.id);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Network Dependency Map</h1>
        <p className="text-sm text-muted-foreground">
          Node colour is the live check status.{manage && " Drag from one node's handle to another to add a connection; click a line to remove it."}
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-4">
        <div className="h-[70vh] rounded-lg border lg:col-span-3">
          <ReactFlow
            key={nodes.length}
            nodes={nodes}
            edges={edges}
            colorMode="dark"
            fitView
            nodesDraggable={false}
            nodesConnectable={manage}
            onConnect={onConnect}
            onEdgeClick={onEdgeClick}
            onNodeClick={(_, n) => setSelectedId(Number(n.id))}
            proOptions={{ hideAttribution: true }}
          >
            <Background />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
        <Card>
          <CardHeader><CardTitle>{selected ? selected.name : "Select a device"}</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {selected ? (
              <>
                {sel ? <StatusBadge status={sel.status} /> : <span className="text-muted-foreground">Not in the active baseline</span>}
                {sel && <p className="text-muted-foreground">{sel.label}: {sel.details}</p>}
                <p>Type: {selected.type}</p>
                <p>Online: {selected.source === "MANUAL" ? "n/a (analogue)" : selected.online ? "Yes" : "No"}</p>
                {selected.ipAddress && <p>IP: {selected.ipAddress}</p>}
                <div className="rounded-md border p-2 text-xs">
                  {Object.entries(selected.params).map(([k, v]) => <div key={k}>{k}: {v}</div>)}
                  {Object.keys(selected.params).length === 0 && "No settings"}
                </div>
              </>
            ) : (
              <p className="text-muted-foreground">Click a node to see its status.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
