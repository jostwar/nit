"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";

export type SortDir = "asc" | "desc";

export function useTableSort<T>(
  data: T[],
  options?: { defaultKey?: keyof T | string; defaultDir?: SortDir }
) {
  const [sortKey, setSortKey] = useState<keyof T | string | null>(
    options?.defaultKey ?? null
  );
  const [sortDir, setSortDir] = useState<SortDir>(options?.defaultDir ?? "asc");

  const setSort = (key: keyof T | string) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return key;
      }
      setSortDir("asc");
      return key;
    });
  };

  const sortedData = useMemo(() => {
    if (!sortKey || !Array.isArray(data)) return data;
    const sorted = [...data].sort((a, b) => {
      const rawA = (a as Record<string, unknown>)[sortKey as string];
      const rawB = (b as Record<string, unknown>)[sortKey as string];
      const va = rawA ?? "";
      const vb = rawB ?? "";
      if (va === vb) return 0;
      const cmp =
        typeof va === "number" && typeof vb === "number"
          ? va - vb
          : String(va).localeCompare(String(vb), "es");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [data, sortKey, sortDir]);

  return { sortKey, sortDir, setSort, sortedData };
}

type TableThSortProps = {
  sortKey: string;
  currentKey: string | null;
  dir: SortDir;
  setSort: (key: string) => void;
  label: ReactNode;
  thClassName?: string;
  align?: "left" | "right";
};

export function TableThSort({
  sortKey,
  currentKey,
  dir,
  setSort,
  label,
  thClassName = "",
  align = "left",
}: TableThSortProps) {
  const isActive = currentKey === sortKey;
  return (
    <th className={thClassName}>
      <button
        type="button"
        onClick={() => setSort(sortKey)}
        className={`flex w-full items-center font-medium hover:text-slate-800 ${align === "right" ? "justify-end" : "justify-start"}`}
      >
        {label}
        <span className="ml-1 text-slate-400">
          {!isActive ? "↕" : dir === "asc" ? "↑" : "↓"}
        </span>
      </button>
    </th>
  );
}
