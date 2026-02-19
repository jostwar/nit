"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type FilterOption = string | { value: string; label: string };

type FilterSelectProps = {
  options: FilterOption[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder: string;
  label: string;
  multiple?: boolean;
  emptyLabel?: string;
  className?: string;
  /** Llamado al escribir en la búsqueda (con debounce). Útil para cargar opciones desde el servidor. */
  onSearchChange?: (query: string) => void;
  /** Muestra "Buscando…" en la lista cuando las opciones se cargan en el servidor. */
  searchLoading?: boolean;
};

function normalizeOptions(opts: FilterOption[]): { value: string; label: string }[] {
  return opts.map((o) =>
    typeof o === "string" ? { value: o, label: o } : { value: o.value, label: o.label || o.value },
  );
}

export function FilterSelect({
  options,
  value,
  onChange,
  placeholder,
  label,
  multiple = true,
  emptyLabel = "Todos",
  className,
  onSearchChange,
  searchLoading = false,
}: FilterSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const optionsNorm = useMemo(() => normalizeOptions(options), [options]);

  useEffect(() => {
    if (onSearchChange == null) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onSearchChange(search.trim());
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search, onSearchChange]);

  const filtered = useMemo(() => {
    if (onSearchChange) {
      return optionsNorm;
    }
    const q = search.trim().toLowerCase();
    if (!q) return optionsNorm;
    return optionsNorm.filter(
      (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q),
    );
  }, [optionsNorm, search, onSearchChange]);

  const displayText = useMemo(() => {
    if (value.length === 0) return emptyLabel;
    if (value.length === 1) {
      const found = optionsNorm.find((o) => o.value === value[0]);
      return found ? found.label : value[0];
    }
    return `${value.length} seleccionados`;
  }, [value, emptyLabel, optionsNorm]);

  const toggle = useCallback(
    (optionValue: string) => {
      if (multiple) {
        if (value.includes(optionValue)) {
          onChange(value.filter((v) => v !== optionValue));
        } else {
          onChange([...value, optionValue]);
        }
      } else {
        onChange(value.includes(optionValue) ? [] : [optionValue]);
        setOpen(false);
      }
    },
    [multiple, value, onChange],
  );

  const clear = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onChange([]);
      if (!multiple) setOpen(false);
    },
    [onChange, multiple],
  );

  useEffect(() => {
    const onOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener("mousedown", onOutside);
      return () => document.removeEventListener("mousedown", onOutside);
    }
  }, [open]);

  return (
    <div ref={containerRef} className={cn("relative min-w-[10rem]", className)}>
      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</span>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="mt-1 flex w-full min-w-[8rem] cursor-pointer items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-800 shadow-sm transition focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 hover:border-slate-300"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={cn("truncate", value.length === 0 && "text-slate-500")}>
          {displayText}
        </span>
        {value.length > 0 && (
          <span
            role="button"
            tabIndex={-1}
            onClick={clear}
            onKeyDown={(e) => e.key === "Enter" && clear(e as unknown as React.MouseEvent)}
            className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Limpiar"
          >
            ×
          </span>
        )}
      </button>
      {open && (
        <div
          className="absolute top-full left-0 z-50 mt-1 max-h-64 w-full min-w-[12rem] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg"
          role="listbox"
        >
          <div className="border-b border-slate-100 p-1.5">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar…"
              className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-slate-400"
              autoFocus
              onKeyDown={(e) => e.stopPropagation()}
            />
          </div>
          <ul className="max-h-52 overflow-y-auto py-1">
            {searchLoading ? (
              <li className="flex items-center gap-2 px-3 py-3 text-sm text-slate-500">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
                Buscando…
              </li>
            ) : filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-slate-500">Sin resultados</li>
            ) : (
              filtered.map((opt) => (
                <li key={opt.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={value.includes(opt.value)}
                    onClick={() => toggle(opt.value)}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-slate-50",
                      value.includes(opt.value) && "bg-slate-100 font-medium",
                    )}
                  >
                    {multiple && (
                      <span
                        className={cn(
                          "flex h-4 w-4 shrink-0 items-center justify-center rounded border text-xs",
                          value.includes(opt.value)
                            ? "border-slate-700 bg-slate-700 text-white"
                            : "border-slate-300",
                        )}
                      >
                        {value.includes(opt.value) ? "✓" : ""}
                      </span>
                    )}
                    <span className="truncate">{opt.label}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
