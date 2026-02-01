"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiGet } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/data-table";
import { ColumnDef } from "@tanstack/react-table";
import { formatCop } from "@/lib/utils";

type Customer = {
  id: string;
  nit: string;
  name: string;
  totalSales: number;
  totalInvoices: number;
};

type CustomerOverview = {
  customer?: {
    id: string;
    nit: string;
    name: string;
  };
  lastPurchaseAt?: string | null;
  current: {
    totalSales: number;
    totalMargin: number;
    totalInvoices: number;
    totalUnits: number;
  };
};

type CustomerBrand = {
  brand: string;
  currentTotal: number;
  compareTotal: number;
};

type CustomerProduct = {
  product: string;
  currentTotal: number;
  compareTotal: number;
};

type CustomerCollections = {
  credit?: {
    creditLimit: number;
    balance: number;
    overdue: number;
    dsoDays: number;
  } | null;
};

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [overview, setOverview] = useState<CustomerOverview | null>(null);
  const [brands, setBrands] = useState<CustomerBrand[]>([]);
  const [products, setProducts] = useState<CustomerProduct[]>([]);
  const [collections, setCollections] = useState<CustomerCollections | null>(null);
  const [tab, setTab] = useState<"resumen" | "marcas" | "productos" | "cartera">("resumen");
  const searchParams = useSearchParams();
  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat("es-CO", { year: "numeric", month: "2-digit", day: "2-digit" }),
    [],
  );
  const detailQueryString = useMemo(() => {
    const params = new URLSearchParams();
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const compareFrom = searchParams.get("compareFrom");
    const compareTo = searchParams.get("compareTo");
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (compareFrom) params.set("compareFrom", compareFrom);
    if (compareTo) params.set("compareTo", compareTo);
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  }, [searchParams]);
  const listQueryString = useMemo(() => {
    const params = new URLSearchParams();
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    if (search.trim()) params.set("search", search.trim());
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  }, [search, searchParams]);
  const toDate = useMemo(() => {
    const to = searchParams.get("to");
    const parsed = to ? new Date(to) : new Date();
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }, [searchParams]);
  const lastPurchaseDate = overview?.lastPurchaseAt
    ? new Date(overview.lastPurchaseAt)
    : null;
  const daysSinceLastPurchase = lastPurchaseDate
    ? Math.max(0, Math.floor((toDate.getTime() - lastPurchaseDate.getTime()) / 86400000))
    : null;

  useEffect(() => {
    apiGet<Customer[]>(`/customers${listQueryString}`).then((data) => {
      setCustomers(data);
      if (!selectedId && data.length > 0) {
        setSelectedId(data[0].id);
      }
    });
  }, [listQueryString, selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    apiGet<CustomerOverview>(`/customers/${selectedId}/overview${detailQueryString}`).then(
      setOverview,
    );
    apiGet<CustomerBrand[]>(`/customers/${selectedId}/brands${detailQueryString}`).then(setBrands);
    apiGet<CustomerProduct[]>(`/customers/${selectedId}/products${detailQueryString}`).then(
      setProducts,
    );
    apiGet<CustomerCollections>(`/customers/${selectedId}/collections${detailQueryString}`).then(
      setCollections,
    );
  }, [selectedId, detailQueryString]);

  const columns = useMemo<ColumnDef<Customer>[]>(
    () => [
      { header: "NIT", accessorKey: "nit" },
      { header: "Cliente", accessorKey: "name" },
      {
        header: "Ventas",
        accessorKey: "totalSales",
        cell: ({ row }) => formatCop(row.original.totalSales),
      },
      {
        header: "Facturas",
        accessorKey: "totalInvoices",
      },
    ],
    [],
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <Card className="h-fit">
        <CardHeader>
          <CardTitle>Buscar cliente</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="NIT o nombre"
            className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400"
          />
          <div className="space-y-2">
            {customers.map((customer) => (
              <button
                key={customer.id}
                onClick={() => setSelectedId(customer.id)}
                className={`w-full rounded-md border px-3 py-2 text-left text-sm ${
                  selectedId === customer.id ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white"
                }`}
              >
                <div className="font-medium">{customer.name}</div>
                <div className="text-xs opacity-70">{customer.nit}</div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        <div className="flex gap-2">
          {["resumen", "marcas", "productos", "cartera"].map((key) => (
            <button
              key={key}
              onClick={() => setTab(key as typeof tab)}
              className={`rounded-full px-4 py-2 text-xs font-medium ${
                tab === key ? "bg-slate-900 text-white" : "bg-white text-slate-600"
              }`}
            >
              {key === "resumen" ? "Resumen" : key === "marcas" ? "Marcas" : key === "productos" ? "Productos" : "Cartera"}
            </button>
          ))}
        </div>

        {tab === "resumen" && (
          <Card>
            <CardHeader>
              <CardTitle>Resumen 360</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              <div className="md:col-span-2">
                <div className="text-xs text-slate-500">Cliente</div>
                <div className="text-sm font-semibold text-slate-900">
                  {overview?.customer?.name ?? "N/A"} · {overview?.customer?.nit ?? "-"}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Ventas</div>
                <div className="text-lg font-semibold text-slate-900">
                  {formatCop(overview?.current?.totalSales ?? 0)}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Margen</div>
                <div className="text-lg font-semibold text-slate-900">
                  {formatCop(overview?.current?.totalMargin ?? 0)}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Margen %</div>
                <div className="text-lg font-semibold text-slate-900">
                  {overview && overview.current.totalSales > 0
                    ? `${((overview.current.totalMargin / overview.current.totalSales) * 100).toFixed(1)}%`
                    : "0.0%"}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Facturas</div>
                <div className="text-lg font-semibold text-slate-900">
                  {overview?.current?.totalInvoices ?? 0}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Unidades</div>
                <div className="text-lg font-semibold text-slate-900">
                  {overview?.current?.totalUnits ?? 0}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Última compra</div>
                <div className="text-lg font-semibold text-slate-900">
                  {lastPurchaseDate ? dateFormatter.format(lastPurchaseDate) : "N/A"}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Días desde última compra</div>
                <div className="text-lg font-semibold text-slate-900">
                  {daysSinceLastPurchase !== null ? daysSinceLastPurchase : "N/A"}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {tab === "marcas" && (
          <DataTable
            columns={[
              { header: "Nombre marca", accessorKey: "brand" },
              {
                header: "Actual (COP)",
                accessorKey: "currentTotal",
                cell: ({ row }) => formatCop(row.original.currentTotal),
              },
              {
                header: "Comparado (COP)",
                accessorKey: "compareTotal",
                cell: ({ row }) => formatCop(row.original.compareTotal),
              },
            ]}
            data={brands}
          />
        )}

        {tab === "productos" && (
          <DataTable
            columns={[
              { header: "Referencia", accessorKey: "product" },
              {
                header: "Actual (COP)",
                accessorKey: "currentTotal",
                cell: ({ row }) => formatCop(row.original.currentTotal),
              },
              {
                header: "Comparado (COP)",
                accessorKey: "compareTotal",
                cell: ({ row }) => formatCop(row.original.compareTotal),
              },
            ]}
            data={products}
          />
        )}

        {tab === "cartera" && (
          <Card>
            <CardHeader>
              <CardTitle>Cartera</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              <div>
                <div className="text-xs text-slate-500">Cupo</div>
                <div className="text-lg font-semibold text-slate-900">
                  {formatCop(collections?.credit?.creditLimit ?? 0)}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Saldo</div>
                <div className="text-lg font-semibold text-slate-900">
                  {formatCop(collections?.credit?.balance ?? 0)}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Vencido</div>
                <div className="text-lg font-semibold text-slate-900">
                  {formatCop(collections?.credit?.overdue ?? 0)}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">DSO estimado</div>
                <div className="text-lg font-semibold text-slate-900">
                  {collections?.credit?.dsoDays ?? 0} días
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
