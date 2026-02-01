import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';
import { SourceApiClient, SourceCustomer, SourceInvoice, SourcePayment } from './source-api.client';

type FomplusConfig = {
  carteraBaseUrl: string;
  ventasBaseUrl: string;
  inventarioBaseUrl: string;
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
    inventarioBaseUrl:
      process.env.SOURCE_API_INVENTARIO_BASE_URL ?? 'https://gspapi.fomplus.com',
    database: process.env.SOURCE_API_DB ?? '',
    token: process.env.SOURCE_API_TOKEN ?? '',
    vendor: process.env.SOURCE_API_VENDOR ?? '',
  };

  async fetchInvoices(tenantExternalId: string, from: string, to: string): Promise<SourceInvoice[]> {
    const xml = await this.getXml(`${this.config.ventasBaseUrl}/srvAPI.asmx/DetalleFacturasPedido`, {
      strPar_BaseDatos: this.config.database || tenantExternalId,
      strPar_Token: this.config.token,
      datPar_FechaIni: from,
      datPar_FechaFin: to,
      strPar_Vended: this.config.vendor ?? '',
    });
    const records = this.extractRecords(xml);
    const brandMap = await this.fetchInventoryBrands(tenantExternalId);
    return this.mapInvoices(records, from, brandMap);
  }

  async fetchPayments(tenantExternalId: string, _from: string, to: string): Promise<SourcePayment[]> {
    const xml = await this.getXml(`${this.config.carteraBaseUrl}/srvCxcPed.asmx/EstadoCuentasCartera`, {
      strPar_BaseDatos: this.config.database || tenantExternalId,
      strPar_Token: this.config.token,
      datPar_Fecha: to,
      strPar_Cedula: '',
      strPar_Vended: this.config.vendor ?? '',
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
      strPar_BaseDatos: this.config.database || tenantExternalId,
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
    const raw = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
    if (raw.includes('System.InvalidOperationException')) {
      throw new Error(`Fomplus API error: ${raw}`);
    }
    return raw;
  }

  private extractRecords(payload: string): FlatRecord[] {
    const trimmed = this.stripBom(payload.trim());
    const parsed =
      trimmed.startsWith('{') || trimmed.startsWith('[')
        ? this.parseJson(trimmed)
        : this.parser.parse(payload);
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

  private parseJson(payload: string): unknown {
    try {
      return JSON.parse(payload);
    } catch {
      const fixed = this.sliceJson(payload);
      if (fixed) {
        try {
          return JSON.parse(fixed);
        } catch {
          return payload;
        }
      }
      return payload;
    }
  }

  private sliceJson(payload: string): string | null {
    const startArray = payload.indexOf('[');
    const endArray = payload.lastIndexOf(']');
    if (startArray !== -1 && endArray !== -1 && endArray > startArray) {
      return payload.slice(startArray, endArray + 1);
    }
    const startObj = payload.indexOf('{');
    const endObj = payload.lastIndexOf('}');
    if (startObj !== -1 && endObj !== -1 && endObj > startObj) {
      return payload.slice(startObj, endObj + 1);
    }
    return null;
  }

  private stripBom(payload: string): string {
    return payload.replace(/^\uFEFF/, '');
  }

  private mapCustomers(records: FlatRecord[]): SourceCustomer[] {
    const customers: SourceCustomer[] = [];
    for (const record of records) {
      const nit = this.pick(record, ['cli_cedula', 'nit', 'cedula', 'documento', 'idcliente']);
      const name = this.pick(record, [
        'cli_nombre',
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
        email: this.pick(record, ['cli_email', 'email', 'correo']),
        phone: this.pick(record, ['cli_telefo', 'cli_telcel', 'telefono', 'celular', 'movil']),
        address: this.pick(record, ['cli_direcc', 'direccion']),
        city: this.pick(record, ['ciudad', 'municipio', 'nomciu']),
        segment: this.pick(record, ['cli_nomsec', 'nomsec', 'sector']),
        vendor: this.pick(record, ['cli_nomven', 'nomven', 'vendedor']),
      });
    }
    return customers;
  }

  private mapInvoices(
    records: FlatRecord[],
    fallbackDate: string,
    brandMap: Map<string, string>,
  ): SourceInvoice[] {
    const grouped = new Map<string, SourceInvoice>();
    records.forEach((record) => {
      const prefijo = this.pick(record, ['prefijo', 'prefij', 'prefac']) ?? '';
      const numdoc = this.pick(record, ['numdoc', 'numero', 'documento', 'docafe']) ?? '';
      const invoiceId =
        this.pick(record, [
          'docafe',
          'factura',
          'nofactura',
          'numero',
          'documento',
          'idfactura',
          'nrodocumento',
        ]) ?? (prefijo && numdoc ? `${prefijo}${numdoc}` : '');
      const nit =
        this.pick(record, ['cedula', 'nit', 'documentocliente', 'idcliente', 'nitcliente']) ?? '';
      const customerName =
        this.pick(record, ['nomced', 'cliente', 'nombre', 'razonsocial']) ?? undefined;
      const issuedAt =
        this.normalizeDate(
          this.pick(record, ['fecha', 'fechafac', 'fechafactura', 'fechaemision', 'fecfac']),
        ) ?? fallbackDate;
      const total = this.toNumber(
        this.pick(record, ['valtot', 'total', 'valortotal', 'valor', 'vrtotal', 'totalfactura']),
      );
      const margin =
        this.toNumber(this.pick(record, ['valuti', 'margen', 'utilidad', 'vrmargen'])) ?? 0;
      const quantity = this.toNumber(
        this.pick(record, ['cantid', 'cantidad', 'unidades', 'cant', 'qty']),
      );
      const productRef =
        this.pick(record, ['refer', 'referencia', 'codigo', 'codref']) ?? '';
      const productName =
        this.pick(record, ['nomref', 'producto', 'nombreproducto', 'articulo', 'descripcion']) ??
        'Total';
      const mappedBrand =
        productRef && brandMap.has(productRef) ? brandMap.get(productRef) : undefined;
      const brand =
        mappedBrand ??
        this.pick(record, ['nommar', 'nommarca', 'marca', 'brand']) ??
        'Sin marca';
      const category =
        this.pick(record, ['nomsec', 'categoria', 'linea', 'grupo', 'codsec']) ?? 'Sin categoría';
      const unitPrice = this.toNumber(
        this.pick(record, ['valund', 'valorunitario', 'precio', 'vr_unitario', 'preciounitario']),
      );
      const itemTotal = this.toNumber(
        this.pick(record, ['valtot', 'totalitem', 'subtotal', 'valoritem', 'totaldetalle']),
      );

      const key = invoiceId || `${nit}-${issuedAt}-${total}`;
      const existing = grouped.get(key);
      if (!existing) {
        grouped.set(key, {
          externalId: invoiceId || key,
          customerNit: nit,
          customerName,
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
        productName: productRef || productName,
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

  private async fetchInventoryBrands(tenantExternalId: string): Promise<Map<string, string>> {
    if (!this.config.inventarioBaseUrl || !this.config.token) {
      return new Map();
    }
    try {
      const xml = await this.getXml(
        `${this.config.inventarioBaseUrl}/srvAPI.asmx/GenerarInformacionInventariosGet`,
        {
          strPar_Empresa: this.config.database || tenantExternalId,
          objPar_Objeto: this.config.token,
        },
      );
      const records = this.extractRecords(xml);
      const map = new Map<string, string>();
      records.forEach((record) => {
        const ref = this.pick(record, ['refer', 'referencia', 'codigo', 'codref']);
        const brand = this.pick(record, ['nommar', 'nommarca', 'marca', 'brand']);
        if (ref && brand) {
          map.set(ref, brand);
        }
      });
      return map;
    } catch {
      return new Map();
    }
  }

  private mapPayments(records: FlatRecord[], fallbackDate: string): SourcePayment[] {
    const payments: SourcePayment[] = [];
    for (const record of records) {
      const customerNit =
        this.pick(record, ['cedula', 'nit', 'documentocliente', 'nitcliente']) ?? '';
      const customerName =
        this.pick(record, ['nomced', 'cliente', 'nombre', 'razonsocial']) ?? undefined;
      const paidAt =
        this.normalizeDate(
          this.pick(record, ['ultpag', 'fecha', 'fechapago', 'fecpago']),
        ) ?? fallbackDate;
      const amount =
        this.toNumber(this.pick(record, ['valor', 'abono', 'pago', 'valorpago', 'vrpago'])) ?? 0;
      const balance = this.toNumber(this.pick(record, ['saldo'])) ?? undefined;
      const dueAt = this.normalizeDate(this.pick(record, ['fecven', 'fechaven', 'fechavenc']));
      const overdueDays = this.toNumber(this.pick(record, ['daiaven'])) ?? undefined;
      if (!customerNit) continue;
      payments.push({
        externalId:
          this.pick(record, ['numdoc', 'prefij', 'recibo', 'documento', 'id', 'numero']) ??
          `${customerNit}-${paidAt}-${balance ?? amount}`,
        customerNit,
        customerName,
        invoiceExternalId: this.pick(record, ['numdoc', 'factura', 'nofactura', 'idfactura']),
        paidAt,
        amount,
        balance,
        dueAt,
        overdueDays: overdueDays ?? undefined,
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
