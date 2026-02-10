import { IsOptional, IsString, Matches } from 'class-validator';

export class AiChatDto {
  @IsString()
  question: string;

  /** Fecha inicio en ISO YYYY-MM-DD (campo FECHA de negocio, no createdAt). */
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'from debe ser ISO YYYY-MM-DD' })
  from: string;

  /** Fecha fin en ISO YYYY-MM-DD. */
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'to debe ser ISO YYYY-MM-DD' })
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
