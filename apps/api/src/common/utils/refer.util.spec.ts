import { normalizeRefer, UNMAPPED_BRAND, UNMAPPED_CLASS } from './refer.util';

describe('normalizeRefer', () => {
  it('returns empty for null/undefined/empty', () => {
    expect(normalizeRefer('')).toBe('');
    expect(normalizeRefer(null)).toBe('');
    expect(normalizeRefer(undefined)).toBe('');
  });

  it('trims and uppercases', () => {
    expect(normalizeRefer('  ref001  ')).toBe('REF001');
    expect(normalizeRefer('Ref001')).toBe('REF001');
  });

  it('collapses multiple spaces to one', () => {
    expect(normalizeRefer('ref  001')).toBe('REF 001');
  });
});

describe('constants', () => {
  it('defines unmapped placeholders', () => {
    expect(UNMAPPED_BRAND).toBe('(SIN MAPEO)');
    expect(UNMAPPED_CLASS).toBe('(SIN MAPEO)');
  });
});
