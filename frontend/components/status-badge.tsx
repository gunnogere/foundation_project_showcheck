import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { CheckStatus, Severity } from "@/lib/types";

export const STATUS_STYLE: Record<CheckStatus, string> = {
  PASS: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  WARNING: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  FAIL: "bg-red-500/15 text-red-400 border-red-500/30",
  UNKNOWN: "bg-slate-500/15 text-slate-300 border-slate-500/30",
};

export const STATUS_COLOR: Record<CheckStatus, string> = {
  PASS: "#10b981",
  WARNING: "#f59e0b",
  FAIL: "#ef4444",
  UNKNOWN: "#94a3b8",
};

const SEVERITY_STYLE: Record<Severity, string> = {
  INFO: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  WARNING: STATUS_STYLE.WARNING,
  CRITICAL: STATUS_STYLE.FAIL,
};

export const StatusBadge = ({ status }: { status: CheckStatus }) => (
  <Badge variant="outline" className={cn("font-semibold", STATUS_STYLE[status])}>{status}</Badge>
);

export const SeverityBadge = ({ severity }: { severity: Severity }) => (
  <Badge variant="outline" className={cn("font-semibold", SEVERITY_STYLE[severity])}>{severity}</Badge>
);
