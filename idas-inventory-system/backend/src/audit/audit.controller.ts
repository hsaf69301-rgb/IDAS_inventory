import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../common/decorators';
import { PERMISSIONS } from '../common/permissions';
import { AuditService } from './audit.service';

@ApiTags('Audit') @ApiBearerAuth()
@Controller('audit')
export class AuditController {
  constructor(private audit: AuditService) {}

  @Get() @RequirePermissions(PERMISSIONS.AUDIT_READ)
  list(@Query() q: any) { return this.audit.list(q); }

  @Get('verify') @RequirePermissions(PERMISSIONS.AUDIT_READ)
  verify() { return this.audit.verifyChain(); }
}
