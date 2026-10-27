"use client";

import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SeverityBadge, StatusBadge, STATUS_STYLE } from "@/components/status-badge";
import { useAuth } from "@/components/auth-provider";
import { api } from "@/lib/api";
import { can } from "@/lib/permissions";
import { usePoll } from "@/lib/use-poll";
import type { CheckStatus, Dashboard } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATS: { key: CheckStatus; label: string }[] = [
  { key: "PASS", label: "Pass" },
  { key: "WARNING", label: "Warning" },
  { key: "FAIL", label: "Fail" },
  { key: "UNKNOWN", label: "Unknown" },
];

export default function DashboardPage() {
  const { user } = useAuth();
  const { data, error, reload } = usePoll<Dashboard>("/dashboard", 5000);

  async function runCheck() {
    try {
      await api("/checks", { method: "POST" });
      toast.success("Pre-show check complete");
      reload();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (error && !data) return <p className="text-red-400">{error}</p>;
  if (!data) return <p className="text-muted-foreground">Loading...</p>;

  const alerts = data.slots.filter((s) => s.status !== "PASS");
  const ready = data.baseline && alerts.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Executive Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            {data.baseline ? `${data.baseline.name}${data.baseline.venue ? ` - ${data.baseline.venue}` : ""}` : "No active baseline"}
            {" "}· live, refreshes every 5s
          </p>
        </div>
        {can(user.role, "runCheck") && <Button onClick={runCheck}>Run pre-show check</Button>}
      </div>

      {!data.baseline && (
        <Card>
          <CardContent className="pt-4 text-sm">
            No baseline is active yet.{" "}
            <Link href="/baseline" className="text-sky-400 underline">Set one up</Link>.
          </CardContent>
        </Card>
      )}

      {data.baseline && (
        <div className={cn("rounded-lg border p-4 font-semibold", ready ? STATUS_STYLE.PASS : data.counts.FAIL ? STATUS_STYLE.FAIL : STATUS_STYLE.WARNING)}>
          {ready
            ? "All checked properties match the baseline."
            : `${alerts.length} item${alerts.length === 1 ? "" : "s"} need attention before showtime.`}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {STATS.map(({ key, label }) => (
          <Card key={key} className={cn("border", STATUS_STYLE[key])}>
            <CardContent className="pt-4">
              <div className="text-4xl font-bold">{data.counts[key]}</div>
              <div className="text-sm">{label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Health alerts</CardTitle></CardHeader>
          <CardContent>
            {alerts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No alerts.</p>
            ) : (
              <ul className="space-y-2">
                {alerts.map((s) => (
                  <li key={s.itemId} className="flex items-start gap-3 rounded-md border p-3">
                    <StatusBadge status={s.status} />
                    <div className="text-sm">
                      <div className="font-medium">{s.label}</div>
                      <div className="text-muted-foreground">{s.details}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Open incidents</CardTitle></CardHeader>
          <CardContent>
            {data.openIncidents.length === 0 ? (
              <p className="text-sm text-muted-foreground">None open.</p>
            ) : (
              <ul className="space-y-2">
                {data.openIncidents.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-2 text-sm">
                    <span>{i.title}</span>
                    <SeverityBadge severity={i.severity} />
                  </li>
                ))}
              </ul>
            )}
            <Link href="/incidents" className="mt-3 block text-sm text-sky-400 underline">View all</Link>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            Devices {data.lastCheck && <span className="text-sm font-normal text-muted-foreground">· last check by {data.lastCheck.runBy.name} at {new Date(data.lastCheck.createdAt).toLocaleTimeString()}</span>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Role</TableHead>
                <TableHead>Device</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.slots.map((s) => (
                <TableRow key={s.itemId}>
                  <TableCell className="font-medium">{s.label}</TableCell>
                  <TableCell>{s.deviceName ?? "-"}</TableCell>
                  <TableCell>{s.type}</TableCell>
                  <TableCell><StatusBadge status={s.status} /></TableCell>
                  <TableCell className="text-muted-foreground">{s.details}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
