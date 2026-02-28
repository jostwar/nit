"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { apiPost, setTokens, setSavedLoginEmail, getSavedLoginEmail, clearSavedLoginEmail } from "@/lib/api";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const saved = getSavedLoginEmail();
    if (saved) {
      setEmail(saved);
      setRememberMe(true);
    }
  }, []);

  const handleLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      const response = await apiPost<{ accessToken: string; refreshToken: string }>(
        "/auth/login",
        { email, password },
      );
      setTokens(response.accessToken, response.refreshToken, rememberMe);
      if (rememberMe) setSavedLoginEmail(email);
      else clearSavedLoginEmail();
      router.push("/dashboard");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error al conectar";
      if (msg.includes("401") || msg.includes("Unauthorized") || msg.toLowerCase().includes("credential")) {
        setError("Correo o contraseña incorrectos.");
      } else if (msg.includes("fetch") || msg.includes("Failed to fetch") || msg.includes("NetworkError") || msg.includes("conectar")) {
        setError("No se pudo conectar. Comprueba tu conexión a internet o contacta al administrador.");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900">
      <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-8 shadow-xl">
        <div className="mb-6 flex justify-center">
          <Image src={(typeof process !== "undefined" && process.env.NEXT_PUBLIC_LOGO) || "/logo.png"} alt="NITIQ" width={140} height={42} priority className="h-10 w-auto object-contain" />
        </div>
        <h1 className="text-xl font-semibold text-slate-900">Ingresar</h1>
        <p className="mt-1 text-sm text-slate-500">Acceso a la plataforma</p>
        <div className="mt-6 space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-600">Email</label>
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              type="email"
              placeholder="admin@nitiq.local"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Password</label>
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              type="password"
              placeholder="••••••••"
            />
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(event) => setRememberMe(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            Recordarme (mantener sesión y recordar usuario)
          </label>
          {error && (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          )}
          <Button className="w-full" onClick={handleLogin} disabled={loading}>
            {loading ? "Validando..." : "Entrar"}
          </Button>
        </div>
        <div className="mt-6 border-t border-gray-100 pt-4 text-center">
          <p className="text-xs font-medium text-slate-500">BPI - Soluciones Empresariales</p>
          <p className="text-[10px] text-slate-400">Powered By iPeakAgency</p>
        </div>
      </div>
    </div>
  );
}
