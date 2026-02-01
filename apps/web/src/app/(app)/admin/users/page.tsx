"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";

type CompanyUser = {
  id: string;
  email: string;
  updatedBy: string;
  updatedAt: string;
  status: "Activo" | "Inactivo";
  lookerStatus: "Activo" | "Inactivo";
};

const demoUsers: CompanyUser[] = [
  {
    id: "user-1",
    email: "alejandro.maldonado@gsp.com.co",
    updatedBy: "alejandro.maldonado@gsp.com.co",
    updatedAt: "Mon, 03 Feb 2025 22:47:47 GMT",
    status: "Activo",
    lookerStatus: "Inactivo",
  },
];

export default function AdminUsersPage() {
  const columns = useMemo<ColumnDef<CompanyUser>[]>(
    () => [
      { header: "Correo electrónico", accessorKey: "email" },
      { header: "Modificado por", accessorKey: "updatedBy" },
      { header: "Modificado en", accessorKey: "updatedAt" },
      {
        header: "Estado",
        accessorKey: "status",
        cell: ({ row }) => (
          <Badge className="bg-emerald-100 text-emerald-700">{row.original.status}</Badge>
        ),
      },
      {
        header: "Status Looker",
        accessorKey: "lookerStatus",
        cell: ({ row }) => (
          <Badge className="bg-rose-100 text-rose-700">{row.original.lookerStatus}</Badge>
        ),
      },
      {
        header: "Acciones",
        cell: () => (
          <div className="flex items-center gap-2">
            <Button className="border border-slate-200 bg-white text-xs text-slate-700 hover:bg-slate-50">
              Editar
            </Button>
            <Button className="border border-rose-200 bg-rose-50 text-xs text-rose-700 hover:bg-rose-100">
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
        <Button>+ Nuevo usuario</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Usuarios</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable columns={columns} data={demoUsers} />
        </CardContent>
      </Card>
    </div>
  );
}
