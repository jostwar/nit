"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiGet } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/data-table";
import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { formatCop } from "@/lib/utils";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

type DashboardSummary = {
  current: {
    totalSales: number;
    totalMargin: number;
    totalUnits: number;
    totalInvoices: number;
    uniqueCustomers: number;
    avgTicket: number;
  };
  compare: {
    totalSales: number;
    totalMargin: number;
    totalUnits: number;
    totalInvoices: number;
  };
  series: Array<{
    date: string;
    totalSales: number;
    totalInvoices: number;
    totalUnits: number;
    totalMargin: number;
  }>;
};

type CustomerRow = {
  id: string;
  nit: string;
  name: string;
  totalSales: number;
};

type CustomerTask = {
  id: string;
  nit: string;
  name: string;
  totalSales: number;
  changePercent: number;
  actionLabel: string;
};

type TipomovRow = {
  documentType: string;
  concept: string;
  sign: string;
  count: number;
  totalSigned: number;
  unitsSigned: number;
};

const DASHBOARD_LOADING_END = "dashboard-loading-end";

export default function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [tasks, setTasks] = useState<CustomerTask[]>([]);
  const [salesByClass, setSalesByClass] = useState<
    Array<{ classCode: string; className: string; totalSales: number; count: number }>
  >([]);
  const [tipomov, setTipomov] = useState<TipomovRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const searchParams = useSearchParams();

  useEffect(() => {
    const onSyncCompleted = () => setRefreshKey((k) => k + 1);
    window.addEventListener("sync-completed", onSyncCompleted);
    return () => window.removeEventListener("sync-completed", onSyncCompleted);
  }, []);
  const query = useMemo(() => {
    const params = new URLSearchParams();
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const compareFrom = searchParams.get("compareFrom");
    const compareTo = searchParams.get("compareTo");
    const vendor = searchParams.get("vendor");
    const brand = searchParams.get("brand");
    const classFilter = searchParams.get("class");
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (compareFrom) params.set("compareFrom", compareFrom);
    if (compareTo) params.set("compareTo", compareTo);
    if (vendor) params.set("vendor", vendor);
    if (brand) params.set("brand", brand);
    if (classFilter) params.set("class", classFilter);
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  }, [searchParams]);

  const compareRange = useMemo(() => {
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const compareFrom = searchParams.get("compareFrom");
    const compareTo = searchParams.get("compareTo");
    if (compareFrom && compareTo) {
      return { compareFrom, compareTo };
    }
    if (!from || !to) {
      return { compareFrom: undefined, compareTo: undefined };
    }
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
    setLoadError(null);
    setLoading(true);
    apiGet<DashboardSummary>(`/dashboard/summary${query}`, { timeoutMs: 30000 })
      .then((data) => {
        setSummary(data);
        setLoadError(null);
      })
      .catch((err) => {
        setSummary(null);
        const isAbort = err instanceof Error && err.name === "AbortError";
        const isNetwork = err instanceof TypeError && err.message?.includes("fetch");
        let msg = err instanceof Error ? err.message : "Error al cargar";
        if (isAbort) msg = "La consulta tardó demasiado. Prueba un rango de fechas más corto.";
        else if (isNetwork) msg = "No se pudo conectar a la API. Verifica que el servidor esté bien configurado (NEXT_PUBLIC_API_URL).";
        setLoadError(msg);
      })
      .finally(() => {
        setLoading(false);
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent(DASHBOARD_LOADING_END));
        }
      });
  }, [query, refreshKey]);

  useEffect(() => {
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    if (!from || !to) {
      setTipomov([]);
      return;
    }
    apiGet<TipomovRow[]>(`/dashboard/tipomov?from=${from}&to=${to}`)
      .then(setTipomov)
      .catch(() => setTipomov([]));
  }, [searchParams, refreshKey]);

  useEffect(() => {
    const loadTasks = async () => {
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
        params.set("limit", "50");
        const current = await apiGet<CustomerRow[]>(`/customers?${params.toString()}`);

        const compareParams = new URLSearchParams();
        if (compareRange.compareFrom) compareParams.set("from", compareRange.compareFrom);
        if (compareRange.compareTo) compareParams.set("to", compareRange.compareTo);
        if (vendor) compareParams.set("vendor", vendor);
        if (brand) compareParams.set("brand", brand);
        if (classFilter) compareParams.set("class", classFilter);
        compareParams.set("limit", "50");
        const compare =
          compareRange.compareFrom && compareRange.compareTo
            ? await apiGet<CustomerRow[]>(`/customers?${compareParams.toString()}`)
            : [];

        const compareMap = new Map(compare.map((row) => [row.id, row.totalSales]));
        const actionFor = (change: number, prev: number, curr: number) => {
          if (prev === 0 && curr > 0) return "🚀 Crecimiento acelerado → Potenciar cuenta";
          if (prev === 0 && curr === 0) return "➖ Estable bajo → Aumentar ticket";
          if (change <= -40) return "🔻 Caída fuerte → Recuperar urgente";
          if (change <= -20) return "🔻 Caída moderada → Reactivar compras";
          if (change <= -5) return "⚠️ Riesgo inactivo → Contactar cliente";
          if (change < 5) return "➖ Estable bajo → Aumentar ticket";
          if (change < 15) return "➖ Estable medio → Ampliar mix";
          if (change < 30) return "➖ Estable alto → Escalar cuenta";
          if (change < 60) return "📈 Crecimiento leve → Estimular compra";
          if (change < 100) return "📈 Crecimiento sostenido → Fidelizar cliente";
          return "🚀 Crecimiento acelerado → Potenciar cuenta";
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
        setTasks([]);
      }
    };
    loadTasks();
  }, [searchParams, compareRange, refreshKey]);

  useEffect(() => {
    apiGet<Array<{ classCode: string; className: string; totalSales: number; count: number }>>(
      `/dashboard/sales-by-class${query}`,
    )
      .then(setSalesByClass)
      .catch(() => setSalesByClass([]));
  }, [query, refreshKey]);

  const cards = [
    { label: "Ventas totales", value: summary?.current.totalSales ?? 0, currency: true },
    { label: "Margen", value: summary?.current.totalMargin ?? 0, currency: true },
    {
      label: "Margen %",
      value:
        summary && summary.current.totalSales > 0
          ? (summary.current.totalMargin / summary.current.totalSales) * 100
          : 0,
      percent: true,
    },
    { label: "Ticket promedio", value: summary?.current.avgTicket ?? 0, currency: true },
    { label: "Clientes únicos", value: summary?.current.uniqueCustomers ?? 0 },
    { label: "Facturas", value: summary?.current.totalInvoices ?? 0 },
    { label: "Unidades", value: summary?.current.totalUnits ?? 0 },
  ];

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
      {
        header: "Ventas",
        accessorKey: "totalSales",
        cell: ({ row }) => formatCop(row.original.totalSales),
      },
      {
        header: "Comparación % vs mes anterior",
        accessorKey: "changePercent",
        cell: ({ row }) => `${row.original.changePercent.toFixed(1)}%`,
      },
      { header: "Acción", accessorKey: "actionLabel" },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <Button
            className="border border-slate-200 bg-white text-xs text-slate-700 hover:bg-slate-50"
            onClick={() => {
              window.location.href = `/customers?search=${row.original.nit}`;
            }}
          >
            Ver
          </Button>
        ),
      },
    ],
    [],
  );

  return (
    <div className="flex flex-col gap-6">
      {loading && (
        <div className="rounded-lg border border-slate-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
          Cargando datos…
        </div>
      )}
      {loadError && !loading && (
        <div className="rounded-lg border-2 border-red-300 bg-red-50 px-4 py-4 text-sm font-medium text-red-800">
          {loadError}
        </div>
      )}
      {!loading && !loadError && summary && (summary.current?.totalInvoices ?? 0) === 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          No hay datos de ventas para este rango. Si acabas de configurar el sistema, usa &quot;Actualizar hoy&quot; para traer facturas del ERP.
        </div>
      )}
      {!loading && summary && searchParams.get("from") && searchParams.get("to") && (
        <p className="text-xs text-slate-500">
          Datos del rango:{" "}
          {new Date(searchParams.get("from")!).toLocaleDateString("es-CO", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}{" "}
          –{" "}
          {new Date(searchParams.get("to")!).toLocaleDateString("es-CO", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </p>
      )}

      {tipomov.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">TIPOMOV (validar contra ERP)</CardTitle>
            <p className="text-xs text-slate-500 font-normal">
              Totales por tipo de documento en el rango seleccionado.
            </p>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-2 pr-4">Código</th>
                    <th className="text-left py-2 pr-4">Concepto</th>
                    <th className="text-left py-2 pr-4">SUMA/RESTA</th>
                    <th className="text-right py-2 pr-4">Facturas</th>
                    <th className="text-right py-2 pr-4">Total (COP)</th>
                    <th className="text-right py-2">Unidades</th>
                  </tr>
                </thead>
                <tbody>
                  {tipomov.map((row) => (
                    <tr key={row.documentType} className="border-b border-slate-100">
                      <td className="py-2 pr-4 font-mono">{row.documentType}</td>
                      <td className="py-2 pr-4">{row.concept}</td>
                      <td className="py-2 pr-4">
                        <span className={row.sign === "RESTA" ? "text-red-600" : "text-slate-700"}>
                          {row.sign}
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-right">{row.count.toLocaleString("es-CO")}</td>
                      <td className="py-2 pr-4 text-right">{formatCop(row.totalSigned)}</td>
                      <td className="py-2 text-right">{row.unitsSigned.toLocaleString("es-CO")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <Card key={card.label}>
            <CardHeader>
              <CardTitle>{card.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold text-slate-900">
                {card.percent
                  ? `${card.value.toFixed(1)}%`
                  : card.currency
                    ? formatCop(card.value)
                    : card.value.toLocaleString("es-CO")}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="h-[320px]">
          <CardHeader>
            <CardTitle>Evolución de ventas</CardTitle>
          </CardHeader>
          <CardContent className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={1}>
              <LineChart data={summary?.series ?? []}>
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(value) => {
                    const date =
                      typeof value === "string" || typeof value === "number"
                        ? new Date(value)
                        : value instanceof Date
                          ? value
                          : null;
                    if (!date || Number.isNaN(date.getTime())) return String(value);
                    return date.toISOString().slice(5, 10).replace("-", "/");
                  }}
                />
                <YAxis
                  tick={{ fontSize: 10 }}
                  tickFormatter={(value) =>
                    typeof value === "number" ? formatCop(value) : formatCop(Number(value))
                  }
                />
                <Tooltip
                  formatter={(value) =>
                    typeof value === "number" ? formatCop(value) : formatCop(Number(value))
                  }
                  labelFormatter={(label) =>
                    typeof label === "string" ? `Fecha: ${label}` : `Fecha: ${label}`
                  }
                />
                <Line type="monotone" dataKey="totalSales" stroke="#0f172a" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="h-[320px]">
          <CardHeader>
            <CardTitle>Facturas y unidades</CardTitle>
          </CardHeader>
          <CardContent className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={1}>
              <LineChart data={summary?.series ?? []}>
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(value) => {
                    const date =
                      typeof value === "string" || typeof value === "number"
                        ? new Date(value)
                        : value instanceof Date
                          ? value
                          : null;
                    if (!date || Number.isNaN(date.getTime())) return String(value);
                    return date.toISOString().slice(5, 10).replace("-", "/");
                  }}
                />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip
                  formatter={(value, name) =>
                    typeof value === "number"
                      ? value.toLocaleString("es-CO")
                      : Number(value).toLocaleString("es-CO")
                  }
                  labelFormatter={(label) =>
                    typeof label === "string" ? `Fecha: ${label}` : `Fecha: ${label}`
                  }
                />
                <Line type="monotone" dataKey="totalInvoices" stroke="#0ea5e9" strokeWidth={2} />
                <Line type="monotone" dataKey="totalUnits" stroke="#f97316" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Venta por clase</CardTitle>
        </CardHeader>
        <CardContent>
          {salesByClass.length === 0 ? (
            <p className="text-sm text-slate-500">
              No hay datos por clase para este rango. Carga el mapeo código→nombre en
              &quot;Clase&quot; (admin) y vuelve a sincronizar.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-600">
                    <th className="py-2 pr-4 font-medium">Clase</th>
                    <th className="py-2 pr-4 font-medium text-right">Ventas</th>
                    <th className="py-2 pr-4 font-medium text-right">Líneas</th>
                  </tr>
                </thead>
                <tbody>
                  {salesByClass.map((row) => (
                    <tr key={row.classCode} className="border-b border-slate-100">
                      <td className="py-2 pr-4 text-slate-800">
                        {row.className || row.classCode || "—"}
                      </td>
                      <td className="py-2 pr-4 text-right font-medium text-slate-800">
                        {formatCop(row.totalSales)}
                      </td>
                      <td className="py-2 pr-4 text-right text-slate-600">
                        {row.count.toLocaleString("es-CO")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tareas</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable columns={taskColumns} data={tasks} />
        </CardContent>
      </Card>
    </div>
  );
}
