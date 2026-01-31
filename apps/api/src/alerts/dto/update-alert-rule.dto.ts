import { AlertRuleType } from '@prisma/client';
import { IsBoolean, IsEnum, IsObject, IsOptional, IsString } from 'class-validator';

export class UpdateAlertRuleDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(AlertRuleType)
  type?: AlertRuleType;

  @IsOptional()
  @IsObject()
  params?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
