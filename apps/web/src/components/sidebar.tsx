"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const navItems = [
  { key: "dashboard", href: "/dashboard", label: "Dashboard" },
  { key: "customers", href: "/customers", label: "Cliente 360" },
  { key: "alerts", href: "/alerts", label: "Alertas" },
  { key: "ai", href: "/ai", label: "AI Copilot" },
];

const adminItems = [
  { key: "adminUsers", href: "/admin/users", label: "Usuarios" },
  { key: "adminFilters", href: "/admin/filters", label: "Filtros de Apps" },
  { key: "adminReports", href: "/admin/reports", label: "Reportes de Ventas" },
];

const DEFAULT_FILTERS: Record<string, boolean> = {
  dashboard: true,
  customers: true,
  alerts: true,
  ai: true,
  adminUsers: true,
  adminFilters: true,
  adminReports: true,
};

export function Sidebar() {
  const [filters, setFilters] = useState<Record<string, boolean>>(DEFAULT_FILTERS);

  useEffect(() => {
    const raw = window.localStorage.getItem("appFilters");
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Record<string, boolean>;
      setFilters({ ...DEFAULT_FILTERS, ...parsed });
    } catch {
      setFilters(DEFAULT_FILTERS);
    }
  }, []);

  const visibleNav = navItems.filter((item) => filters[item.key] !== false);
  const visibleAdmin = adminItems.filter((item) => filters[item.key] !== false);

  return (
    <aside className="flex h-screen w-64 flex-col gap-6 border-r border-slate-200 bg-white px-6 py-8">
      <div className="text-xl font-semibold tracking-tight text-slate-900">
        NITIQ
      </div>
      <nav className="flex flex-col gap-2 text-sm text-slate-600">
        {visibleNav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-md px-3 py-2 transition hover:bg-slate-100 hover:text-slate-900"
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="mt-6 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Administración
      </div>
      <nav className="flex flex-col gap-2 text-sm text-slate-600">
        {visibleAdmin.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-md px-3 py-2 transition hover:bg-slate-100 hover:text-slate-900"
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="mt-auto text-xs text-slate-400">Multi-tenant BI</div>
    </aside>
  );
}
