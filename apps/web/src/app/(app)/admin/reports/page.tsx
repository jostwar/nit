"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiGet } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

export default function AdminReportsPage() {
  const today = new Date().toISOString().slice(0, 10);
  const router = useRouter();
  const searchParams = useSearchParams();
  const yearStart = `${today.slice(0, 4)}-01-01`;
  const lastYear = String(Number(today.slice(0, 4)) - 1);
  const initial = useMemo(
    () => ({
      from: searchParams.get("from") ?? yearStart,
      to: searchParams.get("to") ?? today,
      compareFrom: searchParams.get("compareFrom") ?? `${lastYear}-01-01`,
      compareTo: searchParams.get("compareTo") ?? `${lastYear}-${today.slice(5)}`,
    }),
    [searchParams, today, yearStart, lastYear],
  );
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [compareFrom, setCompareFrom] = useState(initial.compareFrom);
  const [compareTo, setCompareTo] = useState(initial.compareTo);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setFrom(initial.from);
    setTo(initial.to);
    setCompareFrom(initial.compareFrom);
    setCompareTo(initial.compareTo);
  }, [initial.from, initial.to, initial.compareFrom, initial.compareTo]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams(searchParams.toString());
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  }, [searchParams]);

  const periodLabel = useMemo(() => {
    const format = new Intl.DateTimeFormat("es-CO", {
      year: "numeric",
      month: "short",
      day: "2-digit",
    });
    const fromDate = new Date(compareFrom);
    const toDate = new Date(compareTo);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      return "Periodo comparado no definido";
    }
    return `${format.format(fromDate)} - ${format.format(toDate)}`;
  }, [compareFrom, compareTo]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    apiGet<DashboardSummary>(`/dashboard/summary${queryString}`)
      .then(setSummary)
      .catch(() => setError("No se pudieron cargar los reportes."))
      .finally(() => setLoading(false));
  }, [queryString]);

  const applyReport = (overrides?: {
    from?: string;
    to?: string;
    compareFrom?: string;
    compareTo?: string;
  }) => {
    const nextFrom = overrides?.from ?? from;
    const nextTo = overrides?.to ?? to;
    const nextCompareFrom = overrides?.compareFrom ?? compareFrom;
    const nextCompareTo = overrides?.compareTo ?? compareTo;
    const params = new URLSearchParams();
    if (nextFrom) params.set("from", nextFrom);
    if (nextTo) params.set("to", nextTo);
    if (nextCompareFrom) params.set("compareFrom", nextCompareFrom);
    if (nextCompareTo) params.set("compareTo", nextCompareTo);
    router.replace(`?${params.toString()}`);
  };

  const marginPercent =
    summary && summary.current.totalSales > 0
      ? (summary.current.totalMargin / summary.current.totalSales) * 100
      : 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Reportes de Ventas</h2>
          <p className="text-sm text-slate-500">Tablero Analítico de Ventas</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={() => {
              setFrom(yearStart);
              setTo(today);
              applyReport({ from: yearStart, to: today });
            }}
            className="border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          >
            Este Año
          </Button>
          <label className="flex items-center gap-2 text-xs text-slate-500">
            Fecha Inicial
            <input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className="rounded-md border border-slate-200 px-2 py-1 text-xs"
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-500">
            Fecha Final
            <input
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className="rounded-md border border-slate-200 px-2 py-1 text-xs"
            />
          </label>
        </div>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
          <div className="flex items-center gap-3">
            <Button
              onClick={() => applyReport()}
              className="border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            >
              Filtros
            </Button>
            <div className="text-xs text-slate-500">
              Periodo comparado:{" "}
              <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
                {periodLabel}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-slate-500">
              Fecha inicial
              <input
                type="date"
                value={compareFrom}
                onChange={(event) => setCompareFrom(event.target.value)}
                className="rounded-md border border-slate-200 px-2 py-1 text-xs"
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-500">
              Fecha final
              <input
                type="date"
                value={compareTo}
                onChange={(event) => setCompareTo(event.target.value)}
                className="rounded-md border border-slate-200 px-2 py-1 text-xs"
              />
            </label>
            <Button onClick={() => applyReport()} disabled={loading}>
              {loading ? "Actualizando..." : "Aplicar"}
            </Button>
          </div>
        </CardContent>
      </Card>
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
