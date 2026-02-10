/**
 * Schema de respuesta estructurada del copilot BI.
 */
export interface CopilotTable {
  title: string;
  columns: string[];
  rows: (string | number)[][];
}

export interface CopilotAppliedFilters {
  start: string;
  end: string;
  seller: string | null;
  city: string | null;
  brand: string | null;
  class: string | null;
}

export interface CopilotResponse {
  answer: string;
  tables: CopilotTable[];
  download_available: boolean;
  download_query_id: string | null;
  applied_filters: CopilotAppliedFilters;
  warnings: string[];
}

export const COPILOT_RESPONSE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    answer: { type: 'string', description: 'Respuesta en texto natural' },
    tables: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          columns: { type: 'array', items: { type: 'string' } },
          rows: {
            type: 'array',
            items: {
              type: 'array',
              items: { type: ['string', 'number'] },
            },
          },
        },
        required: ['title', 'columns', 'rows'],
      },
    },
    download_available: { type: 'boolean' },
    download_query_id: { type: ['string', 'null'] },
    applied_filters: {
      type: 'object',
      properties: {
        start: { type: 'string' },
        end: { type: 'string' },
        seller: { type: ['string', 'null'] },
        city: { type: ['string', 'null'] },
        brand: { type: ['string', 'null'] },
        class: { type: ['string', 'null'] },
      },
      required: ['start', 'end', 'seller', 'city', 'brand', 'class'],
    },
    warnings: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: ['answer', 'tables', 'download_available', 'download_query_id', 'applied_filters', 'warnings'],
  additionalProperties: false,
} as const;
