"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiPost } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/data-table";
import { formatCop } from "@/lib/utils";

export default function AiPage() {
  const [question, setQuestion] = useState("");
  const [response, setResponse] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const searchParams = useSearchParams();
  const period = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return {
      from: searchParams.get("from") ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      to: searchParams.get("to") ?? today,
    };
  }, [searchParams]);

  const rows = Array.isArray(response?.rows) ? response.rows : [];
  const normalizedRows = rows.map((row: Record<string, unknown>) => {
    const next = { ...row };
    delete next.customerId;
    if (next.customerName && next.customerNit && next.customerName === next.customerNit) {
      next.customerNit = "";
    }
    return next;
  });
  const visibleKeys = normalizedRows.length > 0 ? Object.keys(normalizedRows[0]) : [];
  const columns =
    visibleKeys.length > 0
      ? visibleKeys.map((key) => ({
          header: key
            .replace(/([A-Z])/g, " $1")
            .replace(/^./, (c) => c.toUpperCase()),
          accessorKey: key,
          cell: ({ row }: { row: { original: Record<string, unknown> } }) => {
            const value = row.original[key];
            if (typeof value === "number") {
              if (key.toLowerCase().includes("percent")) {
                return `${value.toFixed(1)}%`;
              }
              if (
                ["sales", "total", "overdue", "amount", "margin", "ticket"].some((token) =>
                  key.toLowerCase().includes(token),
                )
              ) {
                return formatCop(value);
              }
              return value.toLocaleString("es-CO");
            }
            return value ?? "-";
          },
        }))
      : [];

  const downloadCsv = () => {
    if (normalizedRows.length === 0) return;
    const headers = visibleKeys;
    const escapeValue = (value: unknown) => {
      if (value === null || value === undefined) return "";
      const text = String(value).replace(/"/g, '""');
      return `"${text}"`;
    };
    const lines = [
      headers.map(escapeValue).join(","),
      ...normalizedRows.map((row) => headers.map((key) => escapeValue(row[key])).join(",")),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ai-resultados-${period.from}-${period.to}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const sendQuestion = async () => {
    if (!question.trim()) return;
    setLoading(true);
    try {
      const result = await apiPost("/ai/chat", {
        question: question.trim(),
        from: period.from,
        to: period.to,
      });
      setResponse(result);
    } catch {
      setResponse({
        template: "error",
        explanation: "No se pudo consultar el copiloto. Revisa el rango de fechas y la conexión.",
        rows: [],
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>AI Copilot</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            rows={6}
            placeholder="Ej: ¿Cuáles son los clientes con mayor caída?"
            className="w-full rounded-md border border-slate-200 p-3 text-sm text-slate-900 placeholder:text-slate-400"
          />
          <Button onClick={sendQuestion} disabled={loading || !question}>
            {loading ? "Consultando..." : "Enviar"}
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
              <div className="text-xs text-slate-500">
                Template: {response.template}
              </div>
              <Button
                className="border border-slate-200 bg-white text-xs text-slate-700 hover:bg-slate-50"
                onClick={downloadCsv}
                disabled={normalizedRows.length === 0}
              >
                Descargar Excel
              </Button>
              <p>{response.explanation}</p>
              {normalizedRows.length > 0 ? (
                <DataTable columns={columns} data={normalizedRows} />
              ) : (
                <p className="text-xs text-slate-500">Sin resultados para el periodo.</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Sin respuesta aún.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
