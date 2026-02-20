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
    uniqueCustomers?: number;
    avgTicket?: number;
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

  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  const compareFrom = searchParams.get("compareFrom") ?? "";
  const compareTo = searchParams.get("compareTo") ?? "";
  const formatRange = (f: string, t: string) => {
    if (!f || !t) return null;
    const fmt = new Intl.DateTimeFormat("es-CO", {
      year: "numeric",
      month: "short",
      day: "2-digit",
    });
    const fromDate = new Date(f);
    const toDate = new Date(t);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) return null;
    return `${fmt.format(fromDate)} – ${fmt.format(toDate)}`;
  };
  const mainPeriodLabel = formatRange(from, to);
  const comparePeriodLabel = compareFrom && compareTo ? formatRange(compareFrom, compareTo) : null;
  const isCompareActive = Boolean(comparePeriodLabel);

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
  const compareMarginPercent =
    summary && summary.compare.totalSales > 0
      ? (summary.compare.totalMargin / summary.compare.totalSales) * 100
      : 0;
  const compareAvgTicket =
    summary?.compare?.avgTicket != null
      ? summary.compare.avgTicket
      : summary && summary.compare.totalInvoices > 0
        ? summary.compare.totalSales / summary.compare.totalInvoices
        : 0;
  /** Variación vs periodo principal: (principal - comparado) / principal. Así el % es respecto al periodo actual. */
  const variationVsPrincipal = (principal: number, compare: number) =>
    principal === 0 ? (compare === 0 ? 0 : null) : ((principal - compare) / principal) * 100;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Reportes de Ventas</h2>
        <p className="text-sm text-slate-500">Tablero Analítico de Ventas</p>
        <p className="mt-1 text-xs text-slate-500">
          Período principal define el rango de las métricas. Opcional: define &quot;Periodo a comparar&quot; y pulsa &quot;Aplicar comparación&quot; para ver ambos y la variación.
        </p>
        <div className="mt-2 flex flex-wrap gap-4 text-xs">
          {mainPeriodLabel && (
            <span className="text-slate-600">
              <span className="font-medium text-slate-700">Periodo principal:</span> {mainPeriodLabel}
            </span>
          )}
          {isCompareActive && comparePeriodLabel && (
            <span className="text-slate-600">
              <span className="font-medium text-slate-700">Periodo a comparar:</span> {comparePeriodLabel}
            </span>
          )}
        </div>
      </div>
      {error ? <div className="text-sm text-rose-500">{error}</div> : null}

      <div>
        <h3 className="mb-3 text-sm font-medium text-slate-700">Periodo principal</h3>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
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
              <CardTitle>Facturas</CardTitle>
            </CardHeader>
            <CardContent className="text-lg font-semibold text-slate-900">
              {(summary?.current.totalInvoices ?? 0).toLocaleString("es-CO")}
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
      </div>

      {isCompareActive && summary && (
        <div>
          <h3 className="mb-3 text-sm font-medium text-slate-700">Periodo a comparar</h3>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <Card className="border-slate-200 bg-slate-50/50">
              <CardHeader>
                <CardTitle>Ventas Totales</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-lg font-semibold text-slate-900">
                  {formatCop(summary.compare.totalSales)}
                </div>
                {variationVsPrincipal(summary.current.totalSales, summary.compare.totalSales) != null && (
                  <p className={`mt-1 text-xs ${variationVsPrincipal(summary.current.totalSales, summary.compare.totalSales)! >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    {variationVsPrincipal(summary.current.totalSales, summary.compare.totalSales)! >= 0 ? "+" : ""}
                    {variationVsPrincipal(summary.current.totalSales, summary.compare.totalSales)!.toFixed(1)}% vs periodo principal
                  </p>
                )}
              </CardContent>
            </Card>
            <Card className="border-slate-200 bg-slate-50/50">
              <CardHeader>
                <CardTitle>Margen Bruto</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-lg font-semibold text-slate-900">
                  {compareMarginPercent.toFixed(1)}%
                </div>
                {variationVsPrincipal(marginPercent, compareMarginPercent) != null && (
                  <p className={`mt-1 text-xs ${variationVsPrincipal(marginPercent, compareMarginPercent)! >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    {variationVsPrincipal(marginPercent, compareMarginPercent)! >= 0 ? "+" : ""}
                    {variationVsPrincipal(marginPercent, compareMarginPercent)!.toFixed(1)}% vs periodo principal
                  </p>
                )}
              </CardContent>
            </Card>
            <Card className="border-slate-200 bg-slate-50/50">
              <CardHeader>
                <CardTitle>Ticket Promedio</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-lg font-semibold text-slate-900">
                  {formatCop(compareAvgTicket)}
                </div>
                {variationVsPrincipal(summary.current.avgTicket, compareAvgTicket) != null && (
                  <p className={`mt-1 text-xs ${variationVsPrincipal(summary.current.avgTicket, compareAvgTicket)! >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    {variationVsPrincipal(summary.current.avgTicket, compareAvgTicket)! >= 0 ? "+" : ""}
                    {variationVsPrincipal(summary.current.avgTicket, compareAvgTicket)!.toFixed(1)}% vs periodo principal
                  </p>
                )}
              </CardContent>
            </Card>
            <Card className="border-slate-200 bg-slate-50/50">
              <CardHeader>
                <CardTitle>Facturas</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-lg font-semibold text-slate-900">
                  {summary.compare.totalInvoices.toLocaleString("es-CO")}
                </div>
                {variationVsPrincipal(summary.current.totalInvoices, summary.compare.totalInvoices) != null && (
                  <p className={`mt-1 text-xs ${variationVsPrincipal(summary.current.totalInvoices, summary.compare.totalInvoices)! >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    {variationVsPrincipal(summary.current.totalInvoices, summary.compare.totalInvoices)! >= 0 ? "+" : ""}
                    {variationVsPrincipal(summary.current.totalInvoices, summary.compare.totalInvoices)!.toFixed(1)}% vs periodo principal
                  </p>
                )}
              </CardContent>
            </Card>
            <Card className="border-slate-200 bg-slate-50/50">
              <CardHeader>
                <CardTitle>Clientes Únicos</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-lg font-semibold text-slate-900">
                  {summary.compare.uniqueCustomers != null ? summary.compare.uniqueCustomers.toLocaleString("es-CO") : "—"}
                </div>
                {summary.compare.uniqueCustomers != null && variationVsPrincipal(summary.current.uniqueCustomers ?? 0, summary.compare.uniqueCustomers) != null && (
                  <p className={`mt-1 text-xs ${variationVsPrincipal(summary.current.uniqueCustomers ?? 0, summary.compare.uniqueCustomers)! >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    {variationVsPrincipal(summary.current.uniqueCustomers ?? 0, summary.compare.uniqueCustomers)! >= 0 ? "+" : ""}
                    {variationVsPrincipal(summary.current.uniqueCustomers ?? 0, summary.compare.uniqueCustomers)!.toFixed(1)}% vs periodo principal
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      <div>
        <h3 className="mb-3 text-sm font-medium text-slate-700">Evolución (periodo principal)</h3>

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
                <YAxis
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v) => formatCop(Number(v))}
                />
                <Tooltip
                  formatter={(value, name) =>
                    name === "totalSales"
                      ? formatCop(Number(value))
                      : Number(value).toLocaleString("es-CO")
                  }
                  labelFormatter={(label) => {
                    const str = typeof label === "string" ? label : String(label ?? "");
                    const part = str.slice(0, 10);
                    const [y, m, d] = part.split("-");
                    if (y && m && d) return `Fecha: ${d}/${m}/${y}`;
                    return `Fecha: ${str}`;
                  }}
                />
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
    </div>
  );
}
