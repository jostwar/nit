import { Body, Controller, Post } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiChatDto } from './dto/ai-chat.dto';
import { TenantId } from '../common/decorators/tenant-id.decorator';
import { parseDate } from '../common/utils/date-range';

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('chat')
  chat(@TenantId() tenantId: string, @Body() dto: AiChatDto) {
    const from = parseDate(dto.from);
    const to = parseDate(dto.to);
    return this.aiService.answer(tenantId, dto.question, from, to, dto.optionalCustomerId);
  }
}
