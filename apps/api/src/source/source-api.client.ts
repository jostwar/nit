export type SourceInvoice = {
  externalId: string;
  customerNit: string;
  issuedAt: string;
  total: number;
  margin: number;
  units: number;
  items: Array<{
    productName: string;
    brand: string;
    category: string;
    quantity: number;
    unitPrice: number;
    total: number;
    margin: number;
  }>;
};

export type SourcePayment = {
  externalId: string;
  customerNit: string;
  invoiceExternalId?: string;
  paidAt: string;
  amount: number;
  balance?: number;
  dueAt?: string;
  overdueDays?: number;
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
  fetchInvoices(tenantExternalId: string, from: string, to: string): Promise<SourceInvoice[]>;
  fetchPayments(tenantExternalId: string, from: string, to: string): Promise<SourcePayment[]>;
  fetchCustomers(
    tenantExternalId: string,
    page: number,
    pageSize: number,
    vendor?: string,
  ): Promise<SourceCustomer[]>;
}
