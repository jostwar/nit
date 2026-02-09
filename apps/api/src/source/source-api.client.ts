export type SourceInvoice = {
  externalId: string;
  customerNit: string;
  customerName?: string;
  issuedAt: string;
  total: number;
  margin: number;
  units: number;
  vendor?: string; // NOMVEN de GenerarInfoVentas
  city?: string; // para enriquecer Customer si viene en la venta
  /** Código TIPOMOV (ej. 01, 13=SUMA VENTA; 04, 06, 15=RESTA VENTA). */
  documentType?: string;
  /** 1 = SUMA VENTA, -1 = RESTA VENTA. Por defecto 1. */
  saleSign?: number;
  items: Array<{
    productName: string;
    brand: string;
    category: string;
    classCode?: string;
    quantity: number;
    unitPrice: number;
    total: number;
    margin: number;
  }>;
};

export type SourcePayment = {
  externalId: string;
  customerNit: string;
  customerName?: string;
  invoiceExternalId?: string;
  paidAt: string;
  amount: number;
  balance?: number;
  dueAt?: string;
  overdueDays?: number;
  /** Cupo / crédito autorizado (desde API cartera). */
  creditLimit?: number;
};

export type SourceCustomer = {
  externalId: string;
  nit: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  segment?: string;
  vendor?: string;
};

export interface SourceApiClient {
  fetchInvoices(
    tenantExternalId: string,
    from: string,
    to: string,
    options?: { cedula?: string; vendor?: string; tenantId?: string },
  ): Promise<SourceInvoice[]>;
  fetchPayments(
    tenantExternalId: string,
    from: string,
    to: string,
    options?: { cedula?: string; vendor?: string },
  ): Promise<SourcePayment[]>;
  fetchCustomers(
    tenantExternalId: string,
    page: number,
    pageSize: number,
    vendor?: string,
  ): Promise<SourceCustomer[]>;
  /** Marcas únicas desde API inventarios (GenerarInformacionInventariosGet). Opcional. */
  getInventoryBrandNames?(tenantExternalId: string): Promise<string[]>;
}
