import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AllExceptionsFilter } from './common/filters';
import { JwtAuthGuard, PermissionsGuard } from './common/guards';
import { PrismaModule } from './prisma/prisma.service';
import { AuditModule } from './audit/audit.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { LookupsModule } from './lookups/lookups.module';
import { AssetsModule } from './assets/assets.module';
import { MaintenanceModule } from './maintenance/maintenance.module';
import { LoansModule } from './loans/loans.module';
import { BookingsModule } from './bookings/bookings.module';
import { StocktakesModule } from './stocktakes/stocktakes.module';
import { ReportsModule } from './reports/reports.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: parseInt(process.env.RATE_LIMIT_PER_MINUTE ?? '300', 10) }]),
    PrismaModule, AuditModule, NotificationsModule, AuthModule, UsersModule, LookupsModule, AssetsModule,
    MaintenanceModule, LoansModule, BookingsModule, StocktakesModule, ReportsModule, DashboardModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
