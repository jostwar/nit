const BOM = '\uFEFF';
const DELIMITER = ';';

/**
 * Parsea CSV con delimiter ;, BOM, header, trim, campos entre comillas con saltos de línea.
 * Retorna { headers: string[], rows: string[][] }.
 */
export function parseCsvSemicolon(content: string): { headers: string[]; rows: string[][] } {
  let text = content.trimStart();
  if (text.startsWith(BOM)) text = text.slice(BOM.length);
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === DELIMITER) {
      currentRow.push(current.trim());
      current = '';
      continue;
    }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      currentRow.push(current.trim());
      current = '';
      if (currentRow.some((c) => c !== '')) rows.push(currentRow);
      currentRow = [];
      continue;
    }
    current += ch;
  }
  currentRow.push(current.trim());
  if (currentRow.some((c) => c !== '')) rows.push(currentRow);
  if (rows.length === 0) return { headers: [], rows: [] };
  const headers = rows[0].map((h) => h.trim());
  return { headers, rows: rows.slice(1) };
}

/**
 * Encuentra índice de columna por nombre (case-insensitive, sin espacios extra).
 */
export function findColumnIndex(headers: string[], names: string[]): number {
  const normalized = headers.map((h) => h.trim().toLowerCase().replace(/\s+/g, ' '));
  for (const name of names) {
    const n = name.toLowerCase().trim().replace(/\s+/g, ' ');
    const i = normalized.findIndex((h) => h === n || h.replace(/\s/g, '') === n.replace(/\s/g, ''));
    if (i >= 0) return i;
  }
  return -1;
}
