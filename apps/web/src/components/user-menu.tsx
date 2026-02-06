"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet, clearTokens } from "@/lib/api";

type CurrentUser = {
  email: string;
  role: string;
  tenantId: string;
};

export function UserMenu() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    apiGet<CurrentUser>("/me").then(setUser).catch(() => setUser(null));
  }, []);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("click", onClick);
    return () => window.removeEventListener("click", onClick);
  }, [open]);

  const initials = useMemo(() => {
    const base = user?.email ?? "Usuario";
    const parts = base.split(/[@.]/).filter(Boolean);
    const value = parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
    return value || "U";
  }, [user?.email]);

  const handleLogout = () => {
    clearTokens();
    router.replace("/login");
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 shadow-sm"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-[11px] font-semibold text-white">
          {initials}
        </span>
        <span className="hidden text-xs text-slate-600 md:inline">
          {user?.email ?? "Usuario"}
        </span>
        <span className="text-slate-400">▾</span>
      </button>

      {open ? (
        <div className="absolute right-0 z-20 mt-2 w-60 rounded-xl border border-slate-200 bg-white p-2 text-sm shadow-lg">
          <div className="px-3 py-2 text-xs text-slate-500">
            {user?.role ?? "Cuenta"}
          </div>
          <div className="px-3 py-1 text-[10px] text-slate-400" title="Para verificar que el deploy aplicó">
            Build: {typeof process.env.NEXT_PUBLIC_BUILD_ID !== "undefined" ? process.env.NEXT_PUBLIC_BUILD_ID : "?"}
          </div>
          <div className="border-t border-slate-100" />
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              router.push("/admin/users");
            }}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
          >
            Agregar nuevo usuario
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              router.push("/admin/filters");
            }}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
          >
            Configuraciones
          </button>
          <div className="border-t border-slate-100" />
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
          >
            Salir
          </button>
        </div>
      ) : null}
    </div>
  );
}
