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
  const queryString = useMemo(() => {
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

  useEffect(() => {
    apiGet<Customer[]>(`/customers?search=${encodeURIComponent(search)}${queryString}`).then(
      (data) => {
      setCustomers(data);
      if (!selectedId && data.length > 0) {
        setSelectedId(data[0].id);
      }
      },
    );
  }, [search, selectedId, queryString]);

  useEffect(() => {
    if (!selectedId) return;
    apiGet<CustomerOverview>(`/customers/${selectedId}/overview${queryString}`).then(setOverview);
    apiGet<CustomerBrand[]>(`/customers/${selectedId}/brands${queryString}`).then(setBrands);
    apiGet<CustomerProduct[]>(`/customers/${selectedId}/products${queryString}`).then(
      setProducts,
    );
    apiGet<CustomerCollections>(`/customers/${selectedId}/collections${queryString}`).then(
      setCollections,
    );
  }, [selectedId, queryString]);

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
