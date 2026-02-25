"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiPost, getAccessToken } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/data-table";
import { formatCop } from "@/lib/utils";

type CopilotTable = { title: string; columns: string[]; rows: (string | number)[][] };
type CopilotResponse = {
  answer: string;
  tables: CopilotTable[];
  download_available: boolean;
  download_query_id: string | null;
  applied_filters: { start: string; end: string; seller: string | null; city: string | null; brand: string | null; class: string | null };
  warnings: string[];
};

function isNewCopilotResponse(r: unknown): r is CopilotResponse {
  return (
    r != null &&
    typeof r === "object" &&
    "answer" in r &&
    "tables" in r &&
    Array.isArray((r as CopilotResponse).tables)
  );
}

const TABLE_TITLES: Record<string, string> = {
  sales_change: "Cambio en ventas",
  ar_summary: "Resumen de cartera",
  resolve_period: "Período",
  customer_lookup: "Búsqueda de clientes",
  sync_status: "Estado de sincronización",
};
function tableDisplayTitle(toolName: string, columns: string[] = []): string {
  if (toolName === "sales_top" && columns.length > 0) {
    const first = (columns[0] ?? "").toLowerCase();
    if (first.includes("producto")) return "Top referencias por ventas";
    if (first.includes("cliente")) return "Top clientes por ventas";
    if (first.includes("marca")) return "Top marcas por ventas";
    if (first.includes("clase")) return "Top clases por ventas";
    if (first.includes("vendedor")) return "Top vendedores por ventas";
    if (first.includes("mes")) return "Ventas por mes";
  }
  return TABLE_TITLES[toolName] ?? toolName;
}

export default function AiPage() {
  const [question, setQuestion] = useState("");
  const [city, setCity] = useState("");
  const [vendor, setVendor] = useState("");
  const [brand, setBrand] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [response, setResponse] = useState<CopilotResponse | Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const searchParams = useSearchParams();
  const period = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return {
      start: searchParams.get("from") ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      end: searchParams.get("to") ?? today,
    };
  }, [searchParams]);

  const newResponse = isNewCopilotResponse(response) ? response : null;
  const tables = newResponse?.tables ?? [];
  const downloadQueryId = newResponse?.download_query_id ?? null;
  const downloadAvailable = newResponse?.download_available === true && downloadQueryId;

  const downloadExport = () => {
    if (!downloadQueryId) return;
    const token = getAccessToken();
    const base = typeof window !== "undefined" && process.env.NEXT_PUBLIC_API_URL ? process.env.NEXT_PUBLIC_API_URL : `${window?.location?.protocol}//${window?.location?.hostname}:4000/api`;
    const url = `${base}/copilot/export/${downloadQueryId}`;
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
    fetch(url, { headers })
      .then((res) => {
        if (!res.ok) throw new Error("Export no disponible");
        return res.blob();
      })
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `copilot-export-${downloadQueryId.slice(0, 8)}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch(() => {});
  };

  const sendQuestion = async () => {
    if (!question.trim()) return;
    setLoading(true);
    setResponse(null);
    try {
      const result = await apiPost<CopilotResponse | Record<string, unknown>>("/copilot/ask", {
        question: question.trim(),
        start: period.start,
        end: period.end,
        city: city.trim() || undefined,
        vendor: vendor.trim() || undefined,
        brand: brand.trim() || undefined,
        class: classFilter.trim() || undefined,
      });
      setResponse(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error de conexión";
      setResponse({
        answer: "No se pudo obtener la respuesta. Comprueba el rango de fechas y tu conexión.",
        tables: [],
        download_available: false,
        download_query_id: null,
        applied_filters: { start: period.start, end: period.end, seller: null, city: null, brand: null, class: null },
        warnings: [msg],
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Copilot BI</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={6}
            placeholder="Ej: Top 10 clientes por ventas en el último trimestre. ¿Marcas que más vendieron? ¿Vendedores con mayor caída? ¿Estado de cartera? Puedes decir 'últimos 30 días', 'mes actual'."
            className="w-full rounded-md border border-slate-200 p-3 text-sm text-slate-900 placeholder:text-slate-400"
          />
          <div className="grid gap-2 grid-cols-2 md:grid-cols-4">
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Ciudad"
              className="rounded-md border border-slate-200 px-3 py-2 text-sm"
            />
            <input
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
              placeholder="Vendedor"
              className="rounded-md border border-slate-200 px-3 py-2 text-sm"
            />
            <input
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="Marca"
              className="rounded-md border border-slate-200 px-3 py-2 text-sm"
            />
            <input
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              placeholder="Clase"
              className="rounded-md border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <p className="text-xs text-slate-500">
            Usa las fechas del período principal o escribe en la pregunta &quot;último trimestre&quot;, &quot;mes actual&quot;, etc. Las ventas se filtran por fecha de factura.
          </p>
          <Button onClick={sendQuestion} disabled={loading || !question.trim()}>
            {loading ? "Consultando…" : "Enviar"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Respuesta</CardTitle>
        </CardHeader>
        <CardContent>
          {response ? (
            <div className="space-y-3 text-sm text-slate-700">
              {newResponse?.applied_filters && (
                <p className="text-xs text-slate-500">
                  Periodo: {newResponse.applied_filters.start} – {newResponse.applied_filters.end}
                  {[newResponse.applied_filters.city, newResponse.applied_filters.seller, newResponse.applied_filters.brand, newResponse.applied_filters.class]
                    .filter(Boolean)
                    .join(" · ") && ` · Filtros: ${[newResponse.applied_filters.city, newResponse.applied_filters.seller, newResponse.applied_filters.brand, newResponse.applied_filters.class].filter(Boolean).join(", ")}`}
                </p>
              )}
              {downloadAvailable && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={downloadExport}
                >
                  Descargar Excel (CSV)
                </Button>
              )}
              <p>{newResponse?.answer ?? (response as any).explanation ?? "—"}</p>
              {(newResponse?.warnings ?? []).length > 0 && (
                <ul className="text-amber-700 text-xs list-disc pl-4">
                  {(newResponse?.warnings ?? []).map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              )}
              {tables.length > 0 ? (
                tables.map((t, idx) => (
                  <div key={idx} className="overflow-x-auto">
                    <p className="font-medium text-slate-800 mb-1">
                      {tableDisplayTitle(t.title, t.columns)}
                    </p>
                    {t.rows.length > 0 ? (
                      <table className="w-full text-sm border border-slate-200">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200">
                            {t.columns.map((col, i) => (
                              <th key={i} className="text-left py-2 px-2">{col}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {t.rows.map((row, ri) => (
                            <tr key={ri} className="border-b border-slate-100">
                              {row.map((cell, ci) => (
                                <td key={ci} className="py-1.5 px-2">
                                  {typeof cell === "number"
                                    ? (t.columns[ci]?.toLowerCase().includes("margen %") || t.columns[ci]?.toLowerCase().includes("margen%")
                                      ? `${Number(cell).toFixed(1)}%`
                                      : t.columns[ci]?.toLowerCase().includes("venta") || t.columns[ci]?.toLowerCase().includes("saldo") || (t.columns[ci]?.toLowerCase().includes("margen") && !t.columns[ci]?.includes("%")) || t.columns[ci]?.toLowerCase().includes("cop")
                                        ? formatCop(cell)
                                        : cell.toLocaleString("es-CO"))
                                    : cell}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p className="text-slate-500 text-xs">Sin filas.</p>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-500">Sin tablas. Si no hay datos, amplía el rango de fechas o relaja filtros.</p>
              )}
            </div>
          ) : (
            <p className="text-slate-500 text-sm">Haz una pregunta para ver la respuesta aquí.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
