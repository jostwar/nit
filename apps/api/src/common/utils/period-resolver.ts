/**
 * Resuelve expresiones de periodo en texto a fechas ISO (YYYY-MM-DD).
 * Zona: America/Bogota. Solo BD local (no ERP).
 */

const BOGOTA_TZ = 'America/Bogota';

function todayBogota(): Date {
  const str = new Date().toLocaleDateString('en-CA', { timeZone: BOGOTA_TZ });
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export interface ResolvedPeriod {
  start: string;
  end: string;
  compare_start: string | null;
  compare_end: string | null;
}

const PATTERNS: Array<{
  test: (t: string) => boolean;
  resolve: (today: Date) => ResolvedPeriod;
}> = [
  {
    test: (t) => /ultimo\s*trimestre|ultimos\s*90\s*dias|último\s*trimestre|últimos\s*90\s*días/i.test(t),
    resolve: (today) => {
      const end = new Date(today);
      end.setHours(23, 59, 59, 999);
      const start = new Date(today);
      start.setDate(start.getDate() - 90);
      start.setHours(0, 0, 0, 0);
      const compareEnd = new Date(start);
        compareEnd.setDate(compareEnd.getDate() - 1);
      const compareStart = new Date(compareEnd);
        compareStart.setDate(compareStart.getDate() - 90);
      return {
        start: toISODate(start),
        end: toISODate(end),
        compare_start: toISODate(compareStart),
        compare_end: toISODate(compareEnd),
      };
    },
  },
  {
    test: (t) => /ultimos\s*30\s*dias|últimos\s*30\s*días|ultimo\s*mes|último\s*mes/i.test(t),
    resolve: (today) => {
      const end = new Date(today);
      end.setHours(23, 59, 59, 999);
      const start = new Date(today);
      start.setDate(start.getDate() - 30);
      start.setHours(0, 0, 0, 0);
      const compareEnd = new Date(start);
        compareEnd.setDate(compareEnd.getDate() - 1);
      const compareStart = new Date(compareEnd);
        compareStart.setDate(compareStart.getDate() - 30);
      return {
        start: toISODate(start),
        end: toISODate(end),
        compare_start: toISODate(compareStart),
        compare_end: toISODate(compareEnd),
      };
    },
  },
  {
    test: (t) => /mes\s*actual|mes\s*corriente/i.test(t),
    resolve: (today) => {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      const end = new Date(today);
      end.setHours(23, 59, 59, 999);
      const compareStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const compareEnd = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59, 999);
      return {
        start: toISODate(start),
        end: toISODate(end),
        compare_start: toISODate(compareStart),
        compare_end: toISODate(compareEnd),
      };
    },
  },
  {
    test: (t) => /ultima\s*semana|última\s*semana|ultimos\s*7\s*dias/i.test(t),
    resolve: (today) => {
      const end = new Date(today);
      end.setHours(23, 59, 59, 999);
      const start = new Date(today);
      start.setDate(start.getDate() - 7);
      start.setHours(0, 0, 0, 0);
      const compareEnd = new Date(start);
        compareEnd.setDate(compareEnd.getDate() - 1);
      const compareStart = new Date(compareEnd);
        compareStart.setDate(compareStart.getDate() - 7);
      return {
        start: toISODate(start),
        end: toISODate(end),
        compare_start: toISODate(compareStart),
        compare_end: toISODate(compareEnd),
      };
    },
  },
];

/**
 * Resuelve texto a periodo. Si no coincide con ningún patrón, devuelve null.
 */
export function resolvePeriodText(text: string): ResolvedPeriod | null {
  const normalized = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
  const today = todayBogota();
  for (const { test, resolve } of PATTERNS) {
    if (test(normalized) || test(text)) {
      return resolve(today);
    }
  }
  return null;
}
