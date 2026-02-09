"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const DEFAULT_FILTERS: Record<string, boolean> = {
  dashboard: true,
  customers: true,
  alerts: true,
  ai: true,
  adminUsers: true,
  adminFilters: true,
  adminCatalog: true,
  adminReports: true,
};

export default function AdminFiltersPage() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);

  useEffect(() => {
    const raw = window.localStorage.getItem("appFilters");
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Record<string, boolean>;
      setFilters({ ...DEFAULT_FILTERS, ...parsed });
    } catch {
      setFilters(DEFAULT_FILTERS);
    }
  }, []);

  const save = (next: Record<string, boolean>) => {
    setFilters(next);
    window.localStorage.setItem("appFilters", JSON.stringify(next));
  };

  const items = useMemo(
    () => [
      { key: "dashboard", label: "Dashboard" },
      { key: "customers", label: "Cliente 360" },
      { key: "alerts", label: "Alertas" },
      { key: "ai", label: "AI Copilot" },
      { key: "adminUsers", label: "Usuarios" },
      { key: "adminFilters", label: "Filtros de Apps" },
      { key: "adminCatalog", label: "Catálogo referencias" },
      { key: "adminReports", label: "Reportes de Ventas" },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Filtros de Apps</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-slate-600">
          <p>
            Controla qué módulos aparecen en el menú lateral para este navegador.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {items.map((item) => (
              <label key={item.key} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={filters[item.key]}
                  onChange={(event) =>
                    save({ ...filters, [item.key]: event.target.checked })
                  }
                />
                {item.label}
              </label>
            ))}
          </div>
          <Button
            className="border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            onClick={() => save(DEFAULT_FILTERS)}
          >
            Restablecer
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
