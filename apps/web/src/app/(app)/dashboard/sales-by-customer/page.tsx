"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { apiGet } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCop, formatDateLocal } from "@/lib/utils";

type CustomerRow = {
  id: string;
  nit: string;
  name: string;
  totalSales: number;
  totalInvoices?: number;
};

export default function SalesByCustomerPage() {
  const searchParams = useSearchParams();
  const [list, setList] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalSales, setTotalSales] = useState(0);

  const queryString = useMemo(() => {
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
    return params.toString();
  }, [searchParams]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      apiGet<{ current: { totalSales: number } }>(`/dashboard/summary?${queryString}`).catch(() => ({ current: { totalSales: 0 } })),
      apiGet<CustomerRow[]>(`/customers?${queryString}`),
    ])
      .then(([summary, data]) => {
        setTotalSales(summary?.current?.totalSales ?? 0);
        const sorted = [...(Array.isArray(data) ? data : [])].sort(
          (a, b) => (b.totalSales ?? 0) - (a.totalSales ?? 0),
        );
        setList(sorted);
      })
      .catch(() => setList([]))
      .finally(() => setLoading(false));
  }, [queryString]);

  const pctOfTotal = (val: number) =>
    totalSales > 0 ? ((val / totalSales) * 100).toFixed(1) + "%" : "—";

  const dashboardUrl = useMemo(() => {
    const q = searchParams.toString();
    return q ? `/dashboard?${q}` : "/dashboard";
  }, [searchParams]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Venta por cliente</h2>
          <p className="mt-1 text-sm text-slate-500">
            Totales por cliente en el rango seleccionado.
          </p>
          {searchParams.get("from") && searchParams.get("to") && (
            <p className="mt-1 text-xs text-slate-500">
              Rango: {formatDateLocal(searchParams.get("from")!)}{" "}
              – {formatDateLocal(searchParams.get("to")!)}
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
          ) : list.length === 0 ? (
            <p className="text-sm text-slate-500">
              No hay datos por cliente para este rango. Revisa los filtros o actualiza los datos.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-600">
                    <th className="py-2 pr-4 font-medium">Cliente</th>
                    <th className="py-2 pr-4 font-medium font-mono">NIT / Cédula</th>
                    <th className="py-2 pr-4 font-medium text-right">Ventas</th>
                    <th className="py-2 pr-4 font-medium text-right">% total</th>
                    <th className="py-2 pr-4 font-medium text-right">Facturas</th>
                    <th className="py-2 pl-2 w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((row) => (
                    <tr key={row.id} className="border-b border-slate-100">
                      <td className="py-2 pr-4 text-slate-800">{row.name || "—"}</td>
                      <td className="py-2 pr-4 font-mono text-slate-700">{row.nit}</td>
                      <td className="py-2 pr-4 text-right font-medium text-slate-800">
                        {formatCop(row.totalSales)}
                      </td>
                      <td className="py-2 pr-4 text-right text-slate-600">
                        {pctOfTotal(row.totalSales)}
                      </td>
                      <td className="py-2 pr-4 text-right text-slate-600">
                        {(row.totalInvoices ?? 0).toLocaleString("es-CO")}
                      </td>
                      <td className="py-2 pl-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => {
                            const params = new URLSearchParams();
                            params.set("search", row.nit);
                            params.set("customerId", row.id);
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
                            window.location.href = `/customers?${params.toString()}`;
                          }}
                        >
                          Ver
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
