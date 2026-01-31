import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MeController } from './common/me.controller';
import { PrismaModule } from './prisma/prisma.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { TenantGuard } from './common/guards/tenant.guard';
import { AuthModule } from './auth/auth.module';
import { TenantsModule } from './tenants/tenants.module';
import { CustomersModule } from './customers/customers.module';
import { SalesModule } from './sales/sales.module';
import { CollectionsModule } from './collections/collections.module';
import { MetricsModule } from './metrics/metrics.module';
import { AlertsModule } from './alerts/alerts.module';
import { AiModule } from './ai/ai.module';
import { SourceModule } from './source/source.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({
      pinoHttp: {
        transport:
          process.env.NODE_ENV === 'production'
            ? undefined
            : { target: 'pino-pretty', options: { colorize: true } },
      },
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    TenantsModule,
    CustomersModule,
    SalesModule,
    CollectionsModule,
    MetricsModule,
    AlertsModule,
    AiModule,
    SourceModule,
  ],
  controllers: [AppController, MeController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: TenantGuard },
  ],
})
export class AppModule {}
