"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NativeSelect } from "@/components/native-select";
import { useAuth } from "@/components/auth-provider";
import { api } from "@/lib/api";
import { can, ROLE_LABEL } from "@/lib/permissions";
import { usePoll } from "@/lib/use-poll";
import type { Role, User } from "@/lib/types";

const ROLES = Object.keys(ROLE_LABEL) as Role[];

export default function UsersPage() {
  const { user } = useAuth();
  const { data: users, reload } = usePoll<User[]>("/users", 0);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "OPERATOR" as Role });

  if (!can(user.role, "manageUsers")) return <p className="text-red-400">Admins only.</p>;

  async function create(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api("/users", { method: "POST", body: form });
      toast.success("User created");
      setForm({ name: "", email: "", password: "", role: "OPERATOR" });
      reload();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function changeRole(u: User, role: Role) {
    try {
      await api(`/users/${u.id}`, { method: "PATCH", body: { role } });
      reload();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Users & Roles</h1>

      <Card>
        <CardHeader><CardTitle>Add user</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={create} className="grid items-end gap-3 md:grid-cols-5">
            <div className="space-y-1.5"><Label>Name</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Email</Label><Input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Password (8+)</Label><Input required minLength={8} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <NativeSelect value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
                {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </NativeSelect>
            </div>
            <Button type="submit">Add</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4">
          <Table>
            <TableHeader>
              <TableRow><TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Role</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {users?.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>{u.name}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>
                    <NativeSelect className="w-48" value={u.role} disabled={u.id === user.id} onChange={(e) => changeRole(u, e.target.value as Role)}>
                      {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                    </NativeSelect>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
