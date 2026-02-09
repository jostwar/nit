/**
 * Normalización de REFER (referencia de producto) para cruce con catálogo.
 * Misma regla en ventas, directorio e inventario.
 */
export function normalizeRefer(ref: string | undefined | null): string {
  if (ref == null || typeof ref !== 'string') return '';
  return ref.trim().replace(/\s+/g, ' ').toUpperCase();
}

export const UNMAPPED_BRAND = '(SIN MAPEO)';
export const UNMAPPED_CLASS = '(SIN MAPEO)';
