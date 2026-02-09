"use client";

import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiUploadFile } from "@/lib/api";

type UploadResult = {
  count?: number;
  duplicateRefsLogged?: number;
  message?: string;
  error?: string;
};

export default function AdminCatalogPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    setFile(f ?? null);
    setResult(null);
  };

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setResult(null);
    try {
      const data = await apiUploadFile<UploadResult>(
        "/source/inventory-directory/upload",
        file,
      );
      setResult(data);
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
    } catch (err) {
      setResult({
        error: err instanceof Error ? err.message : "Error al subir el archivo",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Catálogo de referencias (REFER → Marca / Clase)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-slate-600">
          <p>
            Sube un CSV con columnas <strong>REFERENCIA</strong>,{" "}
            <strong>Nombre MARCA</strong> y <strong>Nombre CLASE</strong> para
            que las ventas se enriquezcan con marca y clase. Delimitador{" "}
            <strong>;</strong>. Si hay actualizaciones, vuelve a cargar el mismo
            archivo o uno nuevo (última fila gana en duplicados).
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.txt"
              onChange={handleFileChange}
              className="block w-full max-w-xs text-sm file:mr-4 file:rounded-md file:border-0 file:bg-slate-100 file:px-4 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
            />
            <Button
              onClick={handleUpload}
              disabled={!file || loading}
              className="bg-slate-800 text-white hover:bg-slate-700"
            >
              {loading ? "Subiendo…" : "Cargar CSV"}
            </Button>
          </div>
          {result && (
            <div
              className={
                result.error
                  ? "rounded-md border border-red-200 bg-red-50 p-3 text-red-800"
                  : "rounded-md border border-green-200 bg-green-50 p-3 text-green-800"
              }
            >
              {result.error ? (
                <p>{result.error}</p>
              ) : (
                <>
                  <p className="font-medium">
                    {result.count != null
                      ? `Registros actualizados: ${result.count}`
                      : "Listo."}
                  </p>
                  {result.duplicateRefsLogged != null &&
                    result.duplicateRefsLogged > 0 && (
                      <p className="mt-1 text-xs">
                        Referencias repetidas (última fila gana):{" "}
                        {result.duplicateRefsLogged}
                      </p>
                    )}
                  {result.message && (
                    <p className="mt-2 text-xs opacity-90">{result.message}</p>
                  )}
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
