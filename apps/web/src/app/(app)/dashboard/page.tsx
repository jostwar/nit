"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

export default function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);

  useEffect(() => {
    apiGet<DashboardSummary>("/dashboard/summary")
      .then(setSummary)
      .catch(() => setSummary(null));
  }, []);

  const cards = [
    { label: "Ventas totales", value: summary?.current.totalSales ?? 0 },
    { label: "Margen", value: summary?.current.totalMargin ?? 0 },
    { label: "Ticket promedio", value: summary?.current.avgTicket ?? 0 },
    { label: "Clientes únicos", value: summary?.current.uniqueCustomers ?? 0 },
    { label: "Facturas", value: summary?.current.totalInvoices ?? 0 },
    { label: "Unidades", value: summary?.current.totalUnits ?? 0 },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <Card key={card.label}>
            <CardHeader>
              <CardTitle>{card.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold text-slate-900">
                {card.value.toLocaleString("es-CO")}
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
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={summary?.series ?? []}>
                <XAxis dataKey="date" hide />
                <YAxis hide />
                <Tooltip />
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
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={summary?.series ?? []}>
                <XAxis dataKey="date" hide />
                <YAxis hide />
                <Tooltip />
                <Line type="monotone" dataKey="totalInvoices" stroke="#0ea5e9" strokeWidth={2} />
                <Line type="monotone" dataKey="totalUnits" stroke="#f97316" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
