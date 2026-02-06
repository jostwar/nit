import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';
import { SourceApiClient, SourceCustomer, SourceInvoice, SourcePayment } from './source-api.client';

type FomplusConfig = {
  carteraBaseUrl: string;
  ventasBaseUrl: string;
  inventarioBaseUrl: string;
  database: string;
  token: string;
  inventarioToken: string;
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
    inventarioToken:
      process.env.SOURCE_API_INVENTARIO_TOKEN ?? process.env.SOURCE_API_TOKEN ?? '',
    vendor: process.env.SOURCE_API_VENDOR ?? '',
  };

  async fetchInvoices(
    tenantExternalId: string,
    from: string,
    to: string,
    options?: { cedula?: string; vendor?: string },
  ): Promise<SourceInvoice[]> {
    const normalizedCedula = options?.cedula ? this.normalizeId(options.cedula) : '';
    const chunkDays = Number(process.env.SOURCE_VENTAS_CHUNK_DAYS ?? 7);
    const ranges = this.splitDateRange(from, to, Number.isFinite(chunkDays) ? chunkDays : 7);
    const payload: FlatRecord[] = [];
    for (const range of ranges) {
      const params: Record<string, string | number> = {
        strPar_Empresa: this.config.database || tenantExternalId,
        datPar_FecIni: this.formatDateOnly(range.from),
        datPar_FecFin: this.formatDateOnly(range.to),
        objPar_Objeto: this.config.token,
      };
      if (normalizedCedula) {
        params.strPar_Nit = normalizedCedula;
        params.strPar_Cedula = normalizedCedula;
      }
      const xml = await this.getWithSoapFallback(
        `${this.config.ventasBaseUrl}/srvAPI.asmx/GenerarInfoVentas`,
        `${this.config.ventasBaseUrl}/srvAPI.asmx`,
        'http://tempuri.org/GenerarInfoVentas',
        'GenerarInfoVentas',
        params,
      );
      const records = this.extractRecords(xml);
      payload.push(...records);
    }
    const { brandMap, classMap } = await this.fetchInventoryMaps(tenantExternalId);
    return this.mapInvoices(payload, from, brandMap, classMap);
  }

  async fetchPayments(
    tenantExternalId: string,
    _from: string,
    to: string,
    options?: { cedula?: string; vendor?: string },
  ): Promise<SourcePayment[]> {
    const params = {
      strPar_Basedatos: this.config.database || tenantExternalId,
      strPar_Token: this.config.token,
      datPar_Fecha: this.formatDateTime(to),
      strPar_Cedula: options?.cedula ?? '',
      strPar_Vended: options?.vendor ?? this.config.vendor ?? '',
    };
    const xml = await this.getWithSoapFallback(
      `${this.config.carteraBaseUrl}/srvCxcPed.asmx/EstadoDeCuentaCartera`,
      `${this.config.carteraBaseUrl}/srvCxcPed.asmx`,
      'http://tempuri.org/EstadoDeCuentaCartera',
      'EstadoDeCuentaCartera',
      params,
    );
    const records = this.extractRecords(xml);
    return this.mapPayments(records, to);
  }

  async fetchCustomers(
    tenantExternalId: string,
    page: number,
    pageSize: number,
    vendor?: string,
  ): Promise<SourceCustomer[]> {
    const params = {
      strPar_Basedatos: this.config.database || tenantExternalId,
      strPar_Token: this.config.token,
      strPar_Vended: vendor ?? '',
      intPar_Filas: pageSize,
      intPar_Pagina: page,
    };
    const xml = await this.getWithSoapFallback(
      `${this.config.carteraBaseUrl}/srvCxcPed.asmx/ListadoClientes`,
      `${this.config.carteraBaseUrl}/srvCxcPed.asmx`,
      'http://tempuri.org/ListadoClientes',
      'ListadoClientes',
      params,
    );
    const records = this.extractRecords(xml);
    return this.mapCustomers(records);
  }

  private async getXml(url: string, params: Record<string, string | number>) {
    const response = await axios.get(url, {
      params,
      timeout: 0,
    });
    const raw = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
    if (raw.includes('System.InvalidOperationException')) {
      throw new Error(`Fomplus API error: ${raw}`);
    }
    return raw;
  }

  private normalizeId(value?: string) {
    if (!value) return '';
    return value.replace(/[^\d]/g, '');
  }

  private formatDateOnly(value: string | Date) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      return new Date().toISOString().slice(0, 10);
    }
    return date.toISOString().slice(0, 10);
  }

  private formatDateTime(value: string | Date) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      return new Date().toISOString().slice(0, 19).replace('T', ' ');
    }
    return date.toISOString().slice(0, 19).replace('T', ' ');
  }

  private splitDateRange(from: string, to: string, chunkDays = 7) {
    const start = new Date(from);
    const end = new Date(to);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return [];
    }
    const ranges: Array<{ from: Date; to: Date }> = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      const rangeStart = new Date(cursor);
      const rangeEnd = new Date(cursor);
      rangeEnd.setDate(rangeEnd.getDate() + Math.max(0, chunkDays - 1));
      if (rangeEnd > end) {
        rangeEnd.setTime(end.getTime());
      }
      ranges.push({ from: rangeStart, to: rangeEnd });
      cursor.setDate(cursor.getDate() + Math.max(1, chunkDays));
    }
    return ranges;
  }

  private async getWithSoapFallback(
    getUrl: string,
    soapUrl: string,
    action: string,
    method: string,
    params: Record<string, string | number>,
  ) {
    try {
      return await this.getXml(getUrl, params);
    } catch {
      return this.postSoap(soapUrl, action, method, params);
    }
  }

  private async postSoap(
    url: string,
    action: string,
    method: string,
    params: Record<string, string | number>,
  ) {
    const filteredParams = Object.entries(params).filter(
      ([, value]) => value !== undefined && value !== null && value !== '',
    );
    const body = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <${method} xmlns="http://tempuri.org/">
      ${filteredParams
        .map(([key, value]) => `<${key}>${value}</${key}>`)
        .join('')}
    </${method}>
  </soap:Body>
</soap:Envelope>`;
    const response = await axios.post(url, body, {
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        SOAPAction: `"${action}"`,
      },
      timeout: 0,
    });
    return response.data;
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
        city: this.pick(record, [
          'cli_nomciu',
          'cli_ciudad',
          'nomciu',
          'nomciudad',
          'ciudad',
          'municipio',
          'codciu',
          'departamento',
          'nom_departamento',
          'region',
          'ciudade',
          'NOMSEC',
          'nomsec',
        ]),
        segment: this.pick(record, ['cli_nomsec', 'cli_sector', 'nomsec', 'sector', 'NOMSEC']),
        vendor: this.pick(record, ['cli_nomven', 'nomven', 'vendedor', 'cli_vended', 'vended']),
      });
    }
    return customers;
  }

  /** Códigos TIPOMOV que restan venta (devoluciones, notas crédito). Por defecto 04,06,15. */
  private getTipomovRestaCodes(): Set<string> {
    const raw = process.env.SOURCE_VENTAS_TIPOMOV_RESTA ?? '04,06,15';
    return new Set(raw.split(',').map((c) => String(c).trim()).filter(Boolean));
  }

  private saleSignFromTipomov(tipomov: string | undefined): number {
    if (!tipomov || !String(tipomov).trim()) return 1;
    return this.getTipomovRestaCodes().has(String(tipomov).trim()) ? -1 : 1;
  }

  private mapInvoices(
    records: FlatRecord[],
    fallbackDate: string,
    brandMap: Map<string, string>,
    classMap: Map<string, string> = new Map(),
  ): SourceInvoice[] {
    const grouped = new Map<string, SourceInvoice>();
    records.forEach((record) => {
      const tipomovRaw = this.pick(record, ['tipomov', 'tipmov', 'tipo_mov', 'tipodoc', 'codmov']);
      const documentType = tipomovRaw ? String(tipomovRaw).trim() : undefined;
      const saleSign = this.saleSignFromTipomov(documentType);
      const prefijo = this.pick(record, ['prefijo', 'prefij', 'prefac']) ?? '';
      const numdoc = this.pick(record, ['numdoc', 'numero', 'documento', 'docafe']) ?? '';
      const baseInvoiceId =
        this.pick(record, [
          'docafe',
          'factura',
          'nofactura',
          'numero',
          'documento',
          'idfactura',
          'nrodocumento',
        ]) ?? '';
      const invoiceId =
        baseInvoiceId && prefijo ? `${prefijo}${baseInvoiceId}` : baseInvoiceId ||
        (prefijo && numdoc ? `${prefijo}${numdoc}` : '');
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
        this.normalizeRef(
          this.pick(record, ['refer', 'referencia', 'codigo', 'codref']),
        ) || '';
      const productName =
        this.pick(record, ['nomref', 'producto', 'nombreproducto', 'articulo', 'descripcion']) ??
        'Total';
      const mappedBrand =
        productRef && brandMap.has(productRef) ? brandMap.get(productRef) : undefined;
      const brand =
        mappedBrand ??
        (productRef ? 'Sin marca' : null) ??
        this.pick(record, ['MARCA', 'nommar', 'nommarca', 'marca', 'brand']) ??
        'Sin marca';
      const classCode =
        productRef && classMap.has(productRef) ? classMap.get(productRef) ?? undefined : undefined;
      const category =
        this.pick(record, ['nomsec', 'categoria', 'linea', 'grupo', 'codsec']) ?? 'Sin categoría';
      const unitPrice = this.toNumber(
        this.pick(record, ['valund', 'valorunitario', 'precio', 'vr_unitario', 'preciounitario']),
      );
      const itemTotal = this.toNumber(
        this.pick(record, ['valtot', 'totalitem', 'subtotal', 'valoritem', 'totaldetalle']),
      );

      const nomven =
        this.pick(record, ['nomven', 'nomvendedor', 'vendedor', 'cli_nomven', 'vended']) ?? undefined;
      const cityKeys = (
        process.env.SOURCE_VENTAS_CITY_FIELDS ??
        'cli_nomciu,cli_ciudad,nomciu,nomciudad,ciudad,municipio,departamento,nom_departamento,region,ciudade,ciudaddestino,ciudad_destino,destino,codciudad,nombre_ciudad,NOMSEC,nomsec'
      )
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean);
      const ciudad =
        this.pick(record, cityKeys.length > 0 ? cityKeys : ['ciudad', 'nomciu', 'NOMSEC']) ??
        undefined;
      const key = invoiceId || `${nit}-${prefijo}${numdoc || ''}-${issuedAt}`;
      const existing = grouped.get(key);
      if (!existing) {
        grouped.set(key, {
          externalId: invoiceId || key,
          customerNit: nit,
          customerName,
          issuedAt,
          total: 0,
          margin: 0,
          units: quantity ?? 0,
          vendor: nomven,
          city: ciudad,
          documentType,
          saleSign,
          items: [],
        });
      }
      const target = grouped.get(key);
      if (!target) return;
      if (ciudad?.trim() && !target.city?.trim()) target.city = ciudad;
      const resolvedQty = quantity ?? 0;
      const resolvedTotal = itemTotal ?? total ?? 0;
      target.items.push({
        productName: productRef || productName,
        brand,
        category,
        classCode,
        quantity: resolvedQty,
        unitPrice: unitPrice ?? (resolvedQty > 0 ? resolvedTotal / resolvedQty : 0),
        total: resolvedTotal,
        margin,
      });
      target.units += resolvedQty;
      target.total += resolvedTotal;
      target.margin += margin;
    });
    return Array.from(grouped.values()).filter((invoice) => invoice.customerNit);
  }

  private async fetchInventoryMaps(
    tenantExternalId: string,
  ): Promise<{ brandMap: Map<string, string>; classMap: Map<string, string> }> {
    const empty = { brandMap: new Map<string, string>(), classMap: new Map<string, string>() };
    if (!this.config.inventarioBaseUrl || !this.config.inventarioToken) {
      return empty;
    }
    try {
      const fecha = new Date().toISOString().slice(0, 10);
      const xml = await this.getXml(
        `${this.config.inventarioBaseUrl}/srvAPI.asmx/GenerarInformacionInventariosGet`,
        {
          strPar_Basedatos: this.config.database || tenantExternalId,
          strPar_Token: this.config.inventarioToken,
          datPar_Fecha: fecha,
          strPar_Bodega: process.env.SOURCE_INVENTARIO_BODEGA ?? '0001',
          bolPar_ConSaldo: process.env.SOURCE_INVENTARIO_CON_SALDO ?? 'False',
          bolPar_Conlmg: process.env.SOURCE_INVENTARIO_CON_IMG ?? 'False',
          bolPar_ConSer: process.env.SOURCE_INVENTARIO_CON_SER ?? 'False',
          strError: '-',
          intPar_Filas: Number(process.env.SOURCE_INVENTARIO_FILAS ?? 10000),
          intPar_Pagina: 1,
          intPar_LisPre: 0,
        },
      );
      const records = this.extractRecords(xml);
      const brandMap = new Map<string, string>();
      const classMap = new Map<string, string>();
      const brandKeys = (process.env.SOURCE_INVENTARIO_BRAND_FIELDS ?? 'MARCA,marca,nommar,nommarca,brand')
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean);
      const classKeys = (process.env.SOURCE_INVENTARIO_CLASS_FIELDS ?? 'CLASE,clase,codclase,class')
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean);
      records.forEach((record) => {
        const ref = this.normalizeRef(
          this.pick(record, ['refer', 'referencia', 'codigo', 'codref']),
        );
        const brand = this.pick(record, brandKeys.length > 0 ? brandKeys : ['marca', 'brand']);
        const classCode = this.pick(record, classKeys.length > 0 ? classKeys : ['clase', 'codclase']);
        if (ref && brand) brandMap.set(ref, brand);
        if (ref && classCode) classMap.set(ref, classCode);
      });
      return { brandMap, classMap };
    } catch {
      return empty;
    }
  }

  /** Marcas únicas desde inventario; cruce por referencia con ventas. */
  async getInventoryBrandNames(tenantExternalId: string): Promise<string[]> {
    const { brandMap } = await this.fetchInventoryMaps(tenantExternalId);
    const names = Array.from(new Set(brandMap.values())).filter((b) => b && b.trim() !== '');
    return names.sort((a, b) => a.localeCompare(b, 'es'));
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

  /** Normaliza referencia para cruce inventario/ventas (trim; mismo criterio en ambos APIs). */
  private normalizeRef(ref: string | undefined): string {
    if (!ref || typeof ref !== 'string') return '';
    return ref.trim();
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
