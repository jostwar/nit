import { Controller, Get, Param, Post, Body, Res, HttpStatus, HttpException } from '@nestjs/common';
import * as express from 'express';
import { CopilotService } from './copilot.service';
import { CopilotAskDto } from './dto/copilot-ask.dto';
import { TenantId } from '../common/decorators/tenant-id.decorator';

function escapeCsv(value: string | number): string {
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;
const recentByTenant = new Map<string, number[]>();

function checkRateLimit(tenantId: string): void {
  const now = Date.now();
  const list = recentByTenant.get(tenantId) ?? [];
  const valid = list.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (valid.length >= RATE_LIMIT_MAX) {
    throw new HttpException('Demasiadas consultas. Espera un minuto.', HttpStatus.TOO_MANY_REQUESTS);
  }
  valid.push(now);
  recentByTenant.set(tenantId, valid);
}

@Controller('copilot')
export class CopilotController {
  constructor(private readonly copilot: CopilotService) {}

  @Post('ask')
  async ask(@TenantId() tenantId: string, @Body() dto: CopilotAskDto) {
    checkRateLimit(tenantId);
    return this.copilot.ask(tenantId, dto.question, dto.start, dto.end, {
      city: dto.city,
      vendor: dto.vendor,
      brand: dto.brand,
      class: dto.class,
    });
  }

  @Get('export/:queryId')
  async export(
    @TenantId() _tenantId: string,
    @Param('queryId') queryId: string,
    @Res() res: express.Response,
  ): Promise<void> {
    const tables = this.copilot.getExport(queryId);
    if (!tables || tables.length === 0) {
      return res.status(HttpStatus.NOT_FOUND).json({ message: 'Exportación no encontrada o expirada.' });
    }
    const lines: string[] = [];
    tables.forEach((t) => {
      lines.push(t.columns.map(escapeCsv).join(','));
      t.rows.forEach((row) => lines.push(row.map(escapeCsv).join(',')));
      lines.push('');
    });
    const buf = Buffer.from(lines.join('\n'), 'utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=copilot-export-${queryId.slice(0, 8)}.csv`);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.send(buf);
  }
}
