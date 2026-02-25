import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { parseRange } from '../common/utils/date-range';
import { CopilotToolsService } from './copilot-tools.service';
import { ExportStoreService } from './export-store.service';
import {
  CopilotResponse,
  CopilotTable,
  CopilotAppliedFilters,
} from './copilot-response.schema';
import { randomUUID } from 'crypto';

const OPENAI_MODEL = 'gpt-4o-mini';

const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'resolve_period',
      description: 'Resuelve texto de periodo a fechas ISO (ej. "último trimestre", "últimos 30 días", "mes actual"). Zona America/Bogota.',
      parameters: {
        type: 'object',
        properties: { text: { type: 'string' } },
        required: ['text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'sales_top',
      description: 'Top ventas agrupadas por la dimensión que pida el usuario: clientes (customer), vendedores (seller), marcas (brand), clases (class), referencias/productos (product) o por mes (month). order desc = mayor venta primero, order asc = menor venta primero. Filtros opcionales ciudad, vendedor, marca, clase.',
      parameters: {
        type: 'object',
        properties: {
          start: { type: 'string', description: 'ISO YYYY-MM-DD' },
          end: { type: 'string', description: 'ISO YYYY-MM-DD' },
          group_by: { type: 'string', enum: ['customer', 'brand', 'class', 'product', 'seller', 'month'], description: 'customer=clientes, seller=vendedores, brand=marcas, class=clases, product=referencias/productos, month=ventas por mes' },
          order: { type: 'string', enum: ['asc', 'desc'], description: 'desc = mayor venta primero (default), asc = menor venta primero' },
          city: { type: 'string' },
          vendor: { type: 'string' },
          brand: { type: 'string' },
          class: { type: 'string' },
          limit: { type: 'number' },
        },
        required: ['start', 'end', 'group_by'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'sales_change',
      description: 'Comparar dos periodos: mayor caída o mayor crecimiento por ventas/unidades/margen. group_by: customer o seller.',
      parameters: {
        type: 'object',
        properties: {
          start: { type: 'string' },
          end: { type: 'string' },
          compare_start: { type: 'string' },
          compare_end: { type: 'string' },
          group_by: { type: 'string', enum: ['customer', 'seller'] },
          metric: { type: 'string', enum: ['sales', 'units', 'margin'] },
          direction: { type: 'string', enum: ['drop', 'growth'] },
          city: { type: 'string' },
          vendor: { type: 'string' },
          limit: { type: 'number' },
        },
        required: ['start', 'end', 'compare_start', 'compare_end', 'group_by', 'metric', 'direction'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ar_summary',
      description: 'Resumen de cartera (cuentas por cobrar): saldo, vencido, DSO por cliente. Si piden "más vencidos" o "más vencido", usa only_overdue true y order_by overdue.',
      parameters: {
        type: 'object',
        properties: {
          start: { type: 'string' },
          end: { type: 'string' },
          group_by: { type: 'string', enum: ['customer', 'vendor'] },
          limit: { type: 'number' },
          only_overdue: { type: 'boolean', description: 'Solo clientes con saldo vencido > 0.' },
          order_by: { type: 'string', enum: ['balance', 'overdue'], description: 'Ordenar por saldo o por vencido (desc).' },
        },
        required: ['start', 'end'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'customer_lookup',
      description: 'Buscar clientes por NIT o nombre.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'sync_status',
      description: 'Estado de la última sincronización con el ERP (fecha, duración, error).',
      parameters: { type: 'object', properties: {} },
    },
  },
];

@Injectable()
export class CopilotService {
  private readonly logger = new Logger(CopilotService.name);
  private readonly openai: OpenAI | null;

  constructor(
    private readonly tools: CopilotToolsService,
    private readonly exportStore: ExportStoreService,
  ) {
    const key = process.env.OPENAI_API_KEY?.trim();
    this.openai = key ? new OpenAI({ apiKey: key }) : null;
  }

  async ask(
    tenantId: string,
    question: string,
    start?: string,
    end?: string,
    filters?: { city?: string; vendor?: string; brand?: string; class?: string },
  ): Promise<CopilotResponse> {
    const appliedFilters: CopilotAppliedFilters = {
      start: '',
      end: '',
      seller: filters?.vendor ?? null,
      city: filters?.city ?? null,
      brand: filters?.brand ?? null,
      class: filters?.class ?? null,
    };

    let rangeStart = start;
    let rangeEnd = end;
    const resolvedFromQuestion = this.tools.resolve_period({ text: question });
    if (resolvedFromQuestion && !rangeStart && !rangeEnd) {
      rangeStart = resolvedFromQuestion.start;
      rangeEnd = resolvedFromQuestion.end;
    }
    if (!rangeStart || !rangeEnd) {
      const defaultRange = parseRange(rangeStart, rangeEnd);
      rangeStart = defaultRange.from.toISOString().slice(0, 10);
      rangeEnd = defaultRange.to.toISOString().slice(0, 10);
    } else {
      parseRange(rangeStart, rangeEnd);
    }
    appliedFilters.start = rangeStart;
    appliedFilters.end = rangeEnd;

    const warnings: string[] = [];
    const tables: CopilotTable[] = [];

    if (!this.openai) {
      const fallback = await this.runFallbackWithoutOpenAI(tenantId, question, rangeStart, rangeEnd, filters);
      return {
        answer: fallback.answer,
        tables: fallback.tables,
        download_available: fallback.tables.length > 0,
        download_query_id: fallback.tables.length > 0 ? this.storeAndGetId(fallback.tables) : null,
        applied_filters: appliedFilters,
        warnings: fallback.warnings,
      };
    }

    const systemContent = `Eres un asistente de BI. Contexto: empresa/tenant actual; periodo ${rangeStart} a ${rangeEnd}; filtros opcionales: ciudad=${filters?.city ?? 'ninguno'}, vendedor=${filters?.vendor ?? 'ninguno'}, marca=${filters?.brand ?? 'ninguno'}, clase=${filters?.class ?? 'ninguno'}.
Responde usando las herramientas. Sin SQL libre. Si piden "último trimestre" o "mes actual" ya tienes el periodo en contexto.
El usuario puede consultar ventas por CUALQUIERA de estas dimensiones: clientes (group_by: customer), vendedores (seller), marcas (brand), clases (class), referencias o productos (product), o por mes / evolución mensual (group_by: month). Elige siempre el group_by que coincida con lo que pide (ej. "top marcas" -> brand, "ventas por mes" -> month).
Sinónimos: marca=brand, clase=class, cliente=customer, caída=drop, vendedor=seller. Para "menos ventas", "menor venta" usa sales_top con order: "asc".`;

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemContent },
      { role: 'user', content: question },
    ];

    const startTime = Date.now();
    const QUERY_TIMEOUT_MS = 45_000;

    try {
      this.logger.log(`Copilot ask start tenant=${tenantId} question_len=${question.length}`);
      let round = 0;
      const maxRounds = 3;
      while (round < maxRounds) {
        const completion = await this.openai.chat.completions.create({
          model: OPENAI_MODEL,
          messages,
          tools: TOOLS,
          tool_choice: 'auto',
          max_tokens: 2048,
        });

        const choice = completion.choices[0];
        if (!choice?.message) {
          warnings.push('No se recibió respuesta del modelo.');
          break;
        }

        messages.push({
          role: 'assistant',
          content: choice.message.content ?? '',
          tool_calls: choice.message.tool_calls,
        });

        if (!choice.message.tool_calls?.length) {
          const answer = (choice.message.content ?? '').trim() || 'No pude generar una respuesta.';
          const queryId = tables.length > 0 ? this.storeAndGetId(tables) : null;
          return {
            answer,
            tables,
            download_available: tables.length > 0,
            download_query_id: queryId,
            applied_filters: appliedFilters,
            warnings,
          };
        }

        for (const tc of choice.message.tool_calls) {
          if (Date.now() - startTime > QUERY_TIMEOUT_MS) {
            warnings.push('Tiempo de consulta agotado.');
            break;
          }
          const name = tc.function?.name;
          const args = (() => {
            try {
              return JSON.parse(tc.function?.arguments ?? '{}');
            } catch {
              return {};
            }
          })();
          const result = await this.executeTool(tenantId, name, args, rangeStart, rangeEnd, filters);
          tables.push({ title: name, columns: result.columns, rows: result.rows });
          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify(result),
          });
        }
        round++;
      }

      const finalAnswer = await this.openai.chat.completions.create({
        model: OPENAI_MODEL,
        messages: [
          ...messages,
          {
            role: 'user',
            content: `Con los resultados de las herramientas anteriores, escribe UNA sola frase breve en texto natural. NO incluyas listas, tablas con pipes ni repitas filas de datos; todo el contenido debe verse solo en la tabla debajo. Si no hay datos, explica brevemente. Responde solo el texto, sin JSON.`,
          },
        ],
        max_tokens: 1024,
      });

      const answer =
        finalAnswer.choices[0]?.message?.content?.trim() ||
        (tables.length > 0 ? 'Consulta los datos en las tablas.' : 'No hay datos para el periodo o filtros seleccionados.');

      if (tables.length === 0 && !answer.includes('ampliar')) {
        warnings.push('No se encontraron datos; considera ampliar el rango de fechas o relajar filtros.');
      }

      const queryId = tables.length > 0 ? this.storeAndGetId(tables) : null;
      this.logger.log(`Copilot ask done tenant=${tenantId} duration_ms=${Date.now() - startTime} tables=${tables.length}`);
      return {
        answer,
        tables,
        download_available: tables.length > 0,
        download_query_id: queryId,
        applied_filters: appliedFilters,
        warnings,
      };
    } catch (err) {
      this.logger.warn(`Copilot ask error tenant=${tenantId} duration_ms=${Date.now() - startTime} err=${err instanceof Error ? err.message : err}`);
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('Rango inválido') || msg.includes('from') && msg.includes('to')) {
        throw new BadRequestException(msg || 'Rango de fechas inválido. Use start <= end en formato YYYY-MM-DD.');
      }
      return {
        answer: 'No pude completar la consulta. Revisa el rango de fechas y la conexión.',
        tables: [],
        download_available: false,
        download_query_id: null,
        applied_filters: appliedFilters,
        warnings: [msg],
      };
    }
  }

  private storeAndGetId(tables: CopilotTable[]): string {
    const id = randomUUID();
    this.exportStore.set(id, tables);
    return id;
  }

  private async executeTool(
    tenantId: string,
    name: string,
    args: Record<string, unknown>,
    defaultStart: string,
    defaultEnd: string,
    filters?: { city?: string; vendor?: string; brand?: string; class?: string },
  ): Promise<{ columns: string[]; rows: (string | number)[][] }> {
    const start = (args.start as string) || defaultStart;
    const end = (args.end as string) || defaultEnd;
    const limit = typeof args.limit === 'number' ? Math.min(args.limit, 100) : 10;

    switch (name) {
      case 'resolve_period':
        const period = this.tools.resolve_period({ text: (args.text as string) || 'últimos 30 días' });
        return {
          columns: ['start', 'end', 'compare_start', 'compare_end'],
          rows: period ? [[period.start, period.end, period.compare_start ?? '', period.compare_end ?? '']] : [['No reconocido', '', '', '']],
        };
      case 'sales_top':
        return this.tools.sales_top(tenantId, {
          start,
          end,
          group_by: (args.group_by as any) || 'customer',
          order: (args.order as 'asc' | 'desc') || 'desc',
          city: (args.city as string) || filters?.city,
          vendor: (args.vendor as string) || filters?.vendor,
          brand: (args.brand as string) || filters?.brand,
          class: (args.class as string) || filters?.class,
          limit,
        });
      case 'sales_change':
        return this.tools.sales_change(tenantId, {
          start,
          end,
          compare_start: (args.compare_start as string) || start,
          compare_end: (args.compare_end as string) || end,
          group_by: (args.group_by as any) || 'customer',
          metric: (args.metric as any) || 'sales',
          direction: (args.direction as any) || 'drop',
          city: (args.city as string) || filters?.city,
          vendor: (args.vendor as string) || filters?.vendor,
          limit,
        });
      case 'ar_summary':
        return this.tools.ar_summary(tenantId, {
          start,
          end,
          group_by: (args.group_by as any),
          limit,
          only_overdue: args.only_overdue === true,
          order_by: args.order_by === 'overdue' ? 'overdue' : 'balance',
        });
      case 'customer_lookup':
        return this.tools.customer_lookup(tenantId, { query: (args.query as string) || '' });
      case 'sync_status':
        const status = await this.tools.sync_status(tenantId);
        return {
          columns: ['Última sync', 'Duración (ms)', 'Error'],
          rows: [[status.lastSyncAt ?? '-', status.lastSyncDurationMs ?? '-', status.lastSyncError ?? '-']],
        };
      default:
        return { columns: [], rows: [] };
    }
  }

  private async runFallbackWithoutOpenAI(
    tenantId: string,
    question: string,
    start: string,
    end: string,
    filters?: { city?: string; vendor?: string; brand?: string; class?: string },
  ): Promise<{ answer: string; tables: CopilotTable[]; warnings: string[] }> {
    const warnings = ['OPENAI_API_KEY no configurado; usando lógica interna.'];
    const q = question.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
    const masVencido = /vencid|más?\s*vencid|mayor\s*vencid|overdue/i.test(question);
    let result: { columns: string[]; rows: (string | number)[][] };
    if (q.includes('cartera') || q.includes('ar ') || q.includes('cuentas por cobrar')) {
      result = await this.tools.ar_summary(tenantId, {
        start,
        end,
        limit: 10,
        only_overdue: masVencido,
        order_by: masVencido ? 'overdue' : 'balance',
      });
    } else if (q.includes('sync') || q.includes('sincroniz')) {
      const status = await this.tools.sync_status(tenantId);
      result = { columns: ['Última sync', 'Duración (ms)', 'Error'], rows: [[status.lastSyncAt ?? '-', status.lastSyncDurationMs ?? '-', status.lastSyncError ?? '-']] };
    } else if (q.includes('cliente') && (q.includes('buscar') || q.includes('nit') || q.includes('nombre'))) {
      const match = question.match(/(?:buscar|nit|nombre)\s+(.+)/i);
      result = await this.tools.customer_lookup(tenantId, { query: match?.[1]?.trim() ?? '' });
    } else {
      const groupBy = q.includes('por mes') || q.includes('ventas por mes') || q.includes('mensual') || (q.includes('mes') && !q.includes('meses')) ? 'month' : q.includes('marca') ? 'brand' : q.includes('clase') ? 'class' : q.includes('vendedor') ? 'seller' : q.includes('producto') || q.includes('referencia') ? 'product' : 'customer';
      const orderAsc = /menos\s*ventas|menor\s*venta|referencias\s*con\s*menos/i.test(question);
      const limitMatch = question.match(/\b(\d{1,3})\s*(referencias?|productos?|clientes?)?/i);
      const limit = limitMatch ? Math.min(parseInt(limitMatch[1], 10) || 10, 100) : 10;
      result = await this.tools.sales_top(tenantId, { start, end, group_by: groupBy as any, order: orderAsc ? 'asc' : 'desc', limit, ...filters });
    }
    const tables: CopilotTable[] = [{ title: 'Resultado', columns: result.columns, rows: result.rows }];
    const answer = result.rows.length > 0
      ? `Se encontraron ${result.rows.length} filas. Revisa la tabla.`
      : 'No hay datos para el periodo o filtros. Amplía el rango de fechas o relaja filtros.';
    return { answer, tables, warnings };
  }

  getExport(queryId: string): CopilotTable[] | null {
    return this.exportStore.get(queryId);
  }
}
