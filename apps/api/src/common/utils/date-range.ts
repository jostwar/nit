export function parseDate(value?: string, fallback?: Date): Date {
  if (!value) {
    return fallback ?? new Date();
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return fallback ?? new Date();
  }
  return parsed;
}

export function parseRange(from?: string, to?: string, days = 30) {
  const end = parseDate(to, new Date());
  const start = parseDate(from, new Date(end.getTime() - days * 24 * 60 * 60 * 1000));
  return { from: start, to: end };
}
