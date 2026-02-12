"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";

type AlertRule = {
  id: string;
  name: string;
  type: "NO_PURCHASE_DAYS" | "DROP_PERCENT" | "BRAND_LOST" | "DSO_HIGH";
  params: Record<string, unknown>;
  isActive: boolean;
};

type AlertRuleType = AlertRule["type"];

type AlertEvent = {
  id: string;
  message: string;
  status: "OPEN" | "CLOSED";
  createdAt: string;
  customer?: { name?: string | null } | null;
  rule?: { name?: string | null; type?: AlertRuleType } | null;
};

export default function AlertsPage() {
  const searchParams = useSearchParams();
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [events, setEvents] = useState<AlertEvent[]>([]);
  const [statusFilter, setStatusFilter] = useState<"OPEN" | "CLOSED" | "ALL">("OPEN");
  const [ruleTypeFilter, setRuleTypeFilter] = useState<AlertRuleType | "">("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [form, setForm] = useState({
    name: "",
    type: "NO_PURCHASE_DAYS" as AlertRule["type"],
    isActive: true,
    days: "30",
    percent: "20",
    brand: "",
  });
  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" }),
    [],
  );

  const displayCustomerName = (name?: string | null) => {
    if (!name) return "Cliente sin nombre";
    return name;
  };

  const loadRules = async () => {
    try {
      const data = await apiGet<AlertRule[]>("/alerts/rules");
      setRules(data);
    } catch {
      setError("No se pudieron cargar las reglas.");
    }
  };

  const loadEvents = async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (ruleTypeFilter) params.set("ruleType", ruleTypeFilter);
      const vendor = searchParams.get("vendor");
      if (vendor) params.set("vendor", vendor);
      const query = params.toString() ? `?${params.toString()}` : "";
      const data = await apiGet<AlertEvent[]>(`/alerts/events${query}`);
      setEvents(data);
    } catch {
      setError("No se pudieron cargar los eventos.");
    }
  };

  useEffect(() => {
    loadRules();
  }, []);

  useEffect(() => {
    loadEvents();
  }, [statusFilter, ruleTypeFilter, searchParams.get("vendor")]);

  const buildParams = () => {
    if (form.type === "NO_PURCHASE_DAYS" || form.type === "DSO_HIGH") {
      const days = Number(form.days);
      if (!Number.isFinite(days) || days <= 0) {
        throw new Error("Días inválidos.");
      }
      return { days };
    }
    if (form.type === "DROP_PERCENT") {
      const percent = Number(form.percent);
      if (!Number.isFinite(percent) || percent <= 0) {
        throw new Error("Porcentaje inválido.");
      }
      return { percent };
    }
    const brand = form.brand.trim();
    if (!brand) {
      throw new Error("La marca es obligatoria.");
    }
    return { brand };
  };

  const handleCreate = async () => {
    setSaving(true);
    setError(null);
    try {
      const params = buildParams();
      await apiPost("/alerts/rules", {
        name: form.name.trim() || "Regla sin nombre",
        type: form.type,
        isActive: form.isActive,
        params,
      });
      setForm((prev) => ({ ...prev, name: "" }));
      await loadRules();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la regla.");
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (rule: AlertRule) => {
    try {
      await apiPatch(`/alerts/rules/${rule.id}`, { isActive: !rule.isActive });
      setRules((prev) =>
        prev.map((item) => (item.id === rule.id ? { ...item, isActive: !item.isActive } : item)),
      );
    } catch {
      setError("No se pudo actualizar la regla.");
    }
  };

  const handleEdit = async (rule: AlertRule) => {
    const name = window.prompt("Nombre de la regla:", rule.name);
    if (!name) return;
    let params = rule.params;
    if (rule.type === "NO_PURCHASE_DAYS" || rule.type === "DSO_HIGH") {
      const current = String((rule.params as { days?: number })?.days ?? 30);
      const next = window.prompt("Días:", current);
      if (!next) return;
      const days = Number(next);
      if (!Number.isFinite(days) || days <= 0) {
        setError("Días inválidos.");
        return;
      }
      params = { days };
    }
    if (rule.type === "DROP_PERCENT") {
      const current = String((rule.params as { percent?: number })?.percent ?? 20);
      const next = window.prompt("Porcentaje:", current);
      if (!next) return;
      const percent = Number(next);
      if (!Number.isFinite(percent) || percent <= 0) {
        setError("Porcentaje inválido.");
        return;
      }
      params = { percent };
    }
    if (rule.type === "BRAND_LOST") {
      const current = String((rule.params as { brand?: string })?.brand ?? "");
      const next = window.prompt("Marca:", current);
      if (!next) return;
      params = { brand: next.trim() };
    }
    try {
      await apiPatch(`/alerts/rules/${rule.id}`, { name: name.trim(), params });
      await loadRules();
    } catch {
      setError("No se pudo editar la regla.");
    }
  };

  const handleDelete = async (rule: AlertRule) => {
    if (!window.confirm("¿Eliminar esta regla?")) return;
    try {
      await apiDelete(`/alerts/rules/${rule.id}`);
      setRules((prev) => prev.filter((item) => item.id !== rule.id));
    } catch {
      setError("No se pudo eliminar la regla.");
    }
  };

  const handleRunRules = async () => {
    setRunning(true);
    setError(null);
    try {
      await apiPost("/alerts/run", {});
      await loadEvents();
    } catch {
      setError("No se pudo ejecutar la evaluación de reglas.");
    } finally {
      setRunning(false);
    }
  };

  const handleCloseEvent = async (eventId: string) => {
    try {
      await apiPatch(`/alerts/events/${eventId}`, { status: "CLOSED" });
      if (statusFilter === "OPEN") {
        setEvents((prev) => prev.filter((item) => item.id !== eventId));
      } else {
        setEvents((prev) =>
          prev.map((item) => (item.id === eventId ? { ...item, status: "CLOSED" } : item)),
        );
      }
    } catch {
      setError("No se pudo cerrar el evento.");
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
      <Card>
        <CardHeader>
          <CardTitle>Reglas configuradas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 grid gap-2 md:grid-cols-[2fr_1fr_1fr_1fr_auto]">
            <input
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="Nombre de la regla"
              className="rounded-md border border-slate-200 px-3 py-2 text-sm"
            />
            <select
              value={form.type}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, type: event.target.value as AlertRule["type"] }))
              }
              className="rounded-md border border-slate-200 bg-white px-2 py-2 text-sm"
            >
              <option value="NO_PURCHASE_DAYS">Sin compra</option>
              <option value="DROP_PERCENT">Caída %</option>
              <option value="BRAND_LOST">Marca perdida</option>
              <option value="DSO_HIGH">DSO alto</option>
            </select>
            {form.type === "BRAND_LOST" ? (
              <input
                value={form.brand}
                onChange={(event) => setForm((prev) => ({ ...prev, brand: event.target.value }))}
                placeholder="Marca"
                className="rounded-md border border-slate-200 px-3 py-2 text-sm"
              />
            ) : (
              <input
                value={form.type === "DROP_PERCENT" ? form.percent : form.days}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    [form.type === "DROP_PERCENT" ? "percent" : "days"]: event.target.value,
                  }))
                }
                placeholder={form.type === "DROP_PERCENT" ? "Porcentaje" : "Días"}
                className="rounded-md border border-slate-200 px-3 py-2 text-sm"
              />
            )}
            <label className="flex items-center gap-2 text-xs text-slate-500">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, isActive: event.target.checked }))
                }
              />
              Activa
            </label>
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? "Guardando..." : "Crear"}
            </Button>
          </div>
          {error ? <div className="mb-3 text-sm text-rose-500">{error}</div> : null}
          <DataTable
            columns={[
              { header: "Regla", accessorKey: "name" },
              { header: "Tipo", accessorKey: "type" },
              {
                header: "Parámetros",
                cell: ({ row }) => {
                  const params = row.original.params ?? {};
                  if (row.original.type === "BRAND_LOST") {
                    return `Marca: ${(params as { brand?: string }).brand ?? "-"}`;
                  }
                  if (row.original.type === "DROP_PERCENT") {
                    return `Porcentaje: ${(params as { percent?: number }).percent ?? "-"}`;
                  }
                  return `Días: ${(params as { days?: number }).days ?? "-"}`;
                },
              },
              {
                header: "Activa",
                cell: ({ row }) => (
                  <Button
                    className="border border-slate-200 bg-white text-xs text-slate-700 hover:bg-slate-50"
                    onClick={() => handleToggle(row.original)}
                  >
                    {row.original.isActive ? "Desactivar" : "Activar"}
                  </Button>
                ),
              },
              {
                id: "actions",
                header: "",
                cell: ({ row }) => (
                  <div className="flex items-center gap-2">
                    <Button
                      className="border border-slate-200 bg-white text-xs text-slate-700 hover:bg-slate-50"
                      onClick={() => handleEdit(row.original)}
                    >
                      Editar
                    </Button>
                    <Button
                      className="border border-rose-200 bg-rose-50 text-xs text-rose-700 hover:bg-rose-100"
                      onClick={() => handleDelete(row.original)}
                    >
                      Eliminar
                    </Button>
                  </div>
                ),
              },
            ]}
            data={rules}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Eventos</CardTitle>
          <Button
            onClick={handleRunRules}
            disabled={running}
            variant="outline"
            size="sm"
            className="shrink-0"
          >
            {running ? "Ejecutando…" : "Ejecutar reglas ahora"}
          </Button>
        </CardHeader>
        <CardContent>
          {searchParams.get("vendor") && (
            <p className="mb-3 text-xs text-slate-600">
              Mostrando solo eventos de clientes del vendedor: <strong>{searchParams.get("vendor")}</strong>
            </p>
          )}
          <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-2">
              Estado
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as typeof statusFilter)
                }
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
              >
                <option value="OPEN">Abiertos</option>
                <option value="CLOSED">Cerrados</option>
                <option value="ALL">Todos</option>
              </select>
            </span>
            <span className="flex items-center gap-2">
              Tipo de regla
              <select
                value={ruleTypeFilter}
                onChange={(event) =>
                  setRuleTypeFilter(event.target.value as AlertRuleType | "")
                }
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
              >
                <option value="">Todos</option>
                <option value="NO_PURCHASE_DAYS">Sin compra</option>
                <option value="DROP_PERCENT">Caída %</option>
                <option value="BRAND_LOST">Marca perdida</option>
                <option value="DSO_HIGH">DSO alto</option>
              </select>
            </span>
          </div>
          <DataTable
            columns={[
              {
                id: "customer",
                header: "Cliente",
                accessorFn: (row) => displayCustomerName(row.customer?.name ?? null),
              },
              { id: "rule", header: "Regla", accessorFn: (row) => row.rule?.name ?? "N/A" },
              { header: "Mensaje", accessorKey: "message" },
              {
                header: "Creado",
                accessorKey: "createdAt",
                cell: ({ row }) => dateFormatter.format(new Date(row.original.createdAt)),
              },
              {
                header: "Estado",
                accessorKey: "status",
              },
              {
                id: "event-actions",
                header: "",
                cell: ({ row }) =>
                  row.original.status === "OPEN" ? (
                    <Button
                      className="border border-slate-200 bg-white text-xs text-slate-700 hover:bg-slate-50"
                      onClick={() => handleCloseEvent(row.original.id)}
                    >
                      Cerrar
                    </Button>
                  ) : null,
              },
            ]}
            data={events}
          />
        </CardContent>
      </Card>
    </div>
  );
}
