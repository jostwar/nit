import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { XMLParser } from 'fast-xml-parser';
import { SourceApiClient, SourceCustomer, SourceInvoice, SourcePayment, FetchInvoicesResult } from './source-api.client';
import type { InventoryDirectoryService } from './inventory-directory.service';
import { normalizeCustomerId } from '../common/utils/customer-id.util';
import { normalizeRefer, UNMAPPED_BRAND, UNMAPPED_CLASS } from '../common/utils/refer.util';

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
  constructor(
    private readonly inventoryDirectory?: InventoryDirectoryService,
  ) {}

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
    options?: { cedula?: string; vendor?: string; tenantId?: string },
  ): Promise<FetchInvoicesResult> {
    const normalizedCedula = options?.cedula ? normalizeCustomerId(options.cedula) : '';
    const chunkDays = Number(process.env.SOURCE_VENTAS_CHUNK_DAYS ?? 7);
    const ranges = this.splitDateRange(from, to, Number.isFinite(chunkDays) ? chunkDays : 7);
    const rangeConcurrency = Math.min(3, Math.max(1, Number(process.env.SOURCE_VENTAS_RANGE_CONCURRENCY) || 2));
    const fetchRange = async (range: { from: Date; to: Date }) => {
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
      return this.extractRecords(xml);
    };
    const payload: FlatRecord[] = [];
    for (let i = 0; i < ranges.length; i += rangeConcurrency) {
      const batch = ranges.slice(i, i + rangeConcurrency);
      const results = await Promise.all(batch.map(fetchRange));
      for (const records of results) payload.push(...records);
    }
    const { brandMap, classMap } = await this.fetchInventoryMaps(
      tenantExternalId,
      options?.tenantId,
    );
    return this.mapInvoicesWithUnmapped(payload, from, brandMap, classMap);
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

  private readonly apiTimeoutMs = Number(process.env.SOURCE_API_TIMEOUT_MS) || 90000;

  private async getXml(url: string, params: Record<string, string | number>) {
    const response = await axios.get(url, {
      params,
      timeout: this.apiTimeoutMs,
    });
    const raw = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
    if (raw.includes('System.InvalidOperationException')) {
      throw new Error(`Fomplus API error: ${raw}`);
    }
    return raw;
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
      timeout: this.apiTimeoutMs,
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

  /** Cliente activo en ListadoClientes: CLI_ACTIVO responde false (activo = false). */
  private isClientActive(activoRaw: unknown): boolean {
    if (activoRaw == null || activoRaw === '') return true;
    if (typeof activoRaw === 'boolean') return !activoRaw;
    const s = String(activoRaw).trim().toLowerCase();
    if (s === 'false' || s === '0' || s === 'no') return true;
    if (s === 'true' || s === '1' || s === 'si' || s === 'sí' || s === 'yes') return false;
    return true;
  }

  /**
   * Mapea ListadoClientes a SourceCustomer.
   * Solo se incluyen clientes activos: CLI_ACTIVO debe ser false (activo = el campo responde false).
   * Tercero identificado por CLI_CEDULA y CLI_NOMBRE (mismo criterio que CEDULA/NOMCED en EstadoDeCuentaCartera y GenerarInfoVentas).
   */
  private mapCustomers(records: FlatRecord[]): SourceCustomer[] {
    const customers: SourceCustomer[] = [];
    for (const record of records) {
      const activoRaw = this.pick(record, ['cli_activo', 'activo', 'active']);
      if (!this.isClientActive(activoRaw)) continue;

      const nitRaw = this.pick(record, ['cli_cedula', 'nit', 'cedula', 'documento', 'idcliente']);
      const nit = normalizeCustomerId(nitRaw);
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
        creditLimit: (() => {
          const v = this.toNumber(
            this.pick(record, ['cli_cupcre', 'cupcre', 'cupo', 'cupocredito', 'credito', 'limite', 'creditlimit']),
          );
          return v != null && v >= 0 ? v : undefined;
        })(),
      });
    }
    return customers;
  }

  /** Códigos TIPMOV/TIPOMOV que restan venta (devoluciones, notas crédito). Por defecto 04,06,15. */
  private getTipomovRestaCodes(): Set<string> {
    const raw = process.env.SOURCE_VENTAS_TIPOMOV_RESTA ?? '04,06,15';
    return new Set(raw.split(',').map((c) => String(c).trim()).filter(Boolean));
  }

  private saleSignFromTipomov(tipomov: string | undefined): number {
    if (!tipomov || !String(tipomov).trim()) return 1;
    return this.getTipomovRestaCodes().has(String(tipomov).trim()) ? -1 : 1;
  }

  private mapInvoicesWithUnmapped(
    records: FlatRecord[],
    fallbackDate: string,
    brandMap: Map<string, string>,
    classMap: Map<string, string> = new Map(),
  ): FetchInvoicesResult {
    const grouped = new Map<string, SourceInvoice>();
    const useDocTotalKeys = new Set<string>();
    let unmappedRefsCount = 0;
    // Solo TIPMOV/TIPOMOV definen el tipo de movimiento. No usar TIPDOC (puede ser otro concepto y hace que 06/13 se muestren como 05/Otro).
    const tipomovKeys = (
      process.env.SOURCE_VENTAS_TIPOMOV_FIELDS ?? 'TIPMOV,TIPOMOV,tipmov,tipomov,tipo_mov,codmov,cod_tipomov'
    )
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);
    records.forEach((record) => {
      const tipomovRaw = this.pick(record, tipomovKeys.length > 0 ? tipomovKeys : ['TIPMOV', 'tipmov', 'TIPOMOV', 'tipomov']);
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
      const nitRaw =
        this.pick(record, ['cedula', 'nit', 'documentocliente', 'idcliente', 'nitcliente']) ?? '';
      const nit = normalizeCustomerId(nitRaw);
      const customerName =
        this.pick(record, ['nomced', 'cliente', 'nombre', 'razonsocial']) ?? undefined;
      // FECHA = Fecha Documento del ERP (GenerarInfoVentas). Las ventas se suman por esta fecha en la plataforma.
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
        normalizeRefer(
          this.pick(record, ['refer', 'referencia', 'codigo', 'codref']),
        ) || '';
      const productName =
        this.pick(record, ['nomref', 'producto', 'nombreproducto', 'articulo', 'descripcion']) ??
        'Total';
      const ventasBrandKeys = (
        process.env.SOURCE_VENTAS_BRAND_FIELDS ?? 'MARCA,nommar,nommarca,marca,brand,codmar'
      )
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean);
      const ventasClassKeys = (
        process.env.SOURCE_VENTAS_CLASS_FIELDS ?? 'CLASE,clase,codclase,class,codcla'
      )
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean);
      const brandFromRecord = this.pick(
        record,
        ventasBrandKeys.length > 0 ? ventasBrandKeys : ['MARCA', 'marca', 'brand'],
      );
      const classFromRecord = this.pick(
        record,
        ventasClassKeys.length > 0 ? ventasClassKeys : ['CLASE', 'clase', 'codclase'],
      );
      const mappedBrand =
        productRef && brandMap.has(productRef) ? brandMap.get(productRef) : undefined;
      const mappedClass =
        productRef ? classMap.get(productRef) : undefined;
      // Solo directorio cargado por CSV en la plataforma (REFER→MARCA). No usar campo MARCA del API.
      const brand =
        mappedBrand ??
        (productRef ? UNMAPPED_BRAND : null) ??
        'Sin marca';
      const classCode =
        (classFromRecord ? String(classFromRecord).trim() : undefined) ||
        (productRef ? mappedClass : undefined) ||
        (productRef ? UNMAPPED_CLASS : undefined) ||
        undefined;
      const className = mappedClass ?? classCode ?? undefined;
      if (productRef && (brand === UNMAPPED_BRAND || classCode === UNMAPPED_CLASS)) {
        unmappedRefsCount += 1;
      }
      const category =
        this.pick(record, ['nomsec', 'categoria', 'linea', 'grupo', 'codsec']) ?? 'Sin categoría';
      const unitPrice = this.toNumber(
        this.pick(record, ['valund', 'valorunitario', 'precio', 'vr_unitario', 'preciounitario']),
      );
      const itemTotal = this.toNumber(
        this.pick(record, ['valtot', 'totalitem', 'subtotal', 'valoritem', 'totaldetalle']),
      );
      const discountKeys = (
        process.env.SOURCE_VENTAS_DISCOUNT_FIELDS ?? 'VALDES,valdes,descuento,discount,vrdes,valordes'
      )
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean);
      const lineDiscount = this.toNumber(
        discountKeys.length > 0 ? this.pick(record, discountKeys) : undefined,
      );
      const lineTotalBeforeSign =
        (itemTotal ?? total ?? 0) - (lineDiscount != null && Number.isFinite(lineDiscount) ? lineDiscount : 0);

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
      const docTotalKeys = (
        process.env.SOURCE_VENTAS_DOCUMENT_TOTAL_FIELDS ?? 'totalfactura,total_documento,vrtotal_doc,total_doc'
      )
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean);
      const documentTotal =
        docTotalKeys.length > 0
          ? this.toNumber(this.pick(record, docTotalKeys))
          : undefined;
      if (!existing) {
        const groupTotal =
          documentTotal != null && Number.isFinite(documentTotal) ? documentTotal : 0;
        if (documentTotal != null && Number.isFinite(documentTotal)) {
          useDocTotalKeys.add(key);
        }
        grouped.set(key, {
          externalId: invoiceId || key,
          customerNit: nit,
          customerName,
          issuedAt,
          total: groupTotal,
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
      const resolvedTotal = lineTotalBeforeSign;
      target.items.push({
        productName: productRef || productName,
        brand,
        category,
        classCode,
        className,
        quantity: resolvedQty,
        unitPrice: unitPrice ?? (resolvedQty > 0 ? resolvedTotal / resolvedQty : 0),
        total: resolvedTotal,
        margin,
      });
      target.units += resolvedQty;
      if (!useDocTotalKeys.has(key)) {
        target.total += resolvedTotal;
      }
      target.margin += margin;
    });
    const invoices = Array.from(grouped.values()).filter((invoice) => invoice.customerNit);
    return { invoices, unmappedRefsCount };
  }

  /** Carga mapa referencia → marca desde CSV (scripts/ref-brand-mapping.csv). Formato: referencia,marca o ref,marca (primera fila puede ser cabecera). */
  private loadRefBrandMapFromCsv(): Map<string, string> {
    const map = new Map<string, string>();
    const envPath = process.env.SOURCE_REF_BRAND_CSV_PATH?.trim();
    const candidates = envPath
      ? [path.resolve(envPath)]
      : [
          path.resolve(process.cwd(), 'scripts', 'ref-brand-mapping.csv'),
          path.resolve(process.cwd(), '..', '..', 'scripts', 'ref-brand-mapping.csv'),
        ];
    let content: string | null = null;
    for (const filePath of candidates) {
      try {
        if (fs.existsSync(filePath)) {
          content = fs.readFileSync(filePath, 'utf-8');
          break;
        }
      } catch {
        // ignore
      }
    }
    if (!content) return map;
    const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const header = lines[0]?.toLowerCase() ?? '';
    const skipFirst = header.includes('referencia') || header.includes('ref') || header.includes('marca');
    const start = skipFirst ? 1 : 0;
    for (let i = start; i < lines.length; i++) {
      const parts = lines[i].split(/[,;\t]/).map((p) => p.replace(/^"|"$/g, '').trim());
      const ref = normalizeRefer(parts[0]);
      const brand = parts[1]?.trim();
      if (ref && brand) map.set(ref, brand);
    }
    return map;
  }

  /** Carga mapa referencia → clase (código) desde CSV (scripts/ref-class-mapping.csv). Formato: referencia,clase o ref,codclase (primera fila puede ser cabecera). */
  private loadRefClassMapFromCsv(): Map<string, string> {
    const map = new Map<string, string>();
    const envPath = process.env.SOURCE_REF_CLASS_CSV_PATH?.trim();
    const candidates = envPath
      ? [path.resolve(envPath)]
      : [
          path.resolve(process.cwd(), 'scripts', 'ref-class-mapping.csv'),
          path.resolve(process.cwd(), '..', '..', 'scripts', 'ref-class-mapping.csv'),
        ];
    let content: string | null = null;
    for (const filePath of candidates) {
      try {
        if (fs.existsSync(filePath)) {
          content = fs.readFileSync(filePath, 'utf-8');
          break;
        }
      } catch {
        // ignore
      }
    }
    if (!content) return map;
    const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const header = lines[0]?.toLowerCase() ?? '';
    const skipFirst =
      header.includes('referencia') || header.includes('ref') || header.includes('clase') || header.includes('codclase');
    const start = skipFirst ? 1 : 0;
    for (let i = start; i < lines.length; i++) {
      const parts = lines[i].split(/[,;\t]/).map((p) => p.replace(/^"|"$/g, '').trim());
      const ref = normalizeRefer(parts[0]);
      const classCode = parts[1]?.trim();
      if (ref && classCode) map.set(ref, classCode);
    }
    return map;
  }

  private inventoryMapsCache = new Map<
    string,
    { brandMap: Map<string, string>; classMap: Map<string, string>; ts: number }
  >();
  private readonly inventoryMapsCacheTtlMs = 60000;

  private async fetchInventoryMaps(
    tenantExternalId: string,
    tenantId?: string,
  ): Promise<{ brandMap: Map<string, string>; classMap: Map<string, string> }> {
    const key = tenantId ?? tenantExternalId;
    const cached = this.inventoryMapsCache.get(key);
    if (cached && Date.now() - cached.ts < this.inventoryMapsCacheTtlMs) {
      return { brandMap: cached.brandMap, classMap: cached.classMap };
    }
    if (tenantId && this.inventoryDirectory) {
      try {
        const maps = await this.inventoryDirectory.getRefBrandClassMap(tenantId);
        this.inventoryMapsCache.set(key, { ...maps, ts: Date.now() });
        return maps;
      } catch {
        // si falla BD, devolver mapas vacíos
      }
    }
    const empty = { brandMap: new Map<string, string>(), classMap: new Map<string, string>() };
    return empty;
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
      const customerNitRaw =
        this.pick(record, ['cedula', 'nit', 'documentocliente', 'nitcliente']) ?? '';
      const customerNit = normalizeCustomerId(customerNitRaw);
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
      const creditLimit = this.toNumber(
        this.pick(record, ['cli_cupcre', 'cupcre', 'cupo', 'cupocredito', 'credito', 'creditlimit', 'cupo_credito', 'limite']),
      );
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
        creditLimit: creditLimit != null && creditLimit >= 0 ? creditLimit : undefined,
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
