"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import type { User } from "@/lib/types";

const Ctx = createContext<{ user: User; logout: () => Promise<void> } | null>(null);

export const useAuth = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    api<User>("/auth/me")
      .then(setUser)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) router.replace("/login");
      });
  }, [router, pathname]);

  const logout = async () => {
    await api("/auth/logout", { method: "POST" });
    setUser(null);
    router.replace("/login");
  };

  if (!user) return <div className="p-8 text-muted-foreground">Loading...</div>;
  return <Ctx.Provider value={{ user, logout }}>{children}</Ctx.Provider>;
}
