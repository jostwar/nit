import { IsOptional, IsString, Matches, ValidateIf } from 'class-validator';

export class CopilotAskDto {
  @IsString()
  question: string;

  @ValidateIf((o) => o.start != null && o.start !== '')
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'start debe ser ISO YYYY-MM-DD' })
  start?: string;

  @ValidateIf((o) => o.end != null && o.end !== '')
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'end debe ser ISO YYYY-MM-DD' })
  end?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  vendor?: string;

  @IsOptional()
  @IsString()
  brand?: string;

  @IsOptional()
  @IsString()
  class?: string;
}
