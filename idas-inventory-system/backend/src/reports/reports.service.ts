import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { toNum } from '../common/util';

export interface Report { title: string; columns: { key: string; label: string }[]; rows: Record<string, any>[]; summary?: string }
const d = (v?: Date | null) => (v ? v.toISOString().slice(0, 10) : '');
const dt = (v?: Date | null) => (v ? v.toISOString().slice(0, 16).replace('T', ' ') : '');
const col = (...pairs: [string, string][]) => pairs.map(([key, label]) => ({ key, label }));

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  readonly types = [
    'asset-register', 'assets-by-category', 'assets-by-location', 'assets-by-status', 'assets-by-condition', 'current-loans', 'overdue-loans',
    'borrowing-history', 'lab-bookings', 'lab-utilization', 'reservations', 'maintenance', 'repairs', 'repair-costs', 'damage', 'lost', 'stocktake', 'warranty-expiry',
  ];

  async build(type: string, q: { from?: string; to?: string; stocktakeId?: string; days?: string }): Promise<Report> {
    const from = q.from ? new Date(q.from) : undefined, to = q.to ? new Date(q.to) : undefined;
    const range = (f: string) => ({ [f]: { gte: from, lte: to } });
    switch (type) {
      case 'asset-register': {
        const a = await this.prisma.asset.findMany({ where: { isArchived: false }, include: { category: true, location: true, responsibleUser: true, acquisition: true }, orderBy: { assetTag: 'asc' } });
        return { title: 'Complete Asset Register', columns: col(['assetTag', 'Asset ID'], ['name', 'Name'], ['category', 'Category'], ['brand', 'Brand'], ['model', 'Model'], ['serial', 'Serial'], ['location', 'Location'], ['status', 'Status'], ['condition', 'Condition'], ['holder', 'Responsible'], ['acquired', 'Acquired'], ['value', 'Value (LKR)'], ['funding', 'Funding']),
          rows: a.map((x) => ({ assetTag: x.assetTag, name: x.name, category: x.category.name, brand: x.brand ?? '', model: x.model ?? '', serial: x.serialNumber ?? '', location: x.location?.name ?? '', status: x.status, condition: x.condition, holder: x.responsibleUser?.fullName ?? '', acquired: d(x.acquisition?.acquiredAt), value: toNum(x.acquisition?.value) ?? '', funding: x.acquisition?.fundingSource ?? '' })), summary: `${a.length} assets` };
      }
      case 'assets-by-category': {
        const c = await this.prisma.category.findMany({ include: { _count: { select: { assets: { where: { isArchived: false } } } } }, orderBy: { name: 'asc' } });
        return { title: 'Assets by Category', columns: col(['category', 'Category'], ['code', 'Code'], ['count', 'Assets']), rows: c.map((x) => ({ category: x.name, code: x.code, count: x._count.assets })) };
      }
      case 'assets-by-location': {
        const l = await this.prisma.location.findMany({ include: { parent: true, _count: { select: { assets: { where: { isArchived: false } } } } }, orderBy: { name: 'asc' } });
        return { title: 'Assets by Location', columns: col(['location', 'Location'], ['parent', 'Parent'], ['type', 'Type'], ['count', 'Assets']), rows: l.map((x) => ({ location: x.name, parent: x.parent?.name ?? '', type: x.type, count: x._count.assets })) };
      }
      case 'assets-by-status':
      case 'assets-by-condition': {
        const f = type === 'assets-by-status' ? 'status' : 'condition';
        const g = await this.prisma.asset.groupBy({ by: [f as 'status'], where: { isArchived: false }, _count: true });
        return { title: type === 'assets-by-status' ? 'Assets by Status' : 'Assets by Condition', columns: col(['key', f === 'status' ? 'Status' : 'Condition'], ['count', 'Assets']), rows: g.map((x: any) => ({ key: x[f], count: x._count })) };
      }
      case 'current-loans':
      case 'overdue-loans': {
        const l = await this.prisma.loanRequest.findMany({ where: { status: 'ISSUED', dueAt: type === 'overdue-loans' ? { lt: new Date() } : undefined }, include: { requester: true, items: { include: { asset: true } } }, orderBy: { dueAt: 'asc' } });
        return { title: type === 'current-loans' ? 'Current Loans' : 'Overdue Loans', columns: col(['ref', 'Ref'], ['borrower', 'Borrower'], ['items', 'Items'], ['issued', 'Issued'], ['due', 'Due']), rows: l.map((x) => ({ ref: x.refNo, borrower: x.requester.fullName, items: x.items.map((i) => i.asset.assetTag).join(', '), issued: dt(x.issuedAt), due: dt(x.dueAt) })) };
      }
      case 'borrowing-history': {
        const l = await this.prisma.loanRequest.findMany({ where: range('createdAt'), include: { requester: true, items: { include: { asset: true } } }, orderBy: { createdAt: 'desc' } });
        return { title: 'Borrowing History', columns: col(['ref', 'Ref'], ['borrower', 'Borrower'], ['items', 'Items'], ['status', 'Status'], ['issued', 'Issued'], ['returned', 'Returned']), rows: l.map((x) => ({ ref: x.refNo, borrower: x.requester.fullName, items: x.items.map((i) => i.asset.assetTag).join(', '), status: x.status, issued: dt(x.issuedAt), returned: dt(x.returnedAt) })) };
      }
      case 'lab-bookings': {
        const b = await this.prisma.labBooking.findMany({ where: range('startTime'), include: { lecturer: true }, orderBy: { startTime: 'desc' } });
        return { title: 'Laboratory Bookings', columns: col(['ref', 'Ref'], ['lecturer', 'Lecturer'], ['course', 'Course'], ['code', 'Module'], ['start', 'Start'], ['end', 'End'], ['students', 'Students'], ['pcs', 'PCs'], ['status', 'Status']), rows: b.map((x) => ({ ref: x.refNo, lecturer: x.lecturer.fullName, course: x.course, code: x.moduleCode, start: dt(x.startTime), end: dt(x.endTime), students: x.studentCount, pcs: x.computersNeeded, status: x.status })) };
      }
      case 'lab-utilization': {
        const f = from ?? new Date(Date.now() - 30 * 86400_000), t = to ?? new Date();
        const b = await this.prisma.labBooking.findMany({ where: { status: 'APPROVED', startTime: { gte: f, lte: t } } });
        const byDay = new Map<string, { hours: number; sessions: number; students: number }>();
        for (const x of b) {
          const k = d(x.startTime); const e = byDay.get(k) ?? { hours: 0, sessions: 0, students: 0 };
          e.hours += (x.endTime.getTime() - x.startTime.getTime()) / 3600_000; e.sessions++; e.students += x.studentCount; byDay.set(k, e);
        }
        const rows = [...byDay.entries()].sort().map(([day, v]) => ({ day, sessions: v.sessions, hours: Math.round(v.hours * 10) / 10, students: v.students, utilisation: `${Math.round((v.hours / 10) * 100)}%` }));
        return { title: 'Laboratory Utilization', columns: col(['day', 'Date'], ['sessions', 'Sessions'], ['hours', 'Hours booked'], ['students', 'Students'], ['utilisation', 'Utilisation (10h day)']), rows, summary: `${b.length} approved sessions, ${rows.reduce((n, r) => n + r.hours, 0).toFixed(1)} hours` };
      }
      case 'reservations': {
        const r = await this.prisma.bookingResource.findMany({ where: { reserved: true, booking: { status: 'APPROVED' } }, include: { asset: true, booking: { include: { lecturer: true } } }, orderBy: { booking: { startTime: 'desc' } } });
        return { title: 'Reservations', columns: col(['asset', 'Asset'], ['name', 'Name'], ['booking', 'Booking'], ['lecturer', 'Lecturer'], ['start', 'Start'], ['end', 'End']), rows: r.map((x) => ({ asset: x.asset?.assetTag, name: x.asset?.name, booking: x.booking.refNo, lecturer: x.booking.lecturer.fullName, start: dt(x.booking.startTime), end: dt(x.booking.endTime) })) };
      }
      case 'maintenance':
      case 'repairs': {
        const m = await this.prisma.maintenance.findMany({ where: { ...range('reportedAt'), status: type === 'repairs' ? { in: ['REPAIRED', 'AWAITING_VERIFICATION', 'VERIFIED', 'CLOSED'] } : undefined }, include: { asset: true, technician: true, verifiedBy: true }, orderBy: { reportedAt: 'desc' } });
        return { title: type === 'maintenance' ? 'Maintenance Report' : 'Repairs Report', columns: col(['ref', 'Ref'], ['asset', 'Asset'], ['problem', 'Problem'], ['priority', 'Priority'], ['status', 'Status'], ['tech', 'Technician'], ['cost', 'Cost'], ['verified', 'Verified by']), rows: m.map((x) => ({ ref: x.refNo, asset: x.asset.assetTag, problem: x.problem, priority: x.priority, status: x.status, tech: x.technician?.fullName ?? '', cost: toNum(x.cost) ?? '', verified: x.verifiedBy?.fullName ?? '' })) };
      }
      case 'repair-costs': {
        const m = await this.prisma.maintenance.findMany({ where: { cost: { not: null }, ...range('reportedAt') }, include: { asset: { include: { category: true } } } });
        const by = new Map<string, { n: number; total: number }>();
        for (const x of m) { const k = x.asset.category.name; const e = by.get(k) ?? { n: 0, total: 0 }; e.n++; e.total += Number(x.cost); by.set(k, e); }
        const rows = [...by.entries()].map(([category, v]) => ({ category, jobs: v.n, total: v.total }));
        return { title: 'Repair Costs by Category', columns: col(['category', 'Category'], ['jobs', 'Jobs'], ['total', 'Total cost (LKR)']), rows, summary: `Total: ${rows.reduce((n, r) => n + r.total, 0).toLocaleString('en-US')} LKR` };
      }
      case 'damage': {
        const x = await this.prisma.damageReport.findMany({ where: range('reportedAt'), include: { asset: true, reporter: true }, orderBy: { reportedAt: 'desc' } });
        return { title: 'Damage Report', columns: col(['ref', 'Ref'], ['asset', 'Asset'], ['severity', 'Severity'], ['status', 'Status'], ['reporter', 'Reporter'], ['date', 'Date'], ['cost', 'Est. cost']), rows: x.map((r) => ({ ref: r.refNo, asset: r.asset.assetTag, severity: r.severity, status: r.status, reporter: r.reporter.fullName, date: dt(r.reportedAt), cost: toNum(r.estimatedCost) ?? '' })) };
      }
      case 'lost': {
        const x = await this.prisma.lostReport.findMany({ include: { asset: true }, orderBy: { reportedAt: 'desc' } });
        return { title: 'Missing / Lost Assets', columns: col(['ref', 'Ref'], ['asset', 'Asset'], ['user', 'Last known user'], ['loc', 'Last known location'], ['recovery', 'Recovery'], ['date', 'Reported']), rows: x.map((r) => ({ ref: r.refNo, asset: r.asset.assetTag, user: r.lastKnownUser ?? '', loc: r.lastKnownLocation ?? '', recovery: r.recovery, date: dt(r.reportedAt) })) };
      }
      case 'stocktake': {
        if (!q.stocktakeId) throw new BadRequestException('stocktakeId is required');
        const s = await this.prisma.stocktake.findUnique({ where: { id: q.stocktakeId }, include: { items: { include: { asset: { include: { location: true } } } } } });
        if (!s) throw new BadRequestException('Unknown stocktake');
        return { title: `Stocktake ${s.refNo} – ${s.title}`, columns: col(['asset', 'Asset'], ['name', 'Name'], ['location', 'Location'], ['result', 'Result'], ['note', 'Note']), rows: s.items.map((i) => ({ asset: i.asset.assetTag, name: i.asset.name, location: i.asset.location?.name ?? '', result: i.result ?? 'UNCHECKED', note: i.note ?? '' })) };
      }
      case 'warranty-expiry': {
        const days = parseInt(q.days ?? '90', 10) || 90;
        const a = await this.prisma.acquisition.findMany({ where: { warrantyEnd: { not: null, lte: new Date(Date.now() + days * 86400_000) }, asset: { isArchived: false } }, include: { asset: true }, orderBy: { warrantyEnd: 'asc' } });
        return { title: `Warranty Expiry (next ${days} days)`, columns: col(['asset', 'Asset'], ['name', 'Name'], ['end', 'Warranty end'], ['state', 'State']), rows: a.map((x) => ({ asset: x.asset.assetTag, name: x.asset.name, end: d(x.warrantyEnd), state: x.warrantyEnd! < new Date() ? 'EXPIRED' : 'EXPIRING' })) };
      }
      default: throw new BadRequestException(`Unknown report type. Available: ${this.types.join(', ')}`);
    }
  }
}
