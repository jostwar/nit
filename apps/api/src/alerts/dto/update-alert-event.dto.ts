import { AlertStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateAlertEventDto {
  @IsEnum(AlertStatus)
  status: AlertStatus;
}
