import { MetricsService } from './metrics.service';

describe('MetricsService', () => {
  it('calculates dashboard summary totals', async () => {
    const prisma = {
      invoice: {
        aggregate: jest.fn()
          .mockResolvedValueOnce({
            _sum: { total: 1000, margin: 200, units: 50 },
            _count: { _all: 10 },
          })
          .mockResolvedValueOnce({
            _sum: { total: 800, margin: 150, units: 40 },
            _count: { _all: 8 },
          }),
        findMany: jest.fn().mockResolvedValue([{ customerId: 'c1' }, { customerId: 'c2' }]),
      },
      metricsDaily: {
        groupBy: jest.fn().mockResolvedValue([
          { date: new Date('2024-01-01'), _sum: { totalSales: 100, totalInvoices: 2, totalUnits: 10, totalMargin: 20 } },
        ]),
      },
    } as any;

    const service = new MetricsService(prisma);
    const result = await service.getDashboardSummary(
      't1',
      new Date('2024-01-01'),
      new Date('2024-01-31'),
      new Date('2023-12-01'),
      new Date('2023-12-31'),
    );

    expect(result.current.totalSales).toBe(1000);
    expect(result.current.uniqueCustomers).toBe(2);
    expect(result.series).toHaveLength(1);
  });
});
