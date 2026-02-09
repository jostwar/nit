import { normalizeCustomerId } from './customer-id.util';

describe('normalizeCustomerId', () => {
  it('returns empty for null/undefined/empty', () => {
    expect(normalizeCustomerId('')).toBe('');
    expect(normalizeCustomerId(null)).toBe('');
    expect(normalizeCustomerId(undefined)).toBe('');
  });

  it('strips spaces and keeps digits only by default', () => {
    expect(normalizeCustomerId('  123456  ')).toBe('123456');
    expect(normalizeCustomerId('123 456')).toBe('123456');
  });

  it('removes dots and dashes', () => {
    expect(normalizeCustomerId('123.456-789')).toBe('123456789');
    expect(normalizeCustomerId('900.123.456-7')).toBe('9001234567');
  });

  it('preserves trailing K (NIT colombiano)', () => {
    expect(normalizeCustomerId('123456K')).toBe('123456K');
    expect(normalizeCustomerId('123456k')).toBe('123456K');
    expect(normalizeCustomerId('900.123.456-k')).toBe('900123456K');
  });

  it('keeps only digits when no K', () => {
    expect(normalizeCustomerId('ABC123XYZ')).toBe('123');
    expect(normalizeCustomerId('123456')).toBe('123456');
  });
});
