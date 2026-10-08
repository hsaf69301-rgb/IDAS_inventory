import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AssetCondition, AssetStatus, MaintenanceStatus, Prisma, Priority, Severity } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AssetsService } from '../assets/assets.service';
import { ReqMeta } from '../common/decorators';
import { Tx, nextRef, pageParams, toNum } from '../common/util';

/** Allowed workflow transitions: Reported → Diagnosing → Assigned → Under Repair → Repaired → Awaiting Verification → Verified → Closed */
export const MAINT_FLOW: Record<MaintenanceStatus, MaintenanceStatus[]> = {
  REPORTED: ['DIAGNOSING'],
  DIAGNOSING: ['ASSIGNED'],
  ASSIGNED: ['UNDER_REPAIR'],
  UNDER_REPAIR: ['REPAIRED'],
  REPAIRED: ['AWAITING_VERIFICATION'],
  AWAITING_VERIFICATION: [], // leaves only through verify()
  VERIFIED: ['CLOSED'],
  CLOSED: [],
};
const ASSET_STATUS_FOR: Partial<Record<MaintenanceStatus, AssetStatus>> = {
  REPORTED: 'UNDER_MAINTENANCE', DIAGNOSING: 'UNDER_MAINTENANCE',
  ASSIGNED: 'UNDER_REPAIR', UNDER_REPAIR: 'UNDER_REPAIR', REPAIRED: 'UNDER_REPAIR', AWAITING_VERIFICATION: 'UNDER_REPAIR',
};

const include = {
  asset: { select: { id: true, assetTag: true, name: true, status: true } },
  reporter: { select: { id: true, fullName: true } },
  technician: { select: { id: true, fullName: true } },
  verifiedBy: { select: { id: true, fullName: true } },
} satisfies Prisma.MaintenanceInclude;

@Injectable()
export class MaintenanceService {
  constructor(private prisma: PrismaService, private audit: AuditService, private notif: NotificationsService, private assets: AssetsService) {}

  private shape<T extends { cost: Prisma.Decimal | null }>(m: T) { return { ...m, cost: toNum(m.cost) }; }

  async list(q: { status?: string; assetId?: string; open?: string; page?: any; pageSize?: any }) {
    const { page, pageSize, skip, take } = pageParams(q);
    const where: Prisma.MaintenanceWhereInput = {
      status: (q.status as MaintenanceStatus) || (q.open === 'true' ? { notIn: ['CLOSED'] } : undefined),
      assetId: q.assetId || undefined,
    };
    const [rows, total] = await Promise.all([
      this.prisma.maintenance.findMany({ where, include, orderBy: { reportedAt: 'desc' }, skip, take }),
      this.prisma.maintenance.count({ where }),
    ]);
    return { rows: rows.map((r) => this.shape(r)), total, page, pageSize };
  }

  async get(id: string) {
    const m = await this.prisma.maintenance.findUnique({ where: { id }, include: { ...include, steps: { orderBy: { at: 'asc' } } } });
    if (!m) throw new NotFoundException('Maintenance record not found');
    return this.shape(m);
  }

  /** Creates a maintenance record inside the caller's transaction (also used by loan inspection & damage reports). */
  async createForAsset(tx: Tx, actorId: string, dto: { assetId: string; problem: string; priority?: Priority; notes?: string }, meta?: ReqMeta) {
    const asset = await tx.asset.findUniqueOrThrow({ where: { id: dto.assetId } });
    if (['BORROWED', 'OVERDUE'].includes(asset.status)) throw new ConflictException('Asset is on loan; return it before opening maintenance');
    const open = await tx.maintenance.findFirst({ where: { assetId: dto.assetId, status: { notIn: ['CLOSED'] } } });
    if (open) throw new ConflictException(`Asset already has an open maintenance record (${open.refNo})`);
    const refNo = await nextRef(tx, 'MT');
    const m = await tx.maintenance.create({
      data: { refNo, assetId: dto.assetId, problem: dto.problem, reporterId: actorId, priority: dto.priority ?? 'MEDIUM', notes: dto.notes,
        steps: { create: { toStatus: 'REPORTED', actorId, note: 'Reported' } } },
    });
    await this.assets.changeStatus(tx, actorId, dto.assetId, 'UNDER_MAINTENANCE', `Maintenance ${refNo} opened`, meta);
    await this.audit.log(tx, { userId: actorId, action: 'Maintenance created', module: 'maintenance', recordId: m.id, next: { refNo, asset: asset.assetTag, problem: dto.problem }, meta });
    await this.notif.notifyRoles(tx, ['ADMIN', 'TECHNICIAN'], 'MAINTENANCE', `Maintenance ${refNo} reported`, `${asset.assetTag} · ${asset.name}: ${dto.problem}`, `/maintenance`);
    return m;
  }

  create(actorId: string, dto: { assetId: string; problem: string; priority?: Priority; notes?: string }, meta: ReqMeta) {
    return this.prisma.$transaction((tx) => this.createForAsset(tx, actorId, dto, meta));
  }

  async advance(actorId: string, id: string, dto: any, meta: ReqMeta) {
    const m = await this.prisma.maintenance.findUnique({ where: { id } });
    if (!m) throw new NotFoundException('Maintenance record not found');
    const to: MaintenanceStatus = dto.to;
    if (to === 'VERIFIED') throw new BadRequestException('Use the verification step to mark a repair as verified');
    if (!MAINT_FLOW[m.status].includes(to)) throw new BadRequestException(`Cannot move from ${m.status} to ${to}`);

    const data: Prisma.MaintenanceUpdateInput = { status: to };
    const f = (k: string) => (dto[k] !== undefined ? dto[k] : undefined);
    if (f('diagnosis') !== undefined) data.diagnosis = dto.diagnosis;
    if (f('actionTaken') !== undefined) data.actionTaken = dto.actionTaken;
    if (f('partsUsed') !== undefined) data.partsUsed = dto.partsUsed;
    if (f('cost') !== undefined) data.cost = dto.cost;
    if (f('repairProvider') !== undefined) data.repairProvider = dto.repairProvider;
    if (f('notes') !== undefined) data.notes = dto.notes;
    if (to === 'ASSIGNED') {
      const techId = dto.technicianId ?? m.technicianId;
      if (!techId) throw new BadRequestException('A technician must be assigned');
      const t = await this.prisma.user.findUnique({ where: { id: techId }, include: { role: true } });
      if (!t || !['TECHNICIAN', 'ADMIN'].includes(t.role.name)) throw new BadRequestException('Assignee must be a technician or admin');
      data.technician = { connect: { id: techId } };
    }
    if (to === 'UNDER_REPAIR' && !m.repairStart) data.repairStart = dto.repairStart ? new Date(dto.repairStart) : new Date();
    if (to === 'REPAIRED') {
      if (!(dto.actionTaken ?? m.actionTaken)) throw new BadRequestException('Describe the action taken before marking as repaired');
      data.repairEnd = dto.repairEnd ? new Date(dto.repairEnd) : new Date();
      data.repairedBy = (await this.prisma.user.findUniqueOrThrow({ where: { id: m.technicianId ?? actorId } })).fullName;
    }
    return this.prisma.$transaction(async (tx) => {
      const u = await tx.maintenance.update({ where: { id }, data });
      await tx.maintenanceStep.create({ data: { maintenanceId: id, fromStatus: m.status, toStatus: to, actorId, note: dto.note } });
      if (to === 'CLOSED') {
        const a = await tx.asset.findUniqueOrThrow({ where: { id: m.assetId } });
        if (m.testPassed !== true && a.status !== 'RETIRED' && a.status !== 'DISPOSED') throw new ConflictException('Repair was not verified successfully');
        await tx.maintenance.update({ where: { id }, data: { closedAt: new Date() } });
      } else if (ASSET_STATUS_FOR[to]) {
        await this.assets.changeStatus(tx, actorId, m.assetId, ASSET_STATUS_FOR[to]!, `Maintenance ${m.refNo}: ${to}`, meta);
      }
      await this.audit.log(tx, { userId: actorId, action: `Maintenance ${to.toLowerCase().replace(/_/g, ' ')}`, module: 'maintenance', recordId: id, previous: { status: m.status }, next: { status: to }, meta });
      return this.shape(u);
    });
  }

  /**
   * Verification gate: an asset only returns to AVAILABLE after a successful, recorded test.
   * A failed test sends the job back to UNDER_REPAIR and the asset stays unavailable.
   */
  async verify(actorId: string, id: string, dto: { testPerformed: string; testPassed: boolean; notes?: string; condition?: AssetCondition }, meta: ReqMeta) {
    const m = await this.prisma.maintenance.findUnique({ where: { id } });
    if (!m) throw new NotFoundException('Maintenance record not found');
    if (m.status !== 'AWAITING_VERIFICATION') throw new BadRequestException('Only repairs awaiting verification can be verified');
    return this.prisma.$transaction(async (tx) => {
      const base = { verifiedBy: { connect: { id: actorId } }, verifiedAt: new Date(), testPerformed: dto.testPerformed, testPassed: dto.testPassed, verificationNotes: dto.notes };
      if (dto.testPassed) {
        await tx.maintenance.update({ where: { id }, data: { ...base, status: 'VERIFIED' } });
        await tx.maintenanceStep.create({ data: { maintenanceId: id, fromStatus: m.status, toStatus: 'VERIFIED', actorId, note: dto.notes } });
        await this.assets.changeStatus(tx, actorId, m.assetId, 'AVAILABLE', `Repair ${m.refNo} verified`, meta, dto.condition ?? 'GOOD');
        await this.notif.notify(tx, [m.reporterId], 'REPAIR_COMPLETED', `Repair ${m.refNo} completed`, 'The asset has been repaired, verified and returned to stock.', '/maintenance');
      } else {
        await tx.maintenance.update({ where: { id }, data: { ...base, status: 'UNDER_REPAIR' } });
        await tx.maintenanceStep.create({ data: { maintenanceId: id, fromStatus: m.status, toStatus: 'UNDER_REPAIR', actorId, note: `Verification FAILED: ${dto.testPerformed}` } });
      }
      await this.audit.log(tx, { userId: actorId, action: dto.testPassed ? 'Repair verified' : 'Repair verification failed', module: 'maintenance', recordId: id, next: dto, meta });
      return this.get(id);
    });
  }

  // ───────── Damage reports ─────────
  async listDamage(q: { assetId?: string; status?: string; page?: any; pageSize?: any }) {
    const { page, pageSize, skip, take } = pageParams(q);
    const where: Prisma.DamageReportWhereInput = { assetId: q.assetId || undefined, status: (q.status as any) || undefined };
    const [rows, total] = await Promise.all([
      this.prisma.damageReport.findMany({ where, orderBy: { reportedAt: 'desc' }, skip, take, include: { asset: { select: { id: true, assetTag: true, name: true } }, reporter: { select: { fullName: true } }, associatedUser: { select: { fullName: true } } } }),
      this.prisma.damageReport.count({ where }),
    ]);
    return { rows: rows.map((r) => ({ ...r, estimatedCost: toNum(r.estimatedCost) })), total, page, pageSize };
  }

  async createDamage(actorId: string, dto: { assetId: string; description: string; severity: Severity; location?: string; associatedUserId?: string; estimatedCost?: number }, meta: ReqMeta) {
    const asset = await this.prisma.asset.findUnique({ where: { id: dto.assetId } });
    if (!asset) throw new NotFoundException('Asset not found');
    return this.prisma.$transaction(async (tx) => {
      const refNo = await nextRef(tx, 'DM');
      const d = await tx.damageReport.create({ data: { refNo, assetId: dto.assetId, reporterId: actorId, description: dto.description, severity: dto.severity, location: dto.location, associatedUserId: dto.associatedUserId, estimatedCost: dto.estimatedCost } });
      const onLoan = ['BORROWED', 'OVERDUE'].includes(asset.status);
      if (!onLoan && !['UNDER_MAINTENANCE', 'UNDER_REPAIR'].includes(asset.status)) {
        await this.assets.changeStatus(tx, actorId, asset.id, 'DAMAGED', `Damage ${refNo}`, meta, 'DAMAGED');
      }
      let maintenanceId: string | undefined;
      if ((dto.severity === 'MAJOR' || dto.severity === 'CRITICAL') && !onLoan) {
        const open = await tx.maintenance.findFirst({ where: { assetId: asset.id, status: { notIn: ['CLOSED'] } } });
        if (!open) {
          const m = await this.createForAsset(tx, actorId, { assetId: asset.id, problem: `Damage ${refNo}: ${dto.description}`, priority: dto.severity === 'CRITICAL' ? 'CRITICAL' : 'HIGH' }, meta);
          maintenanceId = m.id;
          await tx.damageReport.update({ where: { id: d.id }, data: { maintenanceId } });
        }
      }
      await this.audit.log(tx, { userId: actorId, action: 'Damage reported', module: 'damage', recordId: d.id, next: { refNo, asset: asset.assetTag, severity: dto.severity }, meta });
      await this.notif.notifyRoles(tx, ['ADMIN', 'TECHNICIAN'], 'DAMAGE_REPORTED', `Damage reported: ${asset.assetTag}`, `${dto.severity} – ${dto.description}`, '/damage');
      return { ...d, maintenanceId };
    });
  }

  async updateDamage(actorId: string, id: string, dto: { status?: any; investigationNotes?: string; estimatedCost?: number }, meta: ReqMeta) {
    const before = await this.prisma.damageReport.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Damage report not found');
    return this.prisma.$transaction(async (tx) => {
      const u = await tx.damageReport.update({ where: { id }, data: dto });
      await this.audit.log(tx, { userId: actorId, action: 'Damage report updated', module: 'damage', recordId: id, previous: { status: before.status, investigationNotes: before.investigationNotes }, next: dto, meta });
      return u;
    });
  }

  // ───────── Lost / missing ─────────
  async listLost() {
    const rows = await this.prisma.lostReport.findMany({ orderBy: { reportedAt: 'desc' }, include: { asset: { select: { id: true, assetTag: true, name: true } }, reporter: { select: { fullName: true } } } });
    return rows;
  }
  async createLost(actorId: string, dto: { assetId: string; lastKnownUser?: string; lastKnownLocation?: string; lastSeenAt?: string; investigation?: string; notes?: string; lost?: boolean }, meta: ReqMeta) {
    const asset = await this.prisma.asset.findUnique({ where: { id: dto.assetId } });
    if (!asset) throw new NotFoundException('Asset not found');
    if (['MISSING', 'LOST'].includes(asset.status)) throw new ConflictException('Asset is already reported missing/lost');
    return this.prisma.$transaction(async (tx) => {
      const refNo = await nextRef(tx, 'LS');
      const r = await tx.lostReport.create({ data: { refNo, assetId: asset.id, reporterId: actorId, lastKnownUser: dto.lastKnownUser, lastKnownLocation: dto.lastKnownLocation, lastSeenAt: dto.lastSeenAt ? new Date(dto.lastSeenAt) : undefined, investigation: dto.investigation, notes: dto.notes } });
      await this.assets.changeStatus(tx, actorId, asset.id, dto.lost ? 'LOST' : 'MISSING', `Lost report ${refNo}`, meta);
      await this.audit.log(tx, { userId: actorId, action: 'Asset reported missing', module: 'lost', recordId: r.id, next: { refNo, asset: asset.assetTag }, meta });
      await this.notif.notifyRoles(tx, ['ADMIN', 'TECHNICIAN'], 'ASSET_MISSING', `Missing asset: ${asset.assetTag}`, `${asset.name} reported ${dto.lost ? 'lost' : 'missing'}`, '/damage');
      return r;
    });
  }
  async updateLost(actorId: string, id: string, dto: { recovery?: any; investigation?: string; notes?: string }, meta: ReqMeta) {
    const before = await this.prisma.lostReport.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Report not found');
    return this.prisma.$transaction(async (tx) => {
      const u = await tx.lostReport.update({ where: { id }, data: dto });
      if (dto.recovery === 'RECOVERED' && before.recovery !== 'RECOVERED') {
        await this.assets.changeStatus(tx, actorId, before.assetId, 'UNDER_INSPECTION', 'Recovered – inspect before reuse', meta);
      }
      if (dto.recovery === 'WRITTEN_OFF') await this.assets.changeStatus(tx, actorId, before.assetId, 'LOST', 'Written off', meta);
      await this.audit.log(tx, { userId: actorId, action: 'Lost report updated', module: 'lost', recordId: id, previous: { recovery: before.recovery }, next: dto, meta });
      return u;
    });
  }
}
