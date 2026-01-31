"use client";

import { useState } from "react";
import { apiPost } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function AiPage() {
  const [question, setQuestion] = useState("");
  const [response, setResponse] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const sendQuestion = async () => {
    setLoading(true);
    try {
      const result = await apiPost("/ai/chat", {
        question,
        from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        to: new Date().toISOString().slice(0, 10),
      });
      setResponse(result);
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
            className="w-full rounded-md border border-slate-200 p-3 text-sm"
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
              <p>{response.explanation}</p>
              <pre className="overflow-auto rounded-md bg-slate-900 p-3 text-xs text-slate-100">
                {JSON.stringify(response.rows, null, 2)}
              </pre>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Sin respuesta aún.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
