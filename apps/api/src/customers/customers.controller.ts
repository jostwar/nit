import { Controller, Get, Param, Query } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { TenantId } from '../common/decorators/tenant-id.decorator';
import { parseDate, parseRange } from '../common/utils/date-range';

@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  getCustomers(
    @TenantId() tenantId: string,
    @Query('search') search?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('limit') limit?: string,
    @Query('city') city?: string,
    @Query('vendor') vendor?: string,
    @Query('brand') brand?: string,
  ) {
    const range = parseRange(from, to);
    const parsedPage = page ? parseInt(page, 10) : NaN;
    const parsedPageSize = pageSize ? parseInt(pageSize, 10) : NaN;
    const parsedLimit = limit ? parseInt(limit, 10) : NaN;
    const safePage = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
    const safePageSize = Number.isFinite(parsedPageSize)
      ? parsedPageSize
      : Number.isFinite(parsedLimit)
        ? parsedLimit
        : 1000;
    const clampedPageSize = Math.max(1, Math.min(1000, safePageSize));
    return this.customersService.searchCustomers(
      tenantId,
      search,
      range.from,
      range.to,
      safePage,
      clampedPageSize,
      city,
      vendor,
      brand,
    );
  }

  @Get(':id/overview')
  getOverview(
    @TenantId() tenantId: string,
    @Param('id') customerId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('compareFrom') compareFrom?: string,
    @Query('compareTo') compareTo?: string,
  ) {
    const current = parseRange(from, to);
    const compare = parseRange(compareFrom, compareTo);
    return this.customersService.getOverview(
      tenantId,
      customerId,
      current.from,
      current.to,
      compare.from,
      compare.to,
    );
  }

  @Get(':id/brands')
  getBrands(
    @TenantId() tenantId: string,
    @Param('id') customerId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('compareFrom') compareFrom?: string,
    @Query('compareTo') compareTo?: string,
  ) {
    const current = parseRange(from, to);
    const compare = parseRange(compareFrom, compareTo);
    return this.customersService.getBrands(
      tenantId,
      customerId,
      current.from,
      current.to,
      compare.from,
      compare.to,
    );
  }

  @Get(':id/products')
  getProducts(
    @TenantId() tenantId: string,
    @Param('id') customerId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('compareFrom') compareFrom?: string,
    @Query('compareTo') compareTo?: string,
    @Query('limit') limit?: string,
  ) {
    const current = parseRange(from, to);
    const compare = parseRange(compareFrom, compareTo);
    const parsedLimit = limit ? parseInt(limit, 10) : NaN;
    const safeLimit = Number.isFinite(parsedLimit) ? Math.min(parsedLimit, 200) : 50;
    return this.customersService.getProducts(
      tenantId,
      customerId,
      current.from,
      current.to,
      compare.from,
      compare.to,
      safeLimit,
    );
  }

  @Get(':id/collections')
  getCollections(@TenantId() tenantId: string, @Param('id') customerId: string) {
    return this.customersService.getCollections(tenantId, customerId);
  }
}
