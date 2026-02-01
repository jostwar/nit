"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { apiPost } from "@/lib/api";

export function DateFilters() {
  const today = new Date().toISOString().slice(0, 10);
  const router = useRouter();
  const searchParams = useSearchParams();
  const initial = useMemo(
    () => ({
      from: searchParams.get("from") ?? today,
      to: searchParams.get("to") ?? today,
      compareFrom: searchParams.get("compareFrom") ?? today,
      compareTo: searchParams.get("compareTo") ?? today,
    }),
    [searchParams, today],
  );
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [compareFrom, setCompareFrom] = useState(initial.compareFrom);
  const [compareTo, setCompareTo] = useState(initial.compareTo);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyFilters = async () => {
    setSyncing(true);
    setError(null);
    try {
      await apiPost("/source/sync", {
        from,
        to,
        page: 1,
        pageSize: 1000,
      });
    } catch {
      setError("No se pudo sincronizar el rango seleccionado.");
    } finally {
      const params = new URLSearchParams(searchParams.toString());
      params.set("from", from);
      params.set("to", to);
      params.set("compareFrom", compareFrom);
      params.set("compareTo", compareTo);
      router.replace(`?${params.toString()}`);
      setSyncing(false);
    }
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
      <Button onClick={applyFilters} className="h-8 px-3 text-xs" disabled={syncing}>
        {syncing ? "Sincronizando..." : "Aplicar"}
      </Button>
      {error ? <span className="text-xs text-rose-500">{error}</span> : null}
    </div>
  );
}
