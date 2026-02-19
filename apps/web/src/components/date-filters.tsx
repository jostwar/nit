"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FilterSelect } from "@/components/filter-select";
import { apiGet, apiPost } from "@/lib/api";
import { formatDateLocal } from "@/lib/utils";

function parseMultiParam(v: string | null): string[] {
  if (!v || !v.trim()) return [];
  return v.split(",").map((s) => s.trim()).filter(Boolean);
}

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
      vendor: parseMultiParam(searchParams.get("vendor")),
      brand: parseMultiParam(searchParams.get("brand")),
      class: parseMultiParam(searchParams.get("class")),
      customer: parseMultiParam(searchParams.get("customer")),
    };
  }, [searchParams, today, defaultFrom]);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [compareFrom, setCompareFrom] = useState(initial.compareFrom);
  const [compareTo, setCompareTo] = useState(initial.compareTo);
  const [vendor, setVendor] = useState<string[]>(initial.vendor);
  const [brand, setBrand] = useState<string[]>(initial.brand);
  const [classFilter, setClassFilter] = useState<string[]>(initial.class);
  const [customer, setCustomer] = useState<string[]>(initial.customer);

  // Mantener filtros en sync con la URL (p. ej. al volver atrás o al cargar con query)
  useEffect(() => {
    setFrom(initial.from);
    setTo(initial.to);
    setCompareFrom(initial.compareFrom);
    setCompareTo(initial.compareTo);
    setVendor(initial.vendor);
    setBrand(initial.brand);
    setClassFilter(initial.class);
    setCustomer(initial.customer);
  }, [initial.from, initial.to, initial.compareFrom, initial.compareTo, initial.vendor, initial.brand, initial.class, initial.customer]);

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
    customers?: Array<{ value: string; label: string }>;
    itemDiagnostic?: {
      totalItems: number;
      itemsWithBrand: number;
      itemsWithClass: number;
    };
  } | null>(null);
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");
  const [customerSearchResults, setCustomerSearchResults] = useState<Array<{ value: string; label: string }>>([]);
  const [customerSearchLoading, setCustomerSearchLoading] = useState(false);
  const customerSearchRef = useRef(0);
  const handleCustomerSearch = useCallback(
    (query: string) => {
      setCustomerSearchQuery(query);
      if (!query.trim()) {
        setCustomerSearchResults([]);
        return;
      }
      const id = ++customerSearchRef.current;
      setCustomerSearchLoading(true);
      const params = new URLSearchParams();
      params.set("search", query.trim());
      params.set("from", from);
      params.set("to", to);
      params.set("limit", "150");
      apiGet<Array<{ id: string; name: string; nit?: string }>>(`/customers?${params.toString()}`)
        .then((data) => {
          if (customerSearchRef.current !== id) return;
          setCustomerSearchResults(
            (data ?? []).map((c) => ({
              value: c.id,
              label: (c.name && c.name.trim()) || c.nit || c.id,
            })),
          );
        })
        .catch(() => {
          if (customerSearchRef.current !== id) return;
          setCustomerSearchResults([]);
        })
        .finally(() => {
          if (customerSearchRef.current !== id) return;
          setCustomerSearchLoading(false);
        });
    },
    [from, to],
  );
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
    if (vendor.length > 0) {
      params.set("vendor", vendor.join(","));
    } else {
      params.delete("vendor");
    }
    if (brand.length > 0) {
      params.set("brand", brand.join(","));
    } else {
      params.delete("brand");
    }
    if (classFilter.length > 0) {
      params.set("class", classFilter.join(","));
    } else {
      params.delete("class");
    }
    if (customer.length > 0) {
      params.set("customer", customer.join(","));
    } else {
      params.delete("customer");
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
    if (vendor.length > 0) params.set("vendor", vendor.join(","));
    else params.delete("vendor");
    if (brand.length > 0) params.set("brand", brand.join(","));
    else params.delete("brand");
    if (classFilter.length > 0) params.set("class", classFilter.join(","));
    else params.delete("class");
    if (customer.length > 0) params.set("customer", customer.join(","));
    else params.delete("customer");
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
      apiGet<{ cities: string[]; vendors: string[]; brands: string[]; classes: string[]; customers?: Array<{ value: string; label: string }> }>("/dashboard/filter-options"),
      apiGet<{ brands: string[] }>("/source/inventory-brands").catch(() => ({ brands: [] })),
    ])
      .then(([opts, brandsRes]) =>
        setFilterOptions({
          cities: opts.cities ?? [],
          vendors: opts.vendors ?? [],
          brands: (opts.brands ?? []).length > 0 ? opts.brands ?? [] : (brandsRes.brands ?? []),
          classes: opts.classes ?? [],
          customers: opts.customers ?? [],
          itemDiagnostic: (opts as { itemDiagnostic?: { totalItems: number; itemsWithBrand: number; itemsWithClass: number } }).itemDiagnostic,
        }),
      )
      .catch(() => setFilterOptions({ cities: [], vendors: [], brands: [], classes: [], customers: [] }));
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

  const inputClass =
    "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm transition focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200";

  return (
    <div className="flex flex-col gap-3 text-sm">
      {/* Bloque principal: título + período + filtros */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-col gap-0.5">
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Panel BI</h1>
          <p className="text-xs text-slate-500">Insights de ventas y cartera por cliente</p>
        </div>
        <div className="flex flex-wrap items-end gap-4">
          {/* Período */}
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Período</span>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={from}
                min={minDate}
                max={maxDate}
                onChange={(e) => setFrom(e.target.value)}
                className={inputClass}
                aria-label="Desde"
              />
              <span className="text-slate-400">–</span>
              <input
                type="date"
                value={to}
                min={minDate}
                max={maxDate}
                onChange={(e) => setTo(e.target.value)}
                className={inputClass}
                aria-label="Hasta"
              />
            </div>
          </div>
          <div className="h-8 w-px bg-slate-200" aria-hidden />
          {/* Vendedor, Marca, Clase: búsqueda y selección única o múltiple */}
          <FilterSelect
            label="Vendedor"
            options={filterOptions?.vendors ?? []}
            value={vendor}
            onChange={setVendor}
            placeholder="Todos"
            emptyLabel="Todos"
            multiple
          />
          <FilterSelect
            label="Marca"
            options={filterOptions?.brands ?? []}
            value={brand}
            onChange={setBrand}
            placeholder="Todas"
            emptyLabel="Todas"
            multiple
          />
          <FilterSelect
            label="Clase"
            options={filterOptions?.classes ?? []}
            value={classFilter}
            onChange={setClassFilter}
            placeholder="Todas"
            emptyLabel="Todas"
            multiple
          />
          <FilterSelect
            label="Cliente"
            options={customerSearchQuery ? customerSearchResults : (filterOptions?.customers ?? [])}
            value={customer}
            onChange={setCustomer}
            placeholder="Escriba para buscar"
            emptyLabel="Todos"
            multiple
            onSearchChange={handleCustomerSearch}
            searchLoading={customerSearchLoading}
          />
          <Button
            onClick={applyFilters}
            disabled={syncing}
            className="h-[2.625rem] shrink-0 bg-slate-800 px-5 text-sm font-medium text-white hover:bg-slate-700"
          >
            {syncing ? "Cargando…" : "Consultar"}
          </Button>
        </div>
        {/* Periodo a comparar (opcional) */}
        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3">
          <span className="text-xs text-slate-500">Comparar con otro período:</span>
          <input
            type="date"
            value={compareFrom}
            min={minDate}
            max={maxDate}
            onChange={(e) => setCompareFrom(e.target.value)}
            className={inputClass}
            aria-label="Comparar desde"
          />
          <input
            type="date"
            value={compareTo}
            min={minDate}
            max={maxDate}
            onChange={(e) => setCompareTo(e.target.value)}
            className={inputClass}
            aria-label="Comparar hasta"
          />
          <Button
            onClick={applyCompare}
            variant="outline"
            size="sm"
            className="border-slate-200 text-slate-700 hover:bg-slate-50"
          >
            Aplicar comparación
          </Button>
        </div>
      </div>
    </div>
  );
}