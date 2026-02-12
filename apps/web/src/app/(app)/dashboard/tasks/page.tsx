"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { apiGet } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/data-table";
import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { formatCop, formatDateLocal } from "@/lib/utils";

type CustomerRow = {
  id: string;
  nit: string;
  name: string;
  totalSales: number;
  totalInvoices?: number;
};

type CustomerTask = {
  id: string;
  nit: string;
  name: string;
  totalSales: number;
  changePercent: number;
  actionLabel: string;
};

export default function DashboardTasksPage() {
  const searchParams = useSearchParams();
  const [tasks, setTasks] = useState<CustomerTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalSales, setTotalSales] = useState(0);

  const compareRange = useMemo(() => {
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const compareFrom = searchParams.get("compareFrom");
    const compareTo = searchParams.get("compareTo");
    if (compareFrom && compareTo) {
      return { compareFrom, compareTo };
    }
    if (!from || !to) return { compareFrom: undefined as string | undefined, compareTo: undefined as string | undefined };
    const fromDate = new Date(from);
    const toDate = new Date(to);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      return { compareFrom: undefined, compareTo: undefined };
    }
    const diff = toDate.getTime() - fromDate.getTime();
    const prevTo = new Date(fromDate.getTime());
    const prevFrom = new Date(fromDate.getTime() - diff);
    return {
      compareFrom: prevFrom.toISOString().slice(0, 10),
      compareTo: prevTo.toISOString().slice(0, 10),
    };
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        const from = searchParams.get("from");
        const to = searchParams.get("to");
        const vendor = searchParams.get("vendor");
        const brand = searchParams.get("brand");
        const classFilter = searchParams.get("class");
        if (from) params.set("from", from);
        if (to) params.set("to", to);
        if (vendor) params.set("vendor", vendor);
        if (brand) params.set("brand", brand);
        if (classFilter) params.set("class", classFilter);
        params.set("limit", "10000");

        const [summaryRes, current] = await Promise.all([
          apiGet<{ current: { totalSales: number } }>(`/dashboard/summary?${params.toString()}`).catch(() => ({ current: { totalSales: 0 } })),
          apiGet<CustomerRow[]>(`/customers?${params.toString()}`),
        ]);

        if (cancelled) return;
        const total = summaryRes?.current?.totalSales ?? 0;
        setTotalSales(total);

        const compareParams = new URLSearchParams();
        if (compareRange.compareFrom) compareParams.set("from", compareRange.compareFrom);
        if (compareRange.compareTo) compareParams.set("to", compareRange.compareTo);
        if (vendor) compareParams.set("vendor", vendor);
        if (brand) compareParams.set("brand", brand);
        if (classFilter) compareParams.set("class", classFilter);
        compareParams.set("limit", "10000");

        const compare =
          compareRange.compareFrom && compareRange.compareTo
            ? await apiGet<CustomerRow[]>(`/customers?${compareParams.toString()}`)
            : [];
        if (cancelled) return;

        const compareMap = new Map(compare.map((row) => [row.id, row.totalSales]));
        const actionFor = (change: number, prev: number, curr: number) => {
          if (curr === 0 && prev === 0) return "Sin ventas → Activar cuenta o contactar";
          if (curr === 0 && prev > 0) return "Dejó de comprar → Recuperar urgente";
          if (prev === 0 && curr > 0) return "Nuevas ventas → Potenciar cuenta";
          if (change <= -40) return "Caída fuerte → Recuperar urgente";
          if (change <= -20) return "Caída moderada → Reactivar compras";
          if (change <= -5) return "Riesgo inactivo → Contactar cliente";
          if (change < 5) return "Estable bajo → Aumentar ticket";
          if (change < 15) return "Estable medio → Ampliar mix";
          if (change < 30) return "Estable alto → Escalar cuenta";
          if (change < 60) return "Crecimiento leve → Estimular compra";
          if (change < 100) return "Crecimiento sostenido → Fidelizar cliente";
          return "Crecimiento fuerte → Potenciar cuenta";
        };

        const rows: CustomerTask[] = current.map((row) => {
          const prev = compareMap.get(row.id) ?? 0;
          const change = prev > 0 ? ((row.totalSales - prev) / prev) * 100 : 0;
          return {
            id: row.id,
            nit: row.nit,
            name: row.name,
            totalSales: row.totalSales,
            changePercent: Number(change.toFixed(1)),
            actionLabel: actionFor(change, prev, row.totalSales),
          };
        });
        setTasks(rows);
      } catch {
        if (!cancelled) setTasks([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [searchParams, compareRange]);

  const pctOfTotal = (val: number) =>
    totalSales > 0 ? ((val / totalSales) * 100).toFixed(1) + "%" : "—";

  const taskColumns = useMemo<ColumnDef<CustomerTask>[]>(
    () => [
      {
        header: "Cliente",
        cell: ({ row }) => {
          const name = row.original.name?.trim();
          if (!name) return "Cliente sin nombre";
          if (/^\d+$/.test(name)) return "Cliente sin nombre";
          if (/^cliente\s+\d+/i.test(name)) return "Cliente sin nombre";
          return name;
        },
      },
      { header: "Ventas", accessorKey: "totalSales", cell: ({ row }) => formatCop(row.original.totalSales) },
      { header: "% total", cell: ({ row }) => pctOfTotal(row.original.totalSales) },
      { header: "Comparación % vs mes anterior", accessorKey: "changePercent", cell: ({ row }) => `${row.original.changePercent.toFixed(1)}%` },
      { header: "Acción", accessorKey: "actionLabel" },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <Button
            className="border border-slate-200 bg-white text-xs text-slate-700 hover:bg-slate-50"
            onClick={() => {
              const params = new URLSearchParams(searchParams.toString());
              params.set("search", row.original.nit);
              params.set("customerId", row.original.id);
              window.location.href = `/customers?${params.toString()}`;
            }}
          >
            Ver
          </Button>
        ),
      },
    ],
    [totalSales, searchParams],
  );

  const dashboardUrl = useMemo(() => {
    const q = searchParams.toString();
    return q ? `/dashboard?${q}` : "/dashboard";
  }, [searchParams]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Tareas</h2>
          <p className="mt-1 text-sm text-slate-500">
            Acciones sugeridas por cliente según comparación de períodos.
          </p>
          {searchParams.get("vendor") && (
            <p className="mt-1 text-xs text-slate-600">
              Mostrando solo clientes del vendedor: <strong>{searchParams.get("vendor")}</strong>
            </p>
          )}
          {searchParams.get("from") && searchParams.get("to") && (
            <p className="mt-1 text-xs text-slate-500">
              Rango: {formatDateLocal(searchParams.get("from")!)} – {formatDateLocal(searchParams.get("to")!)}
            </p>
          )}
        </div>
        <Link href={dashboardUrl}>
          <Button variant="outline" size="sm" className="text-slate-700">
            Volver al Dashboard
          </Button>
        </Link>
      </div>

      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <p className="text-sm text-slate-500">Cargando…</p>
          ) : tasks.length === 0 ? (
            <p className="text-sm text-slate-500">
              No hay tareas para este rango. Ajusta los filtros o el período.
            </p>
          ) : (
            <DataTable columns={taskColumns} data={tasks} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
