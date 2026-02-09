import { Module } from '@nestjs/common';
import { SyncService } from './sync.service';
import { HttpSourceApiClient } from './http-source-api.client';
import { MockSourceApiClient } from './mock-source-api.client';
import { SourceApiClient } from './source-api.client';
import { FomplusSourceApiClient } from './fomplus-source-api.client';
import { InventoryDirectoryService } from './inventory-directory.service';
import { SOURCE_API_CLIENT } from './source.constants';
import { SourceController } from './source.controller';
import { SourceScheduler } from './source.scheduler';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SourceController],
  providers: [
    SyncService,
    SourceScheduler,
    InventoryDirectoryService,
    {
      provide: SOURCE_API_CLIENT,
      useFactory: (inventoryDirectory: InventoryDirectoryService): SourceApiClient => {
        if (process.env.SOURCE_API_PROVIDER === 'fomplus') {
          return new FomplusSourceApiClient(inventoryDirectory);
        }
        if (process.env.SOURCE_API_URL) {
          return new HttpSourceApiClient();
        }
        return new MockSourceApiClient();
      },
      inject: [InventoryDirectoryService],
    },
  ],
  exports: [SyncService, SOURCE_API_CLIENT],
})
export class SourceModule {}
