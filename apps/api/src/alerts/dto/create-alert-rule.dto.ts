import { AlertRuleType } from '@prisma/client';
import { IsBoolean, IsEnum, IsObject, IsString } from 'class-validator';

export class CreateAlertRuleDto {
  @IsString()
  name: string;

  @IsEnum(AlertRuleType)
  type: AlertRuleType;

  @IsObject()
  params: Record<string, unknown>;

  @IsBoolean()
  isActive: boolean;
}
