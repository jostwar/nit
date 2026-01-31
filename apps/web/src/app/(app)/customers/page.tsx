"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/data-table";
import { ColumnDef } from "@tanstack/react-table";

type Customer = {
  id: string;
  nit: string;
  name: string;
  totalSales: number;
  totalInvoices: number;
};

type CustomerOverview = {
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

  useEffect(() => {
    apiGet<Customer[]>(`/customers?search=${encodeURIComponent(search)}`).then((data) => {
      setCustomers(data);
      if (!selectedId && data.length > 0) {
        setSelectedId(data[0].id);
      }
    });
  }, [search, selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    apiGet<CustomerOverview>(`/customers/${selectedId}/overview`).then(setOverview);
    apiGet<CustomerBrand[]>(`/customers/${selectedId}/brands`).then(setBrands);
    apiGet<CustomerProduct[]>(`/customers/${selectedId}/products`).then(setProducts);
    apiGet<CustomerCollections>(`/customers/${selectedId}/collections`).then(setCollections);
  }, [selectedId]);

  const columns = useMemo<ColumnDef<Customer>[]>(
    () => [
      { header: "NIT", accessorKey: "nit" },
      { header: "Cliente", accessorKey: "name" },
      {
        header: "Ventas",
        accessorKey: "totalSales",
        cell: ({ row }) => row.original.totalSales.toLocaleString("es-CO"),
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
            className="rounded-md border border-slate-200 px-3 py-2 text-sm"
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
              <div>
                <div className="text-xs text-slate-500">Ventas</div>
                <div className="text-lg font-semibold text-slate-900">
                  {overview?.current?.totalSales?.toLocaleString("es-CO") ?? 0}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Margen</div>
                <div className="text-lg font-semibold text-slate-900">
                  {overview?.current?.totalMargin?.toLocaleString("es-CO") ?? 0}
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
              { header: "Marca", accessorKey: "brand" },
              { header: "Actual", accessorKey: "currentTotal" },
              { header: "Comparado", accessorKey: "compareTotal" },
            ]}
            data={brands}
          />
        )}

        {tab === "productos" && (
          <DataTable
            columns={[
              { header: "Producto", accessorKey: "product" },
              { header: "Actual", accessorKey: "currentTotal" },
              { header: "Comparado", accessorKey: "compareTotal" },
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
                  {collections?.credit?.creditLimit?.toLocaleString("es-CO") ?? 0}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Saldo</div>
                <div className="text-lg font-semibold text-slate-900">
                  {collections?.credit?.balance?.toLocaleString("es-CO") ?? 0}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Vencido</div>
                <div className="text-lg font-semibold text-slate-900">
                  {collections?.credit?.overdue?.toLocaleString("es-CO") ?? 0}
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
