"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/data-table";

type AlertRule = {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
};

type AlertEvent = {
  id: string;
  message: string;
  customer?: { name?: string | null } | null;
  rule?: { name?: string | null } | null;
};

export default function AlertsPage() {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [events, setEvents] = useState<AlertEvent[]>([]);

  const displayCustomerName = (name?: string | null) => {
    if (!name) return "Cliente sin nombre";
    if (/^\d+$/.test(name)) return "Cliente sin nombre";
    if (/^cliente\\s+\\d+/i.test(name)) return "Cliente sin nombre";
    return name;
  };

  useEffect(() => {
    apiGet<AlertRule[]>("/alerts/rules").then(setRules);
    apiGet<AlertEvent[]>("/alerts/events?status=OPEN").then(setEvents);
  }, []);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
      <Card>
        <CardHeader>
          <CardTitle>Reglas configuradas</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={[
              { header: "Regla", accessorKey: "name" },
              { header: "Tipo", accessorKey: "type" },
              { header: "Activa", accessorKey: "isActive" },
            ]}
            data={rules}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Eventos abiertos</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={[
              {
                header: "Cliente",
                accessorFn: (row) => displayCustomerName(row.customer?.name ?? null),
              },
              { header: "Regla", accessorFn: (row) => row.rule?.name ?? "N/A" },
              { header: "Mensaje", accessorKey: "message" },
            ]}
            data={events}
          />
        </CardContent>
      </Card>
    </div>
  );
}
