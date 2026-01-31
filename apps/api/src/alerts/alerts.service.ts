import { Injectable } from '@nestjs/common';
import { AlertRuleType, AlertStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAlertRuleDto } from './dto/create-alert-rule.dto';
import { UpdateAlertRuleDto } from './dto/update-alert-rule.dto';

@Injectable()
export class AlertsService {
  constructor(private readonly prisma: PrismaService) {}

  listRules(tenantId: string) {
    return this.prisma.alertRule.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  createRule(tenantId: string, dto: CreateAlertRuleDto) {
    return this.prisma.alertRule.create({
      data: {
        tenantId,
        name: dto.name,
        type: dto.type,
        params: dto.params as Prisma.InputJsonValue,
        isActive: dto.isActive,
      },
    });
  }

  updateRule(tenantId: string, ruleId: string, dto: UpdateAlertRuleDto) {
    const data: Prisma.AlertRuleUpdateManyMutationInput = {
      ...(dto.name ? { name: dto.name } : {}),
      ...(dto.type ? { type: dto.type } : {}),
      ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      ...(dto.params !== undefined ? { params: dto.params as Prisma.InputJsonValue } : {}),
    };
    return this.prisma.alertRule.updateMany({
      where: { id: ruleId, tenantId },
      data,
    });
  }

  deleteRule(tenantId: string, ruleId: string) {
    return this.prisma.alertRule.deleteMany({
      where: { id: ruleId, tenantId },
    });
  }

  listEvents(tenantId: string, status?: AlertStatus) {
    return this.prisma.alertEvent.findMany({
      where: { tenantId, status: status ?? undefined },
      orderBy: { createdAt: 'desc' },
      include: { customer: true, rule: true },
    });
  }

  async evaluateRules(tenantId: string) {
    const rules = await this.prisma.alertRule.findMany({
      where: { tenantId, isActive: true },
    });
    const now = new Date();
    const rangeEnd = now;
    const rangeStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const compareStart = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    const compareEnd = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    for (const rule of rules) {
      const params = rule.params as Record<string, unknown>;
      if (rule.type === AlertRuleType.NO_PURCHASE_DAYS) {
        const days = Number(params?.days ?? 30);
        await this.evaluateNoPurchase(tenantId, rule.id, days);
      }
      if (rule.type === AlertRuleType.DROP_PERCENT) {
        const threshold = Number(params?.percent ?? 20);
        await this.evaluateDropPercent(tenantId, rule.id, rangeStart, rangeEnd, compareStart, compareEnd, threshold);
      }
      if (rule.type === AlertRuleType.BRAND_LOST) {
        const brand = String(params?.brand ?? '');
        if (brand) {
          await this.evaluateBrandLost(tenantId, rule.id, brand, rangeStart, rangeEnd, compareStart, compareEnd);
        }
      }
      if (rule.type === AlertRuleType.DSO_HIGH) {
        const threshold = Number(params?.days ?? 60);
        await this.evaluateDsoHigh(tenantId, rule.id, threshold);
      }
    }
  }

  private async evaluateNoPurchase(tenantId: string, ruleId: string, days: number) {
    const lastPurchases = await this.prisma.invoice.groupBy({
      by: ['customerId'],
      where: { tenantId },
      _max: { issuedAt: true },
    });
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    for (const row of lastPurchases) {
      if (!row._max.issuedAt || row._max.issuedAt > cutoff) {
        continue;
      }
      await this.createEventIfMissing(
        tenantId,
        row.customerId,
        ruleId,
        `Cliente sin compra en los últimos ${days} días`,
      );
    }
  }

  private async evaluateDropPercent(
    tenantId: string,
    ruleId: string,
    from: Date,
    to: Date,
    compareFrom: Date,
    compareTo: Date,
    threshold: number,
  ) {
    const current = await this.prisma.invoice.groupBy({
      by: ['customerId'],
      where: { tenantId, issuedAt: { gte: from, lte: to } },
      _sum: { total: true },
    });
    const compare = await this.prisma.invoice.groupBy({
      by: ['customerId'],
      where: { tenantId, issuedAt: { gte: compareFrom, lte: compareTo } },
      _sum: { total: true },
    });
    const compareMap = new Map(
      compare.map((row) => [row.customerId, Number(row._sum.total ?? 0)]),
    );
    for (const row of current) {
      const currentTotal = Number(row._sum.total ?? 0);
      const compareTotal = compareMap.get(row.customerId) ?? 0;
      if (compareTotal <= 0) {
        continue;
      }
      const drop = ((compareTotal - currentTotal) / compareTotal) * 100;
      if (drop >= threshold) {
        await this.createEventIfMissing(
          tenantId,
          row.customerId,
          ruleId,
          `Caída de ${drop.toFixed(1)}% vs periodo anterior`,
        );
      }
    }
  }

  private async evaluateBrandLost(
    tenantId: string,
    ruleId: string,
    brand: string,
    from: Date,
    to: Date,
    compareFrom: Date,
    compareTo: Date,
  ) {
    const current = await this.prisma.invoiceItem.findMany({
      where: {
        tenantId,
        brand,
        invoice: { issuedAt: { gte: from, lte: to } },
      },
      select: { invoice: { select: { customerId: true } } },
      distinct: ['invoiceId'],
    });
    const compare = await this.prisma.invoiceItem.findMany({
      where: {
        tenantId,
        brand,
        invoice: { issuedAt: { gte: compareFrom, lte: compareTo } },
      },
      select: { invoice: { select: { customerId: true } } },
      distinct: ['invoiceId'],
    });
    const currentCustomers = new Set(current.map((row) => row.invoice.customerId));
    const compareCustomers = new Set(compare.map((row) => row.invoice.customerId));
    for (const customerId of compareCustomers) {
      if (!currentCustomers.has(customerId)) {
        await this.createEventIfMissing(
          tenantId,
          customerId,
          ruleId,
          `Cliente dejó de comprar la marca ${brand}`,
        );
      }
    }
  }

  private async evaluateDsoHigh(tenantId: string, ruleId: string, threshold: number) {
    const credits = await this.prisma.credit.findMany({
      where: { tenantId, dsoDays: { gt: threshold } },
    });
    for (const credit of credits) {
      await this.createEventIfMissing(
        tenantId,
        credit.customerId,
        ruleId,
        `DSO estimado alto: ${credit.dsoDays} días`,
      );
    }
  }

  private async createEventIfMissing(
    tenantId: string,
    customerId: string,
    ruleId: string,
    message: string,
  ) {
    const existing = await this.prisma.alertEvent.findFirst({
      where: { tenantId, customerId, ruleId, status: AlertStatus.OPEN },
    });
    if (existing) {
      return;
    }
    await this.prisma.alertEvent.create({
      data: { tenantId, customerId, ruleId, message },
    });
  }
}
