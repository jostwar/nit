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
              { header: "Cliente", accessorFn: (row) => row.customer?.name ?? "N/A" },
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
