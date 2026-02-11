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
    @Query('class') classFilter?: string,
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
      { city, vendor, brand, class: classFilter },
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
    @Query('class') classFilter?: string,
  ) {
    const current = parseRange(from, to);
    return this.metricsService.getSalesTotal(tenantId, current.from, current.to, {
      city,
      vendor,
      brand,
      class: classFilter,
    });
  }

  @Get('tipomov')
  getTipomov(
    @TenantId() tenantId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const current = parseRange(from, to);
    return this.metricsService.getTipomovSummary(tenantId, current.from, current.to);
  }

  /** Detalle factura a factura de una fila TIPOMOV (documentType=N/A para "Sin tipo"). */
  @Get('tipomov-detail')
  getTipomovDetail(
    @TenantId() tenantId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('documentType') documentType?: string,
  ) {
    const current = parseRange(from, to);
    return this.metricsService.getTipomovDetail(
      tenantId,
      current.from,
      current.to,
      documentType ?? 'N/A',
    );
  }

  @Get('sales-by-class')
  getSalesByClass(
    @TenantId() tenantId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('city') city?: string,
    @Query('vendor') vendor?: string,
    @Query('brand') brand?: string,
    @Query('class') classFilter?: string,
  ) {
    const current = parseRange(from, to);
    return this.metricsService.getSalesByClass(tenantId, current.from, current.to, {
      city,
      vendor,
      brand,
      class: classFilter,
    });
  }

  @Get('sales-by-vendor')
  getSalesByVendor(
    @TenantId() tenantId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('city') city?: string,
    @Query('vendor') vendor?: string,
    @Query('brand') brand?: string,
    @Query('class') classFilter?: string,
  ) {
    const current = parseRange(from, to);
    return this.metricsService.getSalesByVendor(tenantId, current.from, current.to, {
      city,
      vendor,
      brand,
      class: classFilter,
    });
  }

  @Get('sales-by-brand')
  getSalesByBrand(
    @TenantId() tenantId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('city') city?: string,
    @Query('vendor') vendor?: string,
    @Query('brand') brand?: string,
    @Query('class') classFilter?: string,
  ) {
    const current = parseRange(from, to);
    return this.metricsService.getSalesByBrand(tenantId, current.from, current.to, {
      city,
      vendor,
      brand,
      class: classFilter,
    });
  }
}
