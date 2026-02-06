import { AlertsService } from './alerts.service';
import { AlertRuleType } from '@prisma/client';

describe('AlertsService', () => {
  it('creates events for drop percent', async () => {
    const prisma = {
      invoice: {
        groupBy: jest.fn()
          .mockResolvedValueOnce([
            { customerId: 'c1', _sum: { signedTotal: 50 } },
          ])
          .mockResolvedValueOnce([
            { customerId: 'c1', _sum: { signedTotal: 100 } },
          ]),
      },
      alertEvent: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
    } as any;

    const service = new AlertsService(prisma);
    await (service as any).evaluateDropPercent(
      't1',
      'rule1',
      new Date('2024-02-01'),
      new Date('2024-02-28'),
      new Date('2024-01-01'),
      new Date('2024-01-31'),
      20,
    );

    expect(prisma.alertEvent.create).toHaveBeenCalled();
  });
});
