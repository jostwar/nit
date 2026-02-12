"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiGet, apiPost } from "@/lib/api";
import { formatDateLocal } from "@/lib/utils";

export default function DataUpdatePage() {
  const today = new Date().toISOString().slice(0, 10);
  const searchParams = useSearchParams();
  const defaultFrom = useMemo(
    () => new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    [],
  );
  const from = searchParams.get("from") ?? defaultFrom;
  const to = searchParams.get("to") ?? today;

  const [syncRunning, setSyncRunning] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{
    percent: number;
    stage: string;
    current: number;
    total: number;
  } | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncLongRunningHint, setSyncLongRunningHint] = useState(false);
  const [dataCoverage, setDataCoverage] = useState<{
    earliestDate: string | null;
    latestDate: string | null;
    totalInvoices: number;
  } | null>(null);
  const [filterOptions, setFilterOptions] = useState<{
    itemDiagnostic?: {
      totalItems: number;
      itemsWithBrand: number;
      itemsWithClass: number;
    };
  } | null>(null);

  const lastSyncLabel = useMemo(() => {
    if (!lastSyncedAt) return "Última actualización: pendiente";
    const parsed = new Date(lastSyncedAt);
    if (Number.isNaN(parsed.getTime())) return "Última actualización: pendiente";
    return `Última actualización: ${parsed.toLocaleString("es-CO")}`;
  }, [lastSyncedAt]);

  const coverageLabel = useMemo(() => {
    if (!dataCoverage) return null;
    if (dataCoverage.totalInvoices === 0) return "Sin datos de ventas";
    const fmt = (d: string) => formatDateLocal(d.slice(0, 10), "es-CO");
    return `Datos disponibles: ${dataCoverage.earliestDate ? fmt(dataCoverage.earliestDate) : "?"} – ${dataCoverage.latestDate ? fmt(dataCoverage.latestDate) : "?"} (${dataCoverage.totalInvoices.toLocaleString("es-CO")} facturas)`;
  }, [dataCoverage]);

  const runSyncNow = async (mode: "today" | "historical" | "range") => {
    setSyncError(null);
    setSyncRunning(true);
    const historicalFrom = "2024-01-01";
    const fromParam = mode === "today" ? today : mode === "historical" ? historicalFrom : from;
    const toParam = mode === "today" || mode === "historical" ? today : to;
    const safetyMs = mode === "historical" || mode === "range" ? 900_000 : 300_000;
    const safetyTimer = window.setTimeout(() => {
      setSyncRunning((prev) => (prev ? false : prev));
    }, safetyMs);
    const clearSafety = () => window.clearTimeout(safetyTimer);
    try {
      const res = await apiPost<{ status: string }>(
        "/source/sync",
        { from: fromParam, to: toParam },
        { timeoutMs: 60000 },
      );
      if (res.status === "running") {
        window.addEventListener("sync-completed", clearSafety, { once: true });
      }
    } catch (err) {
      clearSafety();
      setSyncRunning(false);
      setSyncError(err instanceof Error ? err.message : "Error al actualizar los datos");
    }
  };

  const fetchFilterOptions = () => {
    apiGet<{ itemDiagnostic?: { totalItems: number; itemsWithBrand: number; itemsWithClass: number } }>(
      "/dashboard/filter-options",
    )
      .then((opts) => setFilterOptions({ itemDiagnostic: opts?.itemDiagnostic }))
      .catch(() => setFilterOptions(null));
  };

  useEffect(() => {
    let mounted = true;
    const fetchStatus = async () => {
      try {
        const status = await apiGet<{
          running: boolean;
          lastSyncedAt: string | null;
          dataCoverage?: {
            earliestDate: string | null;
            latestDate: string | null;
            totalInvoices: number;
          };
          progress?: { percent: number; stage: string; current: number; total: number } | null;
        }>("/source/sync/status");
        if (!mounted) return;
        setSyncRunning(status.running);
        setSyncProgress(status.progress ?? null);
        setLastSyncedAt(status.lastSyncedAt);
        if (status.dataCoverage) setDataCoverage(status.dataCoverage);
        setSyncError(null);
      } catch {
        if (!mounted) return;
        setSyncRunning(false);
      }
    };
    fetchStatus();
    const interval = window.setInterval(fetchStatus, 3000);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    fetchFilterOptions();
  }, []);

  useEffect(() => {
    const onSyncCompleted = () => fetchFilterOptions();
    window.addEventListener("sync-completed", onSyncCompleted);
    return () => window.removeEventListener("sync-completed", onSyncCompleted);
  }, []);

  useEffect(() => {
    if (!syncRunning) {
      setSyncLongRunningHint(false);
      return;
    }
    const t = window.setTimeout(() => setSyncLongRunningHint(true), 25_000);
    return () => window.clearTimeout(t);
  }, [syncRunning]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Actualización de datos</h2>
        <p className="mt-1 text-sm text-slate-500">
          Actualiza ventas y cartera desde tu origen de datos. La primera vez carga históricos; luego el sistema actualiza el día automáticamente.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Actualización de datos</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm text-slate-600">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={() => runSyncNow("today")}
              disabled={syncRunning}
              className="h-9 px-4 text-sm bg-emerald-600 hover:bg-emerald-700 text-white"
              title="Actualizar solo el día actual"
            >
              {syncRunning ? "Actualizando…" : "Actualizar hoy"}
            </Button>
            <Button
              type="button"
              onClick={() => runSyncNow("historical")}
              disabled={syncRunning}
              className="h-9 px-4 text-sm bg-slate-700 hover:bg-slate-800 text-white"
              title="Cargar ventas y cartera desde 2024 hasta hoy"
            >
              Cargar datos históricos
            </Button>
            <Button
              type="button"
              onClick={() => runSyncNow("range")}
              disabled={syncRunning}
              className="h-9 px-4 text-sm border border-slate-300 text-slate-600 bg-white hover:bg-slate-50"
              title="Actualizar el rango Desde–Hasta del período principal"
            >
              Actualizar rango
            </Button>
            {syncRunning && (
              <Button
                type="button"
                onClick={() => apiPost("/source/sync/cancel", {}).catch(() => {})}
                className="h-9 px-4 text-sm border border-red-300 text-red-700 bg-white hover:bg-red-50"
                title="Detener la actualización en curso"
              >
                Detener actualización
              </Button>
            )}
          </div>

          {syncRunning && syncProgress && (
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">Procesando…</span>
                <span className="font-medium text-slate-700">{syncProgress.percent}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-emerald-600 transition-all duration-300"
                  style={{ width: `${Math.min(100, syncProgress.percent)}%` }}
                />
              </div>
              {syncProgress.total > 0 && (
                <span className="text-slate-500">
                  Paso {syncProgress.current} de {syncProgress.total}
                </span>
              )}
            </div>
          )}

          {syncRunning && !syncProgress && (
            <span className="text-slate-500">Actualizando… (preparando)</span>
          )}

          {!syncRunning && <span className="text-slate-500">{lastSyncLabel}</span>}

          {syncRunning && (
            <span className="text-slate-500 text-sm">
              Puede tardar varios minutos. Al terminar se actualiza solo.
            </span>
          )}

          {syncLongRunningHint && (
            <span className="text-amber-700 text-sm font-medium">
              La actualización puede tardar. Puedes cerrar la pestaña; al terminar, recarga para ver los datos.
            </span>
          )}

          {coverageLabel && !syncRunning && (
            <span className="text-slate-600" title="Rango de facturas disponibles">
              {coverageLabel}
            </span>
          )}

          {syncError && <span className="text-red-600 text-sm">{syncError}</span>}

          <span className="text-slate-500 text-sm">
            Primera vez: «Cargar datos históricos». Luego el sistema actualiza el día automáticamente.
          </span>

          {filterOptions?.itemDiagnostic &&
            filterOptions.itemDiagnostic.totalItems > 0 &&
            (filterOptions.itemDiagnostic.itemsWithBrand === 0 ||
              filterOptions.itemDiagnostic.itemsWithClass === 0) && (
              <span className="block text-amber-700 text-sm">
                Para que los filtros de marca y clase muestren opciones, los datos deben incluir marca y clase.
                Actualmente {filterOptions.itemDiagnostic.itemsWithBrand.toLocaleString("es-CO")} de{" "}
                {filterOptions.itemDiagnostic.totalItems.toLocaleString("es-CO")} registros tienen marca;{" "}
                {filterOptions.itemDiagnostic.itemsWithClass.toLocaleString("es-CO")} tienen clase. Contacta al
                administrador si los filtros no muestran datos.
              </span>
            )}
        </CardContent>
      </Card>
    </div>
  );
}
