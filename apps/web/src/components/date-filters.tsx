"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { apiGet, apiPost } from "@/lib/api";

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
      city: searchParams.get("city") ?? "",
      vendor: searchParams.get("vendor") ?? "",
      brand: searchParams.get("brand") ?? "",
    };
  }, [searchParams, today, defaultFrom]);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [compareFrom, setCompareFrom] = useState(initial.compareFrom);
  const [compareTo, setCompareTo] = useState(initial.compareTo);
  const [city, setCity] = useState(initial.city);
  const [vendor, setVendor] = useState(initial.vendor);
  const [brand, setBrand] = useState(initial.brand);

  // Mantener filtros en sync con la URL (p. ej. al volver atrás o al cargar con query)
  useEffect(() => {
    setFrom(initial.from);
    setTo(initial.to);
    setCompareFrom(initial.compareFrom);
    setCompareTo(initial.compareTo);
    setCity(initial.city);
    setVendor(initial.vendor);
    setBrand(initial.brand);
  }, [initial.from, initial.to, initial.compareFrom, initial.compareTo, initial.city, initial.vendor, initial.brand]);
  const [compareEnabled, setCompareEnabled] = useState(
    Boolean(searchParams.get("compareFrom") || searchParams.get("compareTo")),
  );
  const [syncing, setSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [syncRunning, setSyncRunning] = useState(false);
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
  } | null>(null);
  const lastSyncLabel = useMemo(() => {
    if (!lastSyncedAt) return "Última sincronización: pendiente";
    const parsed = new Date(lastSyncedAt);
    if (Number.isNaN(parsed.getTime())) return "Última sincronización: pendiente";
    return `Última sincronización: ${parsed.toLocaleString("es-CO")}`;
  }, [lastSyncedAt]);
  const coverageLabel = useMemo(() => {
    if (!dataCoverage) return null;
    if (dataCoverage.totalInvoices === 0) return "Sin datos de ventas";
    const fmt = (d: string) =>
      new Date(d).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
    return `Datos: ${dataCoverage.earliestDate ? fmt(dataCoverage.earliestDate) : "?"} – ${dataCoverage.latestDate ? fmt(dataCoverage.latestDate) : "?"} (${dataCoverage.totalInvoices.toLocaleString("es-CO")} facturas)`;
  }, [dataCoverage]);

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
    if (city.trim()) {
      params.set("city", city.trim());
    } else {
      params.delete("city");
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
    const compareDefaults = computeCompareRange(from, to);
    setCompareFrom(compareDefaults.compareFrom);
    setCompareTo(compareDefaults.compareTo);
    setCompareEnabled(true);
    updateQuery(true);
  };

  const runSyncNow = async (useRange = false) => {
    setSyncError(null);
    setSyncRunning(true);
    const fromParam = useRange ? from : today;
    const toParam = useRange ? to : today;
    const fromDate = new Date(fromParam);
    const toDate = new Date(toParam);
    const days = Math.max(0, Math.ceil((toDate.getTime() - fromDate.getTime()) / (24 * 60 * 60 * 1000)) + 1);
    const safetyMs = useRange && days > 31 ? 600_000 : 120_000; // 10 min para rango largo, 2 min para "hoy"
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
      setSyncError(err instanceof Error ? err.message : "Error al sincronizar");
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

  useEffect(() => {
    apiGet<{ cities: string[]; vendors: string[]; brands: string[] }>("/dashboard/filter-options")
      .then(setFilterOptions)
      .catch(() => setFilterOptions({ cities: [], vendors: [], brands: [] }));
  }, []);

  useEffect(() => {
    let mounted = true;
    let wasRunning = false;
    const fetchStatus = async () => {
      try {
        const status = await apiGet<{
          running: boolean;
          lastSyncedAt: string | null;
          dataCoverage?: { earliestDate: string | null; latestDate: string | null; totalInvoices: number };
        }>("/source/sync/status");
        if (!mounted) return;
        if (wasRunning && !status.running) {
          window.dispatchEvent(new CustomEvent("sync-completed"));
        }
        wasRunning = status.running;
        setSyncRunning(status.running);
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
    <div className="flex flex-col gap-3 text-xs text-slate-600">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2">
          Desde
          <input
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            className="rounded-md border border-slate-200 px-2 py-1 text-xs"
          />
        </label>
        <label className="flex items-center gap-2">
          Hasta
          <input
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className="rounded-md border border-slate-200 px-2 py-1 text-xs"
          />
        </label>
        <label className="flex items-center gap-2">
          Ciudad
          <select
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="min-w-[7rem] cursor-pointer rounded-md border border-slate-300 bg-white px-2 py-1.5 pr-7 text-xs shadow-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
          >
            <option value="">Todas</option>
            {(filterOptions?.cities ?? []).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
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
        <Button onClick={applyFilters} className="h-8 px-3 text-xs" disabled={syncing}>
          {syncing ? "Cargando…" : "Consultar"}
        </Button>
        <Button
          type="button"
          onClick={() => runSyncNow(false)}
          disabled={syncRunning}
          className="h-8 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
          title="Actualizar facturas del día actual desde el ERP"
        >
          {syncRunning ? "Sincronizando…" : "Actualizar hoy"}
        </Button>
        <Button
          type="button"
          onClick={() => runSyncNow(true)}
          disabled={syncRunning}
          className="h-8 px-3 text-xs border border-emerald-600 text-emerald-700 bg-white hover:bg-emerald-50"
          title="Sincronizar todo el rango (Desde–Hasta). Puede tardar varios minutos si el rango es largo."
        >
          Sincronizar rango
        </Button>
        <span className="text-slate-500">
          {syncRunning
            ? "Sincronizando… (puede tardar varios min; al terminar se actualiza solo)"
            : lastSyncLabel}
        </span>
        {coverageLabel && (
          <span className="text-slate-400" title="Rango de facturas disponibles en el sistema">
            {coverageLabel}
          </span>
        )}
        {syncError && <span className="text-red-600 text-xs">{syncError}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-slate-400">Comparar</span>
        <label className="flex items-center gap-2">
          Desde
          <input
            type="date"
            value={compareFrom}
            onChange={(event) => setCompareFrom(event.target.value)}
            className="rounded-md border border-slate-200 px-2 py-1 text-xs"
          />
        </label>
        <label className="flex items-center gap-2">
          Hasta
          <input
            type="date"
            value={compareTo}
            onChange={(event) => setCompareTo(event.target.value)}
            className="rounded-md border border-slate-200 px-2 py-1 text-xs"
          />
        </label>
        <Button
          onClick={applyCompare}
          className="h-8 px-3 text-xs border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
        >
          Comparar
        </Button>
      </div>
    </div>
  );
}