"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { apiGet, apiPost } from "@/lib/api";
import { formatDateLocal } from "@/lib/utils";

export function DateFilters() {
  const today = new Date().toISOString().slice(0, 10);
  const router = useRouter();
  const searchParams = useSearchParams();
  const computeCompareRange = (fromValue: string, toValue: string) => {
    const fromDate = new Date(fromValue);
    const toDate = new Date(toValue);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      return { compareFrom: today, compareTo: today };
    }
    const diff = toDate.getTime() - fromDate.getTime();
    const prevTo = new Date(fromDate.getTime());
    const prevFrom = new Date(fromDate.getTime() - diff);
    return {
      compareFrom: prevFrom.toISOString().slice(0, 10),
      compareTo: prevTo.toISOString().slice(0, 10),
    };
  };
  const defaultFrom = useMemo(
    () => new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    [],
  );
  const initial = useMemo(() => {
    const from = searchParams.get("from") ?? defaultFrom;
    const to = searchParams.get("to") ?? today;
    const compareDefaults = computeCompareRange(from, to);
    return {
      from,
      to,
      compareFrom: searchParams.get("compareFrom") ?? compareDefaults.compareFrom,
      compareTo: searchParams.get("compareTo") ?? compareDefaults.compareTo,
      vendor: searchParams.get("vendor") ?? "",
      brand: searchParams.get("brand") ?? "",
      class: searchParams.get("class") ?? "",
    };
  }, [searchParams, today, defaultFrom]);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [compareFrom, setCompareFrom] = useState(initial.compareFrom);
  const [compareTo, setCompareTo] = useState(initial.compareTo);
  const [vendor, setVendor] = useState(initial.vendor);
  const [brand, setBrand] = useState(initial.brand);
  const [classFilter, setClassFilter] = useState(initial.class);

  // Mantener filtros en sync con la URL (p. ej. al volver atrás o al cargar con query)
  useEffect(() => {
    setFrom(initial.from);
    setTo(initial.to);
    setCompareFrom(initial.compareFrom);
    setCompareTo(initial.compareTo);
    setVendor(initial.vendor);
    setBrand(initial.brand);
    setClassFilter(initial.class);
  }, [initial.from, initial.to, initial.compareFrom, initial.compareTo, initial.vendor, initial.brand, initial.class]);

  // Mantener URL en sync con Desde/Hasta para que "Rango aplicado" coincida siempre con el filtro
  useEffect(() => {
    const currentFrom = searchParams.get("from");
    const currentTo = searchParams.get("to");
    if (from && to && (from !== currentFrom || to !== currentTo)) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("from", from);
      params.set("to", to);
      router.replace(`?${params.toString()}`, { scroll: false });
    }
  }, [from, to, router, searchParams]);

  const [compareEnabled, setCompareEnabled] = useState(
    Boolean(searchParams.get("compareFrom") || searchParams.get("compareTo")),
  );
  const [syncing, setSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [syncRunning, setSyncRunning] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{
    percent: number;
    stage: string;
    current: number;
    total: number;
  } | null>(null);
  const [syncLongRunningHint, setSyncLongRunningHint] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [dataCoverage, setDataCoverage] = useState<{
    earliestDate: string | null;
    latestDate: string | null;
    totalInvoices: number;
  } | null>(null);
  const [filterOptions, setFilterOptions] = useState<{
    cities: string[];
    vendors: string[];
    brands: string[];
    classes: string[];
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

  /** Fechas permitidas en el calendario: desde el primer dato disponible (o 2024) hasta hoy */
  const minDate = dataCoverage?.earliestDate?.slice(0, 10) ?? "2024-01-01";
  const maxDate = today;

  const updateQuery = (enableCompare: boolean) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("from", from);
    params.set("to", to);
    if (enableCompare) {
      params.set("compareFrom", compareFrom);
      params.set("compareTo", compareTo);
    } else {
      params.delete("compareFrom");
      params.delete("compareTo");
    }
    if (vendor.trim()) {
      params.set("vendor", vendor.trim());
    } else {
      params.delete("vendor");
    }
    if (brand.trim()) {
      params.set("brand", brand.trim());
    } else {
      params.delete("brand");
    }
    if (classFilter.trim()) {
      params.set("class", classFilter.trim());
    } else {
      params.delete("class");
    }
    router.replace(`?${params.toString()}`);
  };

  const applyFilters = () => {
    setSyncing(true);
    updateQuery(compareEnabled);
    const onDone = () => setSyncing(false);
    const fallback = window.setTimeout(onDone, 15000);
    window.addEventListener("dashboard-loading-end", () => {
      window.clearTimeout(fallback);
      onDone();
    }, { once: true });
  };

  const applyCompare = () => {
    let cf = compareFrom.trim();
    let ct = compareTo.trim();
    if (!cf || !ct) {
      const compareDefaults = computeCompareRange(from, to);
      cf = compareDefaults.compareFrom;
      ct = compareDefaults.compareTo;
      setCompareFrom(cf);
      setCompareTo(ct);
    }
    setCompareEnabled(true);
    const params = new URLSearchParams(searchParams.toString());
    params.set("from", from);
    params.set("to", to);
    params.set("compareFrom", cf);
    params.set("compareTo", ct);
    if (vendor.trim()) params.set("vendor", vendor.trim());
    else params.delete("vendor");
    if (brand.trim()) params.set("brand", brand.trim());
    else params.delete("brand");
    if (classFilter.trim()) params.set("class", classFilter.trim());
    else params.delete("class");
    router.replace(`?${params.toString()}`);
  };

  const historicalFrom = "2024-01-01";

  const runSyncNow = async (mode: "today" | "historical" | "range") => {
    setSyncError(null);
    setSyncRunning(true);
    const fromParam =
      mode === "today" ? today : mode === "historical" ? historicalFrom : from;
    const toParam = mode === "today" || mode === "historical" ? today : to;
    const safetyMs =
      mode === "historical" || mode === "range" ? 900_000 : 300_000; // 15 min histórico/rango, 5 min hoy
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
        // ya hay un sync en curso; el polling actualizará
      }
      window.addEventListener(
        "sync-completed",
        () => {
          clearSafety();
        },
        { once: true },
      );
    } catch (err) {
      clearSafety();
      setSyncRunning(false);
      setSyncError(err instanceof Error ? err.message : "Error al actualizar los datos");
    }
  };

  // Si la URL no tiene from/to, escribir defaults para que el dashboard cargue con un rango claro
  useEffect(() => {
    if (!searchParams.get("from") && !searchParams.get("to")) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("from", defaultFrom);
      params.set("to", today);
      router.replace(`?${params.toString()}`);
    }
  }, [defaultFrom, today, router, searchParams]);

  const fetchFilterOptions = () => {
    Promise.all([
      apiGet<{ cities: string[]; vendors: string[]; brands: string[]; classes: string[] }>("/dashboard/filter-options"),
      apiGet<{ brands: string[] }>("/source/inventory-brands").catch(() => ({ brands: [] })),
    ])
      .then(([opts, brandsRes]) =>
        setFilterOptions({
          cities: opts.cities ?? [],
          vendors: opts.vendors ?? [],
          brands: (opts.brands ?? []).length > 0 ? opts.brands ?? [] : (brandsRes.brands ?? []),
          classes: opts.classes ?? [],
          itemDiagnostic: (opts as { itemDiagnostic?: { totalItems: number; itemsWithBrand: number; itemsWithClass: number } }).itemDiagnostic,
        }),
      )
      .catch(() => setFilterOptions({ cities: [], vendors: [], brands: [], classes: [] }));
  };

  useEffect(() => {
    fetchFilterOptions();
  }, []);

  useEffect(() => {
    const onSyncCompleted = () => {
      fetchFilterOptions();
    };
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

  useEffect(() => {
    let mounted = true;
    let wasRunning = false;
    const fetchStatus = async () => {
      try {
        const status = await apiGet<{
          running: boolean;
          lastSyncedAt: string | null;
          dataCoverage?: { earliestDate: string | null; latestDate: string | null; totalInvoices: number };
          progress?: { percent: number; stage: string; current: number; total: number } | null;
        }>("/source/sync/status");
        if (!mounted) return;
        if (wasRunning && !status.running) {
          window.dispatchEvent(new CustomEvent("sync-completed"));
        }
        wasRunning = status.running;
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

  return (
    <div className="flex flex-col gap-4 text-xs text-slate-600">
      {/* Filtros: período principal y consulta */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-medium text-slate-700">Período principal</span>
        <label className="flex items-center gap-2">
          Desde
          <input
            type="date"
            value={from}
            min={minDate}
            max={maxDate}
            onChange={(event) => setFrom(event.target.value)}
            className="rounded-md border border-slate-200 px-2 py-1.5 text-xs"
          />
        </label>
        <label className="flex items-center gap-2">
          Hasta
          <input
            type="date"
            value={to}
            min={minDate}
            max={maxDate}
            onChange={(event) => setTo(event.target.value)}
            className="rounded-md border border-slate-200 px-2 py-1.5 text-xs"
          />
        </label>
        <label className="flex items-center gap-2">
          Vendedor
          <select
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
            className="min-w-[8rem] cursor-pointer rounded-md border border-slate-300 bg-white px-2 py-1.5 pr-7 text-xs shadow-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
          >
            <option value="">Todos</option>
            {(filterOptions?.vendors ?? []).map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          Marca
          <select
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            className="min-w-[7rem] cursor-pointer rounded-md border border-slate-300 bg-white px-2 py-1.5 pr-7 text-xs shadow-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
          >
            <option value="">Todas</option>
            {(filterOptions?.brands ?? []).map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          Clase
          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            className="min-w-[7rem] cursor-pointer rounded-md border border-slate-300 bg-white px-2 py-1.5 pr-7 text-xs shadow-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
          >
            <option value="">Todas</option>
            {(filterOptions?.classes ?? []).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <Button onClick={applyFilters} className="h-8 px-4 text-xs" disabled={syncing}>
          {syncing ? "Cargando…" : "Consultar"}
        </Button>
      </div>

      {/* Periodo a comparar (opcional) */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-medium text-slate-700">Periodo a comparar</span>
        <span className="text-slate-500">(opcional: otro rango para ver variación)</span>
        <label className="flex items-center gap-2">
          Desde
          <input
            type="date"
            value={compareFrom}
            min={minDate}
            max={maxDate}
            onChange={(event) => setCompareFrom(event.target.value)}
            className="rounded-md border border-slate-200 px-2 py-1.5 text-xs"
          />
        </label>
        <label className="flex items-center gap-2">
          Hasta
          <input
            type="date"
            value={compareTo}
            min={minDate}
            max={maxDate}
            onChange={(event) => setCompareTo(event.target.value)}
            className="rounded-md border border-slate-200 px-2 py-1.5 text-xs"
          />
        </label>
        <Button
          onClick={applyCompare}
          className="h-8 px-3 text-xs border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
        >
          Aplicar comparación
        </Button>
      </div>
    </div>
  );
}