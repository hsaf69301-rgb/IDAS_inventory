import { Module } from '@nestjs/common';
import { LoansModule } from '../loans/loans.module';
import { BookingsModule } from '../bookings/bookings.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { JobsService } from './jobs.service';

@Module({ imports: [LoansModule, BookingsModule], controllers: [DashboardController], providers: [DashboardService, JobsService] })
export class DashboardModule {}
