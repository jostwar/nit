"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";

export type SortDir = "asc" | "desc";

export function useTableSort<T>(
  data: T[],
  options?: { defaultKey?: keyof T | string; defaultDir?: SortDir }
) {
  const [state, setState] = useState<{
    sortKey: keyof T | string | null;
    sortDir: SortDir;
  }>({
    sortKey: options?.defaultKey ?? null,
    sortDir: options?.defaultDir ?? "asc",
  });

  const setSort = (key: keyof T | string) => {
    setState((prev) => ({
      sortKey: key,
      sortDir:
        prev.sortKey === key
          ? prev.sortDir === "asc"
            ? "desc"
            : "asc"
          : "asc",
    }));
  };

  const sortKey = state.sortKey;
  const sortDir = state.sortDir;

  const sortedData = useMemo(() => {
    if (!sortKey || !Array.isArray(data)) return data;
    const sorted = [...data].sort((a, b) => {
      const rawA = (a as Record<string, unknown>)[sortKey as string];
      const rawB = (b as Record<string, unknown>)[sortKey as string];
      const va = rawA ?? "";
      const vb = rawB ?? "";
      if (va === vb) return 0;
      let cmp: number;
      if (typeof va === "number" && typeof vb === "number") {
        cmp = va - vb;
      } else {
        try {
          cmp = String(va).localeCompare(String(vb), "es");
        } catch {
          cmp = String(va).localeCompare(String(vb));
        }
      }
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
