import { Controller, Get, Query } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { TenantId } from '../common/decorators/tenant-id.decorator';
import { parseRange } from '../common/utils/date-range';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get('filter-options')
  getFilterOptions(@TenantId() tenantId: string) {
    return this.metricsService.getFilterOptions(tenantId);
  }

  @Get('summary')
  getSummary(
    @TenantId() tenantId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('compareFrom') compareFrom?: string,
    @Query('compareTo') compareTo?: string,
    @Query('city') city?: string,
    @Query('vendor') vendor?: string,
    @Query('brand') brand?: string,
    @Query('class') class?: string,
  ) {
    const current = parseRange(from, to);
    const hasCompare = compareFrom != null && compareTo != null && compareFrom !== '' && compareTo !== '';
    const compare = hasCompare
      ? parseRange(compareFrom, compareTo)
      : { from: current.from, to: current.to };
    return this.metricsService.getDashboardSummary(
      tenantId,
      current.from,
      current.to,
      compare.from,
      compare.to,
      { city, vendor, brand, class: class as string },
    );
  }

  @Get('total')
  getTotal(
    @TenantId() tenantId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('city') city?: string,
    @Query('vendor') vendor?: string,
    @Query('brand') brand?: string,
    @Query('class') class?: string,
  ) {
    const current = parseRange(from, to);
    return this.metricsService.getSalesTotal(tenantId, current.from, current.to, {
      city,
      vendor,
      brand,
      class: class as string,
    });
  }

  @Get('sales-by-class')
  getSalesByClass(
    @TenantId() tenantId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('city') city?: string,
    @Query('vendor') vendor?: string,
    @Query('brand') brand?: string,
    @Query('class') class?: string,
  ) {
    const current = parseRange(from, to);
    return this.metricsService.getSalesByClass(tenantId, current.from, current.to, {
      city,
      vendor,
      brand,
      class: class as string,
    });
  }
}
