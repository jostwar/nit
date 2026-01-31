import { Module } from '@nestjs/common';
import { SyncService } from './sync.service';
import { HttpSourceApiClient } from './http-source-api.client';
import { MockSourceApiClient } from './mock-source-api.client';
import { SourceApiClient } from './source-api.client';
import { FomplusSourceApiClient } from './fomplus-source-api.client';
import { SOURCE_API_CLIENT } from './source.constants';
import { SourceController } from './source.controller';

@Module({
  controllers: [SourceController],
  providers: [
    SyncService,
    {
      provide: SOURCE_API_CLIENT,
      useFactory: (): SourceApiClient => {
        if (process.env.SOURCE_API_PROVIDER === 'fomplus') {
          return new FomplusSourceApiClient();
        }
        if (process.env.SOURCE_API_URL) {
          return new HttpSourceApiClient();
        }
        return new MockSourceApiClient();
      },
    },
  ],
  exports: [SyncService, SOURCE_API_CLIENT],
})
export class SourceModule {}
