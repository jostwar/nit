"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { apiPost } from "@/lib/api";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async () => {
    setLoading(true);
    try {
      const response = await apiPost<{ accessToken: string; refreshToken: string }>(
        "/auth/login",
        { email, password },
      );
      window.localStorage.setItem("accessToken", response.accessToken);
      window.localStorage.setItem("refreshToken", response.refreshToken);
      router.push("/dashboard");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Ingresar</h1>
        <p className="mt-1 text-sm text-slate-500">Acceso a NITIQ</p>
        <div className="mt-6 space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-600">Email</label>
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              type="email"
              placeholder="admin@nitiq.local"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Password</label>
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              type="password"
              placeholder="••••••••"
            />
          </div>
          <Button className="w-full" onClick={handleLogin} disabled={loading}>
            {loading ? "Validando..." : "Entrar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
