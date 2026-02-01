"use client";

import { useEffect, useMemo, useState } from "react";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";

type CompanyUser = {
  id: string;
  email: string;
  role: "ADMIN" | "ANALYST";
  createdAt: string;
};

type CreateUserPayload = {
  email: string;
  password: string;
  role: "ADMIN" | "ANALYST";
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<CreateUserPayload>({
    email: "",
    password: "",
    role: "ANALYST",
  });
  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" }),
    [],
  );

  const loadUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<CompanyUser[]>("/users");
      setUsers(data);
    } catch {
      setError("No se pudieron cargar los usuarios.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleRoleChange = async (id: string, role: CompanyUser["role"]) => {
    try {
      await apiPatch(`/users/${id}`, { role });
      setUsers((prev) => prev.map((user) => (user.id === id ? { ...user, role } : user)));
    } catch {
      setError("No se pudo actualizar el rol.");
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("¿Eliminar este usuario?")) return;
    try {
      await apiDelete(`/users/${id}`);
      setUsers((prev) => prev.filter((user) => user.id !== id));
    } catch {
      setError("No se pudo eliminar el usuario.");
    }
  };

  const handleCreate = async () => {
    if (!form.email || !form.password) {
      setError("Correo y contraseña son obligatorios.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      await apiPost("/auth/register", form);
      setForm({ email: "", password: "", role: "ANALYST" });
      await loadUsers();
    } catch {
      setError("No se pudo crear el usuario.");
    } finally {
      setCreating(false);
    }
  };

  const columns = useMemo<ColumnDef<CompanyUser>[]>(
    () => [
      { header: "Correo electrónico", accessorKey: "email" },
      {
        header: "Rol",
        accessorKey: "role",
        cell: ({ row }) => (
          <Badge className="bg-emerald-100 text-emerald-700">{row.original.role}</Badge>
        ),
      },
      {
        header: "Creado en",
        accessorKey: "createdAt",
        cell: ({ row }) => (
          <Badge className="bg-slate-100 text-slate-700">
            {dateFormatter.format(new Date(row.original.createdAt))}
          </Badge>
        ),
      },
      {
        header: "Acciones",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Button
              className="border border-slate-200 bg-white text-xs text-slate-700 hover:bg-slate-50"
              onClick={() => {
                const next = window.prompt(
                  "Nuevo rol (ADMIN o ANALYST):",
                  row.original.role,
                );
                if (!next) return;
                const normalized = next.toUpperCase();
                if (normalized !== "ADMIN" && normalized !== "ANALYST") {
                  setError("Rol inválido. Usa ADMIN o ANALYST.");
                  return;
                }
                handleRoleChange(row.original.id, normalized as CompanyUser["role"]);
              }}
            >
              Editar
            </Button>
            <Button
              className="border border-rose-200 bg-rose-50 text-xs text-rose-700 hover:bg-rose-100"
              onClick={() => handleDelete(row.original.id)}
            >
              Eliminar
            </Button>
          </div>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Usuarios de la Compañía</h2>
          <p className="text-sm text-slate-500">
            Gestiona los usuarios y permisos internos.
          </p>
        </div>
        <Button onClick={handleCreate} disabled={creating}>
          {creating ? "Creando..." : "+ Nuevo usuario"}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nuevo usuario</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-[2fr_2fr_1fr_auto]">
          <input
            value={form.email}
            onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
            placeholder="Correo"
            className="rounded-md border border-slate-200 px-3 py-2 text-sm"
          />
          <input
            type="password"
            value={form.password}
            onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
            placeholder="Contraseña temporal"
            className="rounded-md border border-slate-200 px-3 py-2 text-sm"
          />
          <select
            value={form.role}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, role: event.target.value as CreateUserPayload["role"] }))
            }
            className="rounded-md border border-slate-200 bg-white px-2 py-2 text-sm"
          >
            <option value="ADMIN">Admin</option>
            <option value="ANALYST">Analyst</option>
          </select>
          <Button onClick={handleCreate} disabled={creating}>
            {creating ? "Creando..." : "Crear"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Usuarios</CardTitle>
        </CardHeader>
        <CardContent>
          {error ? <div className="mb-3 text-sm text-rose-500">{error}</div> : null}
          {loading ? (
            <div className="text-sm text-slate-500">Cargando usuarios...</div>
          ) : (
            <DataTable columns={columns} data={users} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
