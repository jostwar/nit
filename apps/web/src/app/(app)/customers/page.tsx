"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { apiGet } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/data-table";
import { ColumnDef } from "@tanstack/react-table";
import { formatCop } from "@/lib/utils";
import { useTableSort, TableThSort } from "@/hooks/use-table-sort";

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

type CarteraDocumentLine = {
  prefij: string;
  numdoc: string;
  fecha: string;
  fecven: string;
  ultpag?: string;
  daiaven: number;
  saldo: number;
};

export default function CustomersPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [overview, setOverview] = useState<CustomerOverview | null>(null);
  const [brands, setBrands] = useState<CustomerBrand[]>([]);
  const [products, setProducts] = useState<CustomerProduct[]>([]);
  const [collections, setCollections] = useState<CustomerCollections | null>(null);
  const [carteraDocuments, setCarteraDocuments] = useState<CarteraDocumentLine[]>([]);
  const [tab, setTab] = useState<"resumen" | "marcas" | "productos" | "cartera">("resumen");
  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat("es-CO", { year: "numeric", month: "2-digit", day: "2-digit" }),
    [],
  );
  const carteraSort = useTableSort<CarteraDocumentLine>(carteraDocuments, {
    defaultKey: "fecven",
    defaultDir: "asc",
  });
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
    const vendor = searchParams.get("vendor");
    const brand = searchParams.get("brand");
    const classFilter = searchParams.get("class");
    if (search.trim()) params.set("search", search.trim());
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (vendor) params.set("vendor", vendor);
    if (brand) params.set("brand", brand);
    if (classFilter) params.set("class", classFilter);
    params.set("limit", "10000");
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

  // Sincronizar search desde URL (p. ej. al llegar desde dashboard con ?search=NIT&customerId=xxx)
  useEffect(() => {
    const q = searchParams.get("search");
    if (q != null && q !== search) setSearch(q);
  }, [searchParams]);

  useEffect(() => {
    const customerIdFromUrl = searchParams.get("customerId");
    apiGet<Customer[]>(`/customers${listQueryString}`).then((data) => {
      setCustomers(data);
      if (customerIdFromUrl && data.some((c) => c.id === customerIdFromUrl)) {
        setSelectedId(customerIdFromUrl);
      } else if (data.length > 0) {
        setSelectedId((prev) =>
          prev && data.some((c) => c.id === prev) ? prev : data[0].id,
        );
      } else {
        setSelectedId(null);
      }
    });
  }, [listQueryString, searchParams]);

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

  useEffect(() => {
    if (tab !== "cartera" || !selectedId) {
      setCarteraDocuments([]);
      return;
    }
    const nit = customers.find((c) => c.id === selectedId)?.nit ?? overview?.customer?.nit;
    if (!nit) {
      setCarteraDocuments([]);
      return;
    }
    apiGet<{ documents: CarteraDocumentLine[] }>(
      `/source/cartera-documents?cedula=${encodeURIComponent(nit)}`,
    )
      .then((r) => setCarteraDocuments(r.documents ?? []))
      .catch(() => setCarteraDocuments([]));
  }, [tab, selectedId, customers, overview?.customer?.nit]);

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
          <div className="flex gap-2">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="NIT o nombre (vacío = todos)"
              className="flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400"
            />
            <button
              type="button"
              onClick={() => {
                setSearch("");
                const q = new URLSearchParams(searchParams.toString());
                q.delete("search");
                q.delete("customerId");
                const qs = q.toString();
                router.replace(qs ? `${pathname}?${qs}` : pathname);
              }}
              className="shrink-0 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Ver todos
            </button>
          </div>
          <div className="space-y-2">
            {customers.map((customer) => (
              <button
                key={customer.id}
                onClick={() => setSelectedId(customer.id)}
                className={`w-full rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                  selectedId === customer.id
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
                }`}
              >
                <div className="font-medium">{customer.name}</div>
                <div className={selectedId === customer.id ? "text-xs text-slate-200" : "text-xs text-slate-600"}>
                  {customer.nit}
                </div>
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
          <div className="space-y-2">
            {brands.length > 0 && brands.every((b) => (b.brand || "").trim() === "Sin marca") && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                Si solo aparece &quot;Sin marca&quot;, las marcas se enriquecen desde inventario y el mapeo (load-mappings). Ejecuta una sincronización y asegúrate de tener <code className="text-amber-800">brand-mapping.json</code> cargado.
              </p>
            )}
            <DataTable
              columns={[
                { header: "NOMBRE MARCA", accessorKey: "brand" },
                {
                  header: "ACTUAL (COP)",
                  accessorKey: "currentTotal",
                  cell: ({ row }) => formatCop(row.original.currentTotal),
                },
                {
                  header: "COMPARADO (COP)",
                  accessorKey: "compareTotal",
                  cell: ({ row }) => formatCop(row.original.compareTotal),
                },
              ]}
              data={brands}
            />
          </div>
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
          <>
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
                  <div className="text-xs text-slate-500">Por vencer</div>
                  <div className="text-lg font-semibold text-slate-900">
                    {formatCop(
                      Math.max(
                        0,
                        (collections?.credit?.balance ?? 0) - (collections?.credit?.overdue ?? 0),
                      ),
                    )}
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
            {carteraDocuments.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Detalle documentos</CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-slate-600">
                        <TableThSort sortKey="prefij" currentKey={carteraSort.sortKey} dir={carteraSort.sortDir} setSort={carteraSort.setSort} label="Prefijo + Documento" thClassName="p-2" />
                        <TableThSort sortKey="fecha" currentKey={carteraSort.sortKey} dir={carteraSort.sortDir} setSort={carteraSort.setSort} label="Fecha factura" thClassName="p-2" />
                        <TableThSort sortKey="fecven" currentKey={carteraSort.sortKey} dir={carteraSort.sortDir} setSort={carteraSort.setSort} label="Fecha vencimiento" thClassName="p-2" />
                        <TableThSort sortKey="daiaven" currentKey={carteraSort.sortKey} dir={carteraSort.sortDir} setSort={carteraSort.setSort} label="Días" thClassName="p-2" align="right" />
                        <th className="p-2">Por vencer</th>
                        <th className="p-2">0–30</th>
                        <th className="p-2">31–60</th>
                        <th className="p-2">61–90</th>
                        <th className="p-2">&gt;90</th>
                      </tr>
                    </thead>
                    <tbody>
                      {carteraSort.sortedData.map((doc, i) => {
                        // Por vencer: saldo con fecha aún no vencida (daiaven >= 0)
                        const porVencer = doc.daiaven >= 0 ? doc.saldo : 0;
                        // Vencido: columnas por días vencidos (daiaven negativo → 1-30, 31-60, 61-90, >90)
                        const r0_30 = doc.daiaven >= -30 && doc.daiaven <= -1 ? doc.saldo : 0;
                        const r31_60 = doc.daiaven >= -60 && doc.daiaven < -30 ? doc.saldo : 0;
                        const r61_90 = doc.daiaven >= -90 && doc.daiaven < -60 ? doc.saldo : 0;
                        const r90 = doc.daiaven < -90 ? doc.saldo : 0;
                        // Días: solo para clasificar vencido; por vencer no muestra número aquí
                        const diasLabel = doc.daiaven < 0 ? Math.abs(doc.daiaven) : "—";
                        return (
                          <tr key={i} className="border-b border-slate-100">
                            <td className="p-2 font-medium">
                              {doc.prefij}-{doc.numdoc}
                            </td>
                            <td className="p-2">{dateFormatter.format(new Date(doc.fecha))}</td>
                            <td className="p-2">{dateFormatter.format(new Date(doc.fecven))}</td>
                            <td className="p-2 text-right">{diasLabel}</td>
                            <td className="p-2">{formatCop(porVencer)}</td>
                            <td className="p-2">{formatCop(r0_30)}</td>
                            <td className="p-2">{formatCop(r31_60)}</td>
                            <td className="p-2">{formatCop(r61_90)}</td>
                            <td className="p-2">{formatCop(r90)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
