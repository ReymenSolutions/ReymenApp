"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Plus, Power, PowerOff, UserCog } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { setUserActive } from "@/actions/admin/users";
import { AdminCreateUserDialog } from "@/components/admin/AdminCreateUserDialog";
import { AdminDeleteUserDialog } from "@/components/admin/AdminDeleteUserDialog";
import { AdminEditUserDialog } from "@/components/admin/AdminEditUserDialog";
import { usePreferences } from "@/context/preferences";
import { getErrorMessage, translateMessage } from "@/lib/user-error";

export interface DirectoryUser {
  id: string;
  name: string | null;
  email: string;
  role: string;
  isActive: boolean;
  organizationId: string | null;
  organizationName: string | null;
}

function ToggleActiveButton({ user, onToggled }: { user: DirectoryUser; onToggled: (id: string, isActive: boolean) => void }) {
  const { lang } = usePreferences();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const nextActive = !user.isActive;

  async function handleConfirm() {
    setLoading(true);
    try {
      await setUserActive(user.id, nextActive);
      onToggled(user.id, nextActive);
      toast.success(
        nextActive
          ? (lang === "es" ? "Usuario activado" : "User activated")
          : (lang === "es" ? "Usuario desactivado" : "User deactivated")
      );
      setOpen(false);
    } catch (e) {
      toast.error(getErrorMessage(e, "Error"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        className={`gap-1.5 ${user.isActive ? "text-slate-500 hover:text-red-600" : "text-slate-500 hover:text-emerald-600"}`}
      >
        {user.isActive ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
        {user.isActive ? (lang === "es" ? "Desactivar" : "Deactivate") : (lang === "es" ? "Activar" : "Activate")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {nextActive
                ? (lang === "es" ? "Activar usuario" : "Activate user")
                : (lang === "es" ? "Desactivar usuario" : "Deactivate user")}
            </DialogTitle>
          </DialogHeader>
          <p className="py-2 text-sm text-slate-600">
            {nextActive
              ? (lang === "es" ? `${user.name ?? user.email} podrá volver a acceder a la plataforma.` : `${user.name ?? user.email} will be able to sign in again.`)
              : (lang === "es" ? `${user.name ?? user.email} ya no podrá acceder a la plataforma.` : `${user.name ?? user.email} will no longer be able to sign in.`)}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
              {lang === "es" ? "Cancelar" : "Cancel"}
            </Button>
            <Button variant={nextActive ? "default" : "destructive"} onClick={handleConfirm} disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {nextActive ? (lang === "es" ? "Activar" : "Activate") : (lang === "es" ? "Desactivar" : "Deactivate")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function AdminUsersDirectory({ users: initialUsers, orgs }: { users: DirectoryUser[]; orgs: { id: string; name: string }[] }) {
  const { t, lang } = usePreferences();
  const [users, setUsers] = useState(initialUsers);

  // createUserAsAdmin() revalidates this same route, which makes Next.js
  // refetch the Server Component and pass fresh initialUsers down — but the
  // optimistic toggle above needs its own local copy, which otherwise
  // shadows that refresh forever. Re-sync whenever the server sends new data.
  useEffect(() => {
    setUsers(initialUsers);
  }, [initialUsers]);

  function handleToggled(id: string, isActive: boolean) {
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, isActive } : u)));
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <AdminCreateUserDialog orgs={orgs} />
      </div>

      {users.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <UserCog className="mx-auto h-10 w-10 text-slate-300 mb-3" />
            <p className="text-sm text-slate-500">{lang === "es" ? "Sin usuarios" : "No users"}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">{lang === "es" ? "Usuario" : "User"}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">{lang === "es" ? "Organización" : "Organization"}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">{lang === "es" ? "Rol" : "Role"}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">{t.colStatus}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{user.name ?? t.noName}</p>
                    <p className="text-xs text-slate-400">{user.email}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {user.organizationName ?? <span className="text-slate-400">{lang === "es" ? "Sin organización" : "No organization"}</span>}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="secondary" className="capitalize">{user.role.toLowerCase().replace("_", " ")}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={user.isActive ? "success" : "destructive"}>
                      {user.isActive ? t.statusActive : t.inactive}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <AdminEditUserDialog user={{ id: user.id, name: user.name, email: user.email, role: user.role, organizationId: user.organizationId }} orgs={orgs} />
                      <ToggleActiveButton user={user} onToggled={handleToggled} />
                      <AdminDeleteUserDialog user={user} onDeleted={(id) => setUsers((prev) => prev.filter((u) => u.id !== id))} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
