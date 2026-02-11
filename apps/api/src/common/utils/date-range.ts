import { BadRequestException } from '@nestjs/common';

/**
 * Parsea fecha desde query. Acepta:
 * - ISO YYYY-MM-DD (recomendado)
 * - DD/MM/YYYY (detectado si día > 12)
 * - Cualquier formato que Date() entienda (evitar MM/DD si no es ISO)
 */
export function parseDate(value?: string, fallback?: Date): Date {
  if (!value || typeof value !== 'string') {
    return fallback ?? new Date();
  }
  const trimmed = value.trim();
  if (!trimmed) return fallback ?? new Date();

  // ISO YYYY-MM-DD
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const y = parseInt(isoMatch[1], 10);
    const m = parseInt(isoMatch[2], 10) - 1;
    const d = parseInt(isoMatch[3], 10);
    const date = new Date(y, m, d);
    if (!Number.isNaN(date.getTime()) && date.getFullYear() === y && date.getMonth() === m && date.getDate() === d) {
      return date;
    }
  }

  // DD/MM/YYYY o MM/DD/YYYY: si primer número > 12 es día (DD/MM)
  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slashMatch) {
    const a = parseInt(slashMatch[1], 10);
    const b = parseInt(slashMatch[2], 10);
    const y = parseInt(slashMatch[3], 10);
    let month: number;
    let day: number;
    if (a > 12) {
      day = a;
      month = b - 1;
    } else if (b > 12) {
      month = a - 1;
      day = b;
    } else {
      // Ambos <= 12: asumir DD/MM (estándar colombiano)
      day = a;
      month = b - 1;
    }
    const date = new Date(y, month, day);
    if (!Number.isNaN(date.getTime())) return date;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return fallback ?? new Date();
  }
  return parsed;
}

/** Rango de fechas del calendario (desde 00:00:00 del "from" hasta 23:59:59 del "to"). Coincide con Fecha Documento (FECHA de GenerarInfoVentas). */
export function parseRange(from?: string, to?: string, days = 30) {
  const end = parseDate(to, new Date());
  const start = parseDate(from, new Date(end.getTime() - days * 24 * 60 * 60 * 1000));
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  if (start.getTime() > end.getTime()) {
    throw new BadRequestException('Rango inválido (end < start). Revise from y to.');
  }
  return { from: start, to: end };
}
