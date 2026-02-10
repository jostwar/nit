import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CopilotController } from './copilot.controller';
import { CopilotService } from './copilot.service';
import { CopilotToolsService } from './copilot-tools.service';
import { ExportStoreService } from './export-store.service';

@Module({
  imports: [PrismaModule],
  controllers: [CopilotController],
  providers: [CopilotService, CopilotToolsService, ExportStoreService],
  exports: [CopilotService],
})
export class CopilotModule {}
