import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';
import { SourceApiClient, SourceCustomer, SourceInvoice, SourcePayment } from './source-api.client';

type FomplusConfig = {
  carteraBaseUrl: string;
  ventasBaseUrl: string;
  database: string;
  token: string;
  vendor?: string;
};

type FlatRecord = Record<string, string | number | boolean | null | undefined>;

export class FomplusSourceApiClient implements SourceApiClient {
  private readonly parser = new XMLParser({
    ignoreAttributes: false,
    trimValues: true,
    parseTagValue: true,
  });

  private readonly config: FomplusConfig = {
    carteraBaseUrl: process.env.SOURCE_API_CXC_BASE_URL ?? 'https://cartera.fomplus.com',
    ventasBaseUrl: process.env.SOURCE_API_VENTAS_BASE_URL ?? 'https://gspapiest.fomplus.com',
    database: process.env.SOURCE_API_DB ?? '',
    token: process.env.SOURCE_API_TOKEN ?? '',
    vendor: process.env.SOURCE_API_VENDOR ?? '',
  };

  async fetchInvoices(tenantExternalId: string, from: string, to: string): Promise<SourceInvoice[]> {
    const xml = await this.getXml(`${this.config.ventasBaseUrl}/srvAPI.asmx/GenerarInfoVentas`, {
      strPar_Empresa: this.config.database || tenantExternalId,
      datPar_FecIni: from,
      datPar_FecFin: to,
      objPar_Objeto: this.config.token,
    });
    const records = this.extractRecords(xml);
    return this.mapInvoices(records, from);
  }

  async fetchPayments(tenantExternalId: string, _from: string, to: string): Promise<SourcePayment[]> {
    const xml = await this.getXml(`${this.config.carteraBaseUrl}/srvCxcPed.asmx/EstadoDeCuentaCartera`, {
      strPar_Basedatos: this.config.database || tenantExternalId,
      strPar_Token: this.config.token,
      strPar_Vended: this.config.vendor ?? '',
      datPar_Fecha: to,
      strPar_Cedula: '',
    });
    const records = this.extractRecords(xml);
    return this.mapPayments(records, to);
  }

  async fetchCustomers(
    tenantExternalId: string,
    page: number,
    pageSize: number,
    vendor?: string,
  ): Promise<SourceCustomer[]> {
    const xml = await this.getXml(`${this.config.carteraBaseUrl}/srvCxcPed.asmx/ListadoClientes`, {
      strPar_Basedatos: this.config.database || tenantExternalId,
      strPar_Token: this.config.token,
      strPar_Vended: vendor ?? this.config.vendor ?? '',
      intPar_Filas: pageSize,
      intPar_Pagina: page,
    });
    const records = this.extractRecords(xml);
    return this.mapCustomers(records);
  }

  private async getXml(url: string, params: Record<string, string | number>) {
    const response = await axios.get(url, {
      params,
      timeout: 30000,
    });
    return typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
  }

  private extractRecords(xml: string): FlatRecord[] {
    const parsed = this.parser.parse(xml);
    const records: FlatRecord[] = [];
    const visit = (node: unknown) => {
      if (!node) return;
      if (Array.isArray(node)) {
        node.forEach(visit);
        return;
      }
      if (typeof node !== 'object') return;
      const values = Object.values(node as Record<string, unknown>);
      const isRecord =
        values.length > 0 &&
        values.every(
          (value) =>
            value === null ||
            value === undefined ||
            typeof value === 'string' ||
            typeof value === 'number' ||
            typeof value === 'boolean',
        );
      if (isRecord) {
        records.push(node as FlatRecord);
        return;
      }
      values.forEach(visit);
    };
    visit(parsed);
    return records;
  }

  private mapCustomers(records: FlatRecord[]): SourceCustomer[] {
    const customers: SourceCustomer[] = [];
    for (const record of records) {
      const nit = this.pick(record, ['nit', 'cedula', 'documento', 'idcliente']);
      const name = this.pick(record, [
        'nombre',
        'razonsocial',
        'cliente',
        'nomcliente',
        'nombres',
      ]);
      if (!nit || !name) continue;
      customers.push({
        externalId: this.pick(record, ['id', 'codigo', 'codcliente']) ?? nit,
        nit,
        name,
        email: this.pick(record, ['email', 'correo']),
        phone: this.pick(record, ['telefono', 'celular', 'movil']),
        address: this.pick(record, ['direccion']),
        city: this.pick(record, ['ciudad', 'municipio']),
      });
    }
    return customers;
  }

  private mapInvoices(records: FlatRecord[], fallbackDate: string): SourceInvoice[] {
    const grouped = new Map<string, SourceInvoice>();
    records.forEach((record) => {
      const invoiceId =
        this.pick(record, [
          'factura',
          'nofactura',
          'numero',
          'documento',
          'idfactura',
          'nrodocumento',
        ]) ?? '';
      const nit =
        this.pick(record, ['nit', 'cedula', 'documentocliente', 'idcliente', 'nitcliente']) ?? '';
      const issuedAt =
        this.normalizeDate(
          this.pick(record, ['fecha', 'fechafac', 'fechafactura', 'fechaemision']),
        ) ?? fallbackDate;
      const total = this.toNumber(
        this.pick(record, ['total', 'valortotal', 'valor', 'vrtotal', 'totalfactura']),
      );
      const margin = this.toNumber(this.pick(record, ['margen', 'utilidad', 'vrmargen'])) ?? 0;
      const quantity = this.toNumber(
        this.pick(record, ['cantidad', 'unidades', 'cant', 'qty']),
      );
      const productName =
        this.pick(record, ['producto', 'nombreproducto', 'articulo', 'descripcion']) ?? 'Total';
      const brand = this.pick(record, ['marca', 'brand']) ?? 'Sin marca';
      const category = this.pick(record, ['categoria', 'linea', 'grupo']) ?? 'Sin categoría';
      const unitPrice = this.toNumber(
        this.pick(record, ['valorunitario', 'precio', 'vr_unitario', 'preciounitario']),
      );
      const itemTotal = this.toNumber(
        this.pick(record, ['totalitem', 'subtotal', 'valoritem', 'totaldetalle']),
      );

      const key = invoiceId || `${nit}-${issuedAt}-${total}`;
      const existing = grouped.get(key);
      if (!existing) {
        grouped.set(key, {
          externalId: invoiceId || key,
          customerNit: nit,
          issuedAt,
          total: total ?? itemTotal ?? 0,
          margin,
          units: quantity ?? 0,
          items: [],
        });
      }
      const target = grouped.get(key);
      if (!target) return;
      const resolvedQty = quantity ?? 0;
      const resolvedTotal = itemTotal ?? total ?? 0;
      target.items.push({
        productName,
        brand,
        category,
        quantity: resolvedQty,
        unitPrice: unitPrice ?? (resolvedQty > 0 ? resolvedTotal / resolvedQty : 0),
        total: resolvedTotal,
        margin,
      });
      target.units += resolvedQty;
      if (total && target.total === 0) {
        target.total = total;
      }
    });
    return Array.from(grouped.values()).filter((invoice) => invoice.customerNit);
  }

  private mapPayments(records: FlatRecord[], fallbackDate: string): SourcePayment[] {
    const payments: SourcePayment[] = [];
    for (const record of records) {
      const customerNit =
        this.pick(record, ['nit', 'cedula', 'documentocliente', 'nitcliente']) ?? '';
      const paidAt =
        this.normalizeDate(this.pick(record, ['fecha', 'fechapago', 'fecpago'])) ?? fallbackDate;
      const amount = this.toNumber(
        this.pick(record, ['valor', 'abono', 'pago', 'valorpago', 'vrpago']),
      );
      if (!customerNit || amount === null) continue;
      payments.push({
        externalId:
          this.pick(record, ['recibo', 'documento', 'id', 'numero']) ??
          `${customerNit}-${paidAt}-${amount}`,
        customerNit,
        invoiceExternalId: this.pick(record, ['factura', 'nofactura', 'idfactura']),
        paidAt,
        amount,
      });
    }
    return payments;
  }

  private pick(record: FlatRecord, keys: string[]): string | undefined {
    const lower = Object.keys(record).reduce<Record<string, string>>((acc, key) => {
      const value = record[key];
      if (value === undefined || value === null) return acc;
      acc[key.toLowerCase()] = String(value);
      return acc;
    }, {});
    for (const key of keys) {
      const value = lower[key.toLowerCase()];
      if (value !== undefined && value !== '') return value;
    }
    return undefined;
  }

  private toNumber(value?: string): number | null {
    if (!value) return null;
    const cleaned = value.replace(/[^\d,.-]/g, '').replace(',', '.');
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private normalizeDate(value?: string): string | undefined {
    if (!value) return undefined;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return undefined;
    return parsed.toISOString().slice(0, 10);
  }
}
