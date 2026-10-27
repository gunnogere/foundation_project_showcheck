"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, ClipboardCheck, LayoutDashboard, LogOut, Network, Radio, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth-provider";
import { can, ROLE_LABEL } from "@/lib/permissions";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/map", label: "Network Map", icon: Network },
  { href: "/baseline", label: "Baseline & Check", icon: ClipboardCheck },
  { href: "/devices", label: "Devices", icon: Radio },
  { href: "/incidents", label: "Incidents", icon: AlertTriangle },
];

export function Sidebar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const items = can(user.role, "manageUsers") ? [...NAV, { href: "/users", label: "Users", icon: Users }] : NAV;

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r bg-card p-4">
      <div className="mb-6 text-lg font-bold tracking-tight">
        Show<span className="text-sky-400">Check</span>
      </div>
      <nav className="flex flex-1 flex-col gap-1">
        {items.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground",
              (href === "/" ? pathname === "/" : pathname.startsWith(href)) && "bg-muted text-foreground"
            )}
          >
            <Icon className="size-4" /> {label}
          </Link>
        ))}
      </nav>
      <div className="border-t pt-3 text-sm">
        <div className="font-medium">{user.name}</div>
        <div className="mb-2 text-xs text-muted-foreground">{ROLE_LABEL[user.role]}</div>
        <Button variant="outline" size="sm" className="w-full" onClick={logout}>
          <LogOut className="size-4" /> Log out
        </Button>
      </div>
    </aside>
  );
}
