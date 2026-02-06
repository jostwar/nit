"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiGet } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

export default function AdminReportsPage() {
  const searchParams = useSearchParams();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const queryString = useMemo(() => {
    const params = new URLSearchParams(searchParams.toString());
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  }, [searchParams]);

  const compareFrom = searchParams.get("compareFrom") ?? "";
  const compareTo = searchParams.get("compareTo") ?? "";
  const periodLabel = useMemo(() => {
    if (!compareFrom || !compareTo) return null;
    const format = new Intl.DateTimeFormat("es-CO", {
      year: "numeric",
      month: "short",
      day: "2-digit",
    });
    const fromDate = new Date(compareFrom);
    const toDate = new Date(compareTo);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) return null;
    return `${format.format(fromDate)} – ${format.format(toDate)}`;
  }, [compareFrom, compareTo]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    apiGet<DashboardSummary>(`/dashboard/summary${queryString}`)
      .then(setSummary)
      .catch(() => setError("No se pudieron cargar los reportes."))
      .finally(() => setLoading(false));
  }, [queryString]);

  const marginPercent =
    summary && summary.current.totalSales > 0
      ? (summary.current.totalMargin / summary.current.totalSales) * 100
      : 0;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Reportes de Ventas</h2>
        <p className="text-sm text-slate-500">Tablero Analítico de Ventas</p>
        <p className="mt-1 text-xs text-slate-500">
          Usa el filtro superior (Período, Ciudad, Vendedor, Marca) y Comparar para definir rangos.
        </p>
        {periodLabel && (
          <p className="mt-1 text-xs text-slate-500">
            Periodo comparado: <span className="font-medium text-slate-700">{periodLabel}</span>
          </p>
        )}
      </div>
      {error ? <div className="text-sm text-rose-500">{error}</div> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle>Ventas Totales</CardTitle>
          </CardHeader>
          <CardContent className="text-lg font-semibold text-slate-900">
            {formatCop(summary?.current.totalSales ?? 0)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Margen Bruto</CardTitle>
          </CardHeader>
          <CardContent className="text-lg font-semibold text-slate-900">
            {marginPercent.toFixed(1)}%
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Ticket Promedio</CardTitle>
          </CardHeader>
          <CardContent className="text-lg font-semibold text-slate-900">
            {formatCop(summary?.current.avgTicket ?? 0)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Clientes Únicos</CardTitle>
          </CardHeader>
          <CardContent className="text-lg font-semibold text-slate-900">
            {(summary?.current.uniqueCustomers ?? 0).toLocaleString("es-CO")}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card className="h-[360px]">
          <CardHeader>
            <CardTitle>Evolución de Ventas y Transacciones</CardTitle>
          </CardHeader>
          <CardContent className="h-[280px]">
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
                <Tooltip />
                <Line type="monotone" dataKey="totalSales" stroke="#0f172a" strokeWidth={2} />
                <Line type="monotone" dataKey="totalInvoices" stroke="#0ea5e9" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Unidades</CardTitle>
            </CardHeader>
            <CardContent className="text-lg font-semibold text-slate-900">
              {(summary?.current.totalUnits ?? 0).toLocaleString("es-CO")}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Facturas</CardTitle>
            </CardHeader>
            <CardContent className="text-lg font-semibold text-slate-900">
              {(summary?.current.totalInvoices ?? 0).toLocaleString("es-CO")}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
