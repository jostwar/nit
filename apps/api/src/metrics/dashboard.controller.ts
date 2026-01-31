import { Controller, Get, Query } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { TenantId } from '../common/decorators/tenant-id.decorator';
import { parseRange } from '../common/utils/date-range';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get('summary')
  getSummary(
    @TenantId() tenantId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('compareFrom') compareFrom?: string,
    @Query('compareTo') compareTo?: string,
  ) {
    const current = parseRange(from, to);
    const compare = parseRange(compareFrom, compareTo);
    return this.metricsService.getDashboardSummary(
      tenantId,
      current.from,
      current.to,
      compare.from,
      compare.to,
    );
  }
}
