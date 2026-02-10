import { resolvePeriodText } from './period-resolver';

describe('period-resolver', () => {
  it('resolves "ultimos 30 dias"', () => {
    const r = resolvePeriodText('ultimos 30 dias');
    expect(r).not.toBeNull();
    expect(r!.start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r!.end).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(new Date(r!.start).getTime()).toBeLessThanOrEqual(new Date(r!.end).getTime());
  });

  it('resolves "último trimestre"', () => {
    const r = resolvePeriodText('último trimestre');
    expect(r).not.toBeNull();
    expect(r!.start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r!.end).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns null for unknown text', () => {
    expect(resolvePeriodText('cualquier cosa')).toBeNull();
  });
});
