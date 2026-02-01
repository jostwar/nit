"use client";

import { useEffect, useMemo, useState } from "react";
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
  const [from, setFrom] = useState("2026-01-01");
  const [to, setTo] = useState(today);
  const [compareFrom, setCompareFrom] = useState("2025-01-01");
  const [compareTo, setCompareTo] = useState("2025-02-01");
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(false);

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

  const applyReport = async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({
        from,
        to,
        compareFrom,
        compareTo,
      }).toString();
      const data = await apiGet<DashboardSummary>(`/dashboard/summary?${query}`);
      setSummary(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    applyReport();
  }, []);

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
          <Button variant="outline" onClick={() => setFrom("2026-01-01")}>
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
            <Button variant="outline">Filtros</Button>
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
            <Button onClick={applyReport} disabled={loading}>
              {loading ? "Actualizando..." : "Aplicar"}
            </Button>
          </div>
        </CardContent>
      </Card>

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
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={summary?.series ?? []}>
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
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
