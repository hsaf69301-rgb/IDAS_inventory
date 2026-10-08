import { Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, RequirePermissions } from '../common/decorators';
import { PERMISSIONS } from '../common/permissions';
import { DashboardService } from './dashboard.service';
import { JobsService } from './jobs.service';

@ApiTags('Dashboard') @ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private svc: DashboardService, private jobs: JobsService) {}
  @Get() @RequirePermissions(PERMISSIONS.DASHBOARD_VIEW) overview() { return this.svc.overview(); }
  @Get('me') mine(@CurrentUser() u: AuthUser) { return this.svc.mine(u.id); }
  @Post('jobs/warranty') @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE) warranty() { return this.jobs.warrantyAlerts(); }
}
