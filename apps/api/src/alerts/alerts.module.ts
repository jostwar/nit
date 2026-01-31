import { Module } from '@nestjs/common';
import { AlertsService } from './alerts.service';
import { AlertsController } from './alerts.controller';
import { AlertsScheduler } from './alerts.scheduler';

@Module({
  controllers: [AlertsController],
  providers: [AlertsService, AlertsScheduler],
})
export class AlertsModule {}
