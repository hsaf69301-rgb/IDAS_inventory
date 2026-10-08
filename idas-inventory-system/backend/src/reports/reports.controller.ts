import { BadRequestException, Controller, Get, Param, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { AuthUser, CurrentUser, Meta, ReqMeta, RequirePermissions } from '../common/decorators';
import { PERMISSIONS } from '../common/permissions';
import { AuditService } from '../audit/audit.service';
import { toCsv, toPdf, toXlsx } from './export';
import { ReportsService } from './reports.service';

@ApiTags('Reports') @ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private svc: ReportsService, private audit: AuditService) {}

  @Get() @RequirePermissions(PERMISSIONS.REPORT_VIEW) types() { return this.svc.types; }

  @Get(':type') @RequirePermissions(PERMISSIONS.REPORT_VIEW)
  async get(@Param('type') type: string, @Query() q: any, @CurrentUser() u: AuthUser, @Meta() m: ReqMeta, @Res() res: Response) {
    const report = await this.svc.build(type, q);
    const format = (q.format ?? 'json').toLowerCase();
    if (format !== 'json') await this.audit.log(null, { userId: u.id, action: `Report exported (${format})`, module: 'reports', recordId: type, meta: m });
    const file = `${type}-${new Date().toISOString().slice(0, 10)}`;
    if (format === 'json') return res.json(report);
    if (format === 'csv') return res.type('text/csv; charset=utf-8').attachment(`${file}.csv`).send(toCsv(report));
    if (format === 'xlsx') return res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').attachment(`${file}.xlsx`).send(await toXlsx(report));
    if (format === 'pdf') return res.type('application/pdf').attachment(`${file}.pdf`).send(await toPdf(report));
    throw new BadRequestException('format must be json, csv, xlsx or pdf');
  }
}
