const NBSP = '\u00A0';

/**
 * Normalización de REFER (referencia de producto) para cruce con catálogo.
 * Trim, reemplazar NBSP, colapsar espacios, mayúsculas.
 */
export function normalizeRefer(ref: string | undefined | null): string {
  if (ref == null || typeof ref !== 'string') return '';
  return ref
    .trim()
    .replace(new RegExp(NBSP, 'g'), ' ')
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

export const UNMAPPED_BRAND = '(SIN MAPEO)';
export const UNMAPPED_CLASS = '(SIN MAPEO)';
