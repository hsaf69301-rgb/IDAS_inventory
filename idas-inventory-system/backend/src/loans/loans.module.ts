import { Module } from '@nestjs/common';
import { MaintenanceModule } from '../maintenance/maintenance.module';
import { LoansController } from './loans.controller';
import { LoansService } from './loans.service';

@Module({ imports: [MaintenanceModule], controllers: [LoansController], providers: [LoansService], exports: [LoansService] })
export class LoansModule {}
