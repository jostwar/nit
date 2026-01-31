import { Module } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { DashboardController } from './dashboard.controller';
import { MetricsScheduler } from './metrics.scheduler';

@Module({
  providers: [MetricsService, MetricsScheduler],
  controllers: [DashboardController],
  exports: [MetricsService],
})
export class MetricsModule {}
