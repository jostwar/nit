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
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  if (start.getTime() > end.getTime()) {
    const swappedStart = new Date(end);
    const swappedEnd = new Date(start);
    swappedStart.setHours(0, 0, 0, 0);
    swappedEnd.setHours(23, 59, 59, 999);
    return { from: swappedStart, to: swappedEnd };
  }
  return { from: start, to: end };
}
