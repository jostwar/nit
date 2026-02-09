/**
 * Llave canónica para cruce entre APIs del ERP:
 * - ListadoClientes: CLI_CEDULA, CLI_NOMBRE
 * - GenerarInfoVentas: CEDULA, NOMCED
 * - EstadoDeCuentaCartera: CEDULA, NOMCED
 *
 * Normaliza NIT/Cédula para joins y upserts consistentes.
 */
export function normalizeCustomerId(value: string | undefined | null): string {
  if (value == null || typeof value !== 'string') return '';
  let s = value.trim().replace(/\s+/g, ' ');
  if (!s) return '';
  // Quitar puntos, guiones, espacios
  s = s.replace(/[\s.\-]/g, '');
  // Permitir solo dígitos y K/k al final (NIT colombiano)
  const match = s.toUpperCase().match(/^(\d+)(K?)$/i);
  if (match) return match[1] + (match[2] || '');
  // Fallback: solo dígitos + K final
  const digits = s.replace(/\D/g, '');
  const trailingK = /k$/i.test(s) ? 'K' : '';
  return digits + trailingK;
}
