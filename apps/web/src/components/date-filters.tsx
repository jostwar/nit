"use client";

import { useState } from "react";

export function DateFilters() {
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [compareFrom, setCompareFrom] = useState(today);
  const [compareTo, setCompareTo] = useState(today);

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
    </div>
  );
}
