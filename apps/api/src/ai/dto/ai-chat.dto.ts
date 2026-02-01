import { IsOptional, IsString } from 'class-validator';

export class AiChatDto {
  @IsString()
  question: string;

  @IsString()
  from: string;

  @IsString()
  to: string;

  @IsOptional()
  @IsString()
  optionalCustomerId?: string;

  @IsOptional()
  @IsString()
  optionalCity?: string;

  @IsOptional()
  @IsString()
  optionalVendor?: string;
}
