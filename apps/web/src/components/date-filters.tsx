"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { apiPost } from "@/lib/api";

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
  const initial = useMemo(() => {
    const defaultFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const from = searchParams.get("from") ?? defaultFrom;
    const to = searchParams.get("to") ?? today;
    const compareDefaults = computeCompareRange(from, to);
    return {
      from,
      to,
      compareFrom: searchParams.get("compareFrom") ?? compareDefaults.compareFrom,
      compareTo: searchParams.get("compareTo") ?? compareDefaults.compareTo,
    };
  }, [searchParams, today]);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [compareFrom, setCompareFrom] = useState(initial.compareFrom);
  const [compareTo, setCompareTo] = useState(initial.compareTo);
  const [compareEnabled, setCompareEnabled] = useState(
    Boolean(searchParams.get("compareFrom") || searchParams.get("compareTo")),
  );
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    router.replace(`?${params.toString()}`);
  };

  const applyFilters = async () => {
    setSyncing(true);
    setError(null);
    try {
      await apiPost(
        "/source/sync",
        {
          from,
          to,
          page: 1,
          pageSize: 1000,
        },
        { timeoutMs: 20000 },
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setError("La sincronización sigue en segundo plano. Revisa en unos minutos.");
      } else {
        setError("No se pudo sincronizar el rango seleccionado.");
      }
    } finally {
      updateQuery(compareEnabled);
      setSyncing(false);
    }
  };

  const applyCompare = () => {
    const compareDefaults = computeCompareRange(from, to);
    setCompareFrom(compareDefaults.compareFrom);
    setCompareTo(compareDefaults.compareTo);
    setCompareEnabled(true);
    updateQuery(true);
  };

  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
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
      <Button onClick={applyFilters} className="h-8 px-3 text-xs" disabled={syncing}>
        {syncing ? "Sincronizando..." : "Consultar"}
      </Button>
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
      {error ? <span className="text-xs text-rose-500">{error}</span> : null}
    </div>
  );
}