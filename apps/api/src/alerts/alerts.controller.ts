import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { AlertsService } from './alerts.service';
import { TenantId } from '../common/decorators/tenant-id.decorator';
import { CreateAlertRuleDto } from './dto/create-alert-rule.dto';
import { UpdateAlertRuleDto } from './dto/update-alert-rule.dto';
import { AlertRuleType, AlertStatus } from '@prisma/client';
import { UpdateAlertEventDto } from './dto/update-alert-event.dto';

@Controller('alerts')
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Post('run')
  runEvaluation(@TenantId() tenantId: string) {
    return this.alertsService.evaluateRules(tenantId).then(() => ({ ok: true }));
  }

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
  listEvents(
    @TenantId() tenantId: string,
    @Query('status') status?: string,
    @Query('ruleType') ruleType?: string,
  ) {
    const normalized = status?.toUpperCase();
    const statusFilter =
      normalized === 'OPEN' || normalized === 'CLOSED' ? (normalized as AlertStatus) : undefined;
    const validRuleTypes = ['NO_PURCHASE_DAYS', 'DROP_PERCENT', 'BRAND_LOST', 'DSO_HIGH'];
    const ruleTypeFilter =
      ruleType && validRuleTypes.includes(ruleType) ? (ruleType as AlertRuleType) : undefined;
    return this.alertsService.listEvents(tenantId, statusFilter, ruleTypeFilter);
  }

  @Patch('events/:id')
  updateEvent(
    @TenantId() tenantId: string,
    @Param('id') eventId: string,
    @Body() dto: UpdateAlertEventDto,
  ) {
    return this.alertsService.updateEventStatus(tenantId, eventId, dto.status);
  }
}
