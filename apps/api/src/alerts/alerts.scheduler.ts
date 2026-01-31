import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { AlertsService } from './alerts.service';

@Injectable()
export class AlertsScheduler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly alertsService: AlertsService,
  ) {}

  @Cron('0 * * * *')
  async runHourly() {
    const tenants = await this.prisma.tenant.findMany({ select: { id: true } });
    for (const tenant of tenants) {
      await this.alertsService.evaluateRules(tenant.id);
    }
  }
}
