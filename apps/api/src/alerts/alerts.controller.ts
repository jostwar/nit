import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { AlertsService } from './alerts.service';
import { TenantId } from '../common/decorators/tenant-id.decorator';
import { CreateAlertRuleDto } from './dto/create-alert-rule.dto';
import { UpdateAlertRuleDto } from './dto/update-alert-rule.dto';
import { AlertStatus } from '@prisma/client';

@Controller('alerts')
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get('rules')
  listRules(@TenantId() tenantId: string) {
    return this.alertsService.listRules(tenantId);
  }

  @Post('rules')
  createRule(@TenantId() tenantId: string, @Body() dto: CreateAlertRuleDto) {
    return this.alertsService.createRule(tenantId, dto);
  }

  @Patch('rules/:id')
  updateRule(
    @TenantId() tenantId: string,
    @Param('id') ruleId: string,
    @Body() dto: UpdateAlertRuleDto,
  ) {
    return this.alertsService.updateRule(tenantId, ruleId, dto);
  }

  @Delete('rules/:id')
  deleteRule(@TenantId() tenantId: string, @Param('id') ruleId: string) {
    return this.alertsService.deleteRule(tenantId, ruleId);
  }

  @Get('events')
  listEvents(@TenantId() tenantId: string, @Query('status') status?: AlertStatus) {
    return this.alertsService.listEvents(tenantId, status);
  }
}
