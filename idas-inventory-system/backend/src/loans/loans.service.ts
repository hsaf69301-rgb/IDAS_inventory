import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AssetCondition, LoanRequestStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AssetsService } from '../assets/assets.service';
import { MaintenanceService } from '../maintenance/maintenance.service';
import { AuthUser, ReqMeta } from '../common/decorators';
import { PERMISSIONS } from '../common/permissions';
import { Tx, nextRef, pageParams } from '../common/util';

const UNUSABLE = ['RETIRED', 'DISPOSED', 'MISSING', 'LOST', 'DAMAGED', 'UNDER_MAINTENANCE', 'UNDER_REPAIR', 'UNDER_INSPECTION'] as const;

const include = {
  requester: { select: { id: true, fullName: true, universityId: true, email: true, department: { select: { name: true } }, role: { select: { label: true } } } },
  approver: { select: { fullName: true } }, issuer: { select: { fullName: true } }, receiver: { select: { fullName: true } },
  items: { include: { asset: { select: { id: true, assetTag: true, name: true, status: true, isConsumable: true } } } },
} satisfies Prisma.LoanRequestInclude;

@Injectable()
export class LoansService {
  constructor(private prisma: PrismaService, private audit: AuditService, private notif: NotificationsService, private assets: AssetsService, private maint: MaintenanceService) {}

  private withOverdue<T extends { status: LoanRequestStatus; dueAt: Date }>(l: T) {
    return { ...l, isOverdue: l.status === 'ISSUED' && l.dueAt < new Date() };
  }

  async list(user: AuthUser, q: { status?: string; mine?: string; overdue?: string; search?: string; page?: any; pageSize?: any }) {
    const { page, pageSize, skip, take } = pageParams(q);
    const canAll = user.permissions.includes(PERMISSIONS.LOAN_READ_ALL);
    const where: Prisma.LoanRequestWhereInput = {
      requesterId: !canAll || q.mine === 'true' ? user.id : undefined,
      status: (q.status as LoanRequestStatus) || undefined,
      ...(q.overdue === 'true' ? { status: 'ISSUED', dueAt: { lt: new Date() } } : {}),
      OR: q.search ? [{ refNo: { contains: q.search, mode: 'insensitive' } }, { requester: { fullName: { contains: q.search, mode: 'insensitive' } } }, { items: { some: { asset: { assetTag: { contains: q.search, mode: 'insensitive' } } } } }] : undefined,
    };
    const [rows, total] = await Promise.all([
      this.prisma.loanRequest.findMany({ where, include, orderBy: { createdAt: 'desc' }, skip, take }),
      this.prisma.loanRequest.count({ where }),
    ]);
    return { rows: rows.map((r) => this.withOverdue(r)), total, page, pageSize };
  }

  async get(user: AuthUser, id: string) {
    const l = await this.prisma.loanRequest.findUnique({ where: { id }, include: { ...include, inspections: { include: { inspector: { select: { fullName: true } } } } } });
    if (!l) throw new NotFoundException('Loan not found');
    if (l.requesterId !== user.id && !user.permissions.includes(PERMISSIONS.LOAN_READ_ALL)) throw new ForbiddenException();
    return this.withOverdue(l);
  }

  /** Assets that conflict with the window (other approved/issued loans or approved booking reservations). */
  async conflictingAssetIds(db: Tx | PrismaService, assetIds: string[], from: Date, to: Date, excludeLoanId?: string) {
    const [loanRows, resRows] = await Promise.all([
      db.loanItem.findMany({
        where: { assetId: { in: assetIds }, loan: { id: excludeLoanId ? { not: excludeLoanId } : undefined, status: { in: ['APPROVED', 'ISSUED'] }, requiredFrom: { lt: to }, dueAt: { gt: from } } },
        select: { assetId: true },
      }),
      db.bookingResource.findMany({
        where: { assetId: { in: assetIds }, reserved: true, booking: { status: 'APPROVED', startTime: { lt: to }, endTime: { gt: from } } },
        select: { assetId: true },
      }),
    ]);
    return new Set([...loanRows.map((r) => r.assetId), ...resRows.map((r) => r.assetId!)]);
  }

  async create(user: AuthUser, dto: { purpose: string; useLocation: string; requiredFrom: string; dueAt: string; notes?: string; items: { assetId: string; quantity?: number }[] }, meta: ReqMeta) {
    const from = new Date(dto.requiredFrom), due = new Date(dto.dueAt);
    if (isNaN(+from) || isNaN(+due)) throw new BadRequestException('Invalid dates');
    if (due <= from) throw new BadRequestException('Return time must be after the start time');
    if (due.getTime() < Date.now()) throw new BadRequestException('Return time is in the past');
    const ids = dto.items.map((i) => i.assetId);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Duplicate items in request');
    const assets = await this.prisma.asset.findMany({ where: { id: { in: ids }, isArchived: false } });
    if (assets.length !== ids.length) throw new BadRequestException('One or more assets do not exist');
    for (const a of assets) {
      if ((UNUSABLE as readonly string[]).includes(a.status)) throw new ConflictException(`${a.assetTag} is not available (${a.status})`);
      const qty = dto.items.find((i) => i.assetId === a.id)!.quantity ?? 1;
      if (qty > a.quantity) throw new BadRequestException(`${a.assetTag}: only ${a.quantity} in stock`);
      if (!a.isConsumable && qty !== 1) throw new BadRequestException(`${a.assetTag} is a single unit`);
    }
    const clash = await this.conflictingAssetIds(this.prisma, ids, from, due);
    if (clash.size) {
      const tags = assets.filter((a) => clash.has(a.id)).map((a) => a.assetTag).join(', ');
      throw new ConflictException(`Already reserved or on loan during that period: ${tags}`);
    }
    return this.prisma.$transaction(async (tx) => {
      const refNo = await nextRef(tx, 'LN');
      const l = await tx.loanRequest.create({
        data: { refNo, requesterId: user.id, purpose: dto.purpose, useLocation: dto.useLocation, requiredFrom: from, dueAt: due, notes: dto.notes,
          items: { create: dto.items.map((i) => ({ assetId: i.assetId, quantity: i.quantity ?? 1 })) } },
      });
      await this.audit.log(tx, { userId: user.id, action: 'Equipment requested', module: 'loans', recordId: l.id, next: { refNo, items: assets.map((a) => a.assetTag) }, meta });
      await this.notif.notifyRoles(tx, ['TECHNICIAN', 'ADMIN'], 'LOAN_REQUESTED', `New equipment request ${refNo}`, `${user.fullName} requested ${assets.length} item(s)`, '/loans');
      return l;
    });
  }

  private async load(id: string) {
    const l = await this.prisma.loanRequest.findUnique({ where: { id }, include: { items: { include: { asset: true } } } });
    if (!l) throw new NotFoundException('Loan not found');
    return l;
  }

  async decide(user: AuthUser, id: string, approve: boolean, reason: string | undefined, meta: ReqMeta) {
    const l = await this.load(id);
    if (l.status !== 'PENDING') throw new ConflictException(`Request is already ${l.status}`);
    if (!approve && !reason?.trim()) throw new BadRequestException('A reason is required when rejecting');
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(7003)`;
      if (approve) {
        const clash = await this.conflictingAssetIds(tx, l.items.map((i) => i.assetId), l.requiredFrom, l.dueAt, l.id);
        if (clash.size) throw new ConflictException('Some items are no longer available for that period');
        const bad = l.items.find((i) => (UNUSABLE as readonly string[]).includes(i.asset.status));
        if (bad) throw new ConflictException(`${bad.asset.assetTag} is not available (${bad.asset.status})`);
      }
      const u = await tx.loanRequest.update({ where: { id }, data: { status: approve ? 'APPROVED' : 'REJECTED', approverId: user.id, decidedAt: new Date(), rejectionReason: approve ? null : reason } });
      await this.audit.log(tx, { userId: user.id, action: approve ? 'Equipment request approved' : 'Equipment request rejected', module: 'loans', recordId: id, previous: { status: l.status }, next: { status: u.status, reason }, meta });
      await this.notif.notify(tx, [l.requesterId], approve ? 'LOAN_APPROVED' : 'LOAN_REJECTED', approve ? `Request ${l.refNo} approved` : `Request ${l.refNo} rejected`, approve ? 'Collect your equipment from the IDAS Lab.' : `Reason: ${reason}`, '/requests');
      return u;
    });
  }

  async cancel(user: AuthUser, id: string, meta: ReqMeta) {
    const l = await this.load(id);
    if (l.requesterId !== user.id && !user.permissions.includes(PERMISSIONS.LOAN_MANAGE)) throw new ForbiddenException();
    if (!['PENDING', 'APPROVED'].includes(l.status)) throw new ConflictException('Only pending or approved requests can be cancelled');
    return this.prisma.$transaction(async (tx) => {
      const u = await tx.loanRequest.update({ where: { id }, data: { status: 'CANCELLED' } });
      await this.audit.log(tx, { userId: user.id, action: 'Equipment request cancelled', module: 'loans', recordId: id, meta });
      return u;
    });
  }

  /** Issue: only APPROVED requests; every asset must still be AVAILABLE. Concurrency-safe via conditional update. */
  async issue(user: AuthUser, id: string, dto: { accessories?: string; conditions?: Record<string, AssetCondition> }, meta: ReqMeta) {
    const l = await this.load(id);
    if (l.status !== 'APPROVED') throw new ConflictException('Only approved requests can be issued');
    return this.prisma.$transaction(async (tx) => {
      for (const item of l.items) {
        const res = await tx.asset.updateMany({ where: { id: item.assetId, status: 'AVAILABLE' }, data: { status: 'BORROWED' } });
        if (res.count !== 1) throw new ConflictException(`${item.asset.assetTag} is not available to issue (${item.asset.status})`);
        await tx.assetHistory.create({ data: { assetId: item.assetId, field: 'status', oldValue: 'AVAILABLE', newValue: 'BORROWED', changedById: user.id } });
        await tx.loanItem.update({ where: { id: item.id }, data: { conditionOnIssue: dto.conditions?.[item.assetId] ?? item.asset.condition } });
        await tx.asset.update({ where: { id: item.assetId }, data: { responsibleUserId: l.requesterId } });
      }
      const u = await tx.loanRequest.update({ where: { id }, data: { status: 'ISSUED', issuerId: user.id, issuedAt: new Date(), accessories: dto.accessories } });
      await this.audit.log(tx, { userId: user.id, action: 'Asset issued', module: 'loans', recordId: id, previous: { status: 'APPROVED' }, next: { status: 'ISSUED', items: l.items.map((i) => i.asset.assetTag) }, meta });
      return u;
    });
  }

  /** Return: records condition & missing accessories; assets go to UNDER_INSPECTION until inspected. */
  async receiveReturn(user: AuthUser, id: string, dto: { conditions?: Record<string, AssetCondition>; missingAccessories?: string }, meta: ReqMeta) {
    const l = await this.load(id);
    if (l.status !== 'ISSUED') throw new ConflictException('Only issued loans can be returned');
    return this.prisma.$transaction(async (tx) => {
      for (const item of l.items) {
        await tx.loanItem.update({ where: { id: item.id }, data: { conditionOnReturn: dto.conditions?.[item.assetId] ?? item.asset.condition } });
        await this.assets.changeStatus(tx, user.id, item.assetId, 'UNDER_INSPECTION', `Returned on ${l.refNo}`, meta);
        await tx.asset.update({ where: { id: item.assetId }, data: { responsibleUserId: null } });
      }
      const u = await tx.loanRequest.update({ where: { id }, data: { status: 'RETURNED', receiverId: user.id, returnedAt: new Date(), missingAccessories: dto.missingAccessories } });
      await this.audit.log(tx, { userId: user.id, action: 'Asset returned', module: 'loans', recordId: id, previous: { status: 'ISSUED' }, next: { status: 'RETURNED', missingAccessories: dto.missingAccessories }, meta });
      return u;
    });
  }

  /**
   * Inspection after return. Pass → asset AVAILABLE. Fail → maintenance record is opened
   * and the asset stays unavailable until the repair is verified.
   */
  async inspect(user: AuthUser, assetId: string, dto: { loanId?: string; passed: boolean; conditionFound: AssetCondition; damageNotes?: string }, meta: ReqMeta) {
    const asset = await this.prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset) throw new NotFoundException('Asset not found');
    if (asset.status !== 'UNDER_INSPECTION') throw new ConflictException('Asset is not awaiting inspection');
    if (!dto.passed && !dto.damageNotes?.trim()) throw new BadRequestException('Describe the problem found');
    return this.prisma.$transaction(async (tx) => {
      const insp = await tx.inspection.create({ data: { assetId, loanId: dto.loanId, inspectorId: user.id, conditionFound: dto.conditionFound, passed: dto.passed, damageNotes: dto.damageNotes } });
      let maintenanceId: string | undefined;
      if (dto.passed) {
        await this.assets.assertCanBeAvailable(tx, assetId);
        await this.assets.changeStatus(tx, user.id, assetId, 'AVAILABLE', 'Inspection passed', meta, dto.conditionFound);
      } else {
        const m = await this.maint.createForAsset(tx, user.id, { assetId, problem: `Failed inspection: ${dto.damageNotes}`, priority: ['DAMAGED', 'NON_FUNCTIONAL'].includes(dto.conditionFound) ? 'HIGH' : 'MEDIUM' }, meta);
        maintenanceId = m.id;
        await tx.asset.update({ where: { id: assetId }, data: { condition: dto.conditionFound } });
      }
      await this.audit.log(tx, { userId: user.id, action: dto.passed ? 'Inspection passed' : 'Inspection failed', module: 'loans', recordId: insp.id, next: { assetId, ...dto }, meta });
      return { inspection: insp, maintenanceId };
    });
  }

  /** Flags loans past due: assets → OVERDUE and notifies borrower + staff (once per loan). Run by scheduler and on demand. */
  async markOverdue(now = new Date()) {
    const loans = await this.prisma.loanRequest.findMany({ where: { status: 'ISSUED', dueAt: { lt: now } }, include: { items: { include: { asset: true } } } });
    let flagged = 0;
    for (const l of loans) {
      const pending = l.items.filter((i) => i.asset.status === 'BORROWED');
      if (!pending.length) continue;
      await this.prisma.$transaction(async (tx) => {
        for (const i of pending) await this.assets.changeStatus(tx, null, i.assetId, 'OVERDUE', `Loan ${l.refNo} overdue`);
        await this.notif.notify(tx, [l.requesterId], 'LOAN_OVERDUE', `Loan ${l.refNo} is overdue`, 'Please return the equipment to the IDAS Lab.', '/requests');
        await this.notif.notifyRoles(tx, ['TECHNICIAN', 'ADMIN'], 'LOAN_OVERDUE', `Overdue: ${l.refNo}`, `${pending.length} item(s) not returned`, '/loans');
        await this.audit.log(tx, { userId: null, action: 'Loan marked overdue', module: 'loans', recordId: l.id, next: { refNo: l.refNo } });
      });
      flagged++;
    }
    return { flagged };
  }

  /** Reminds borrowers about loans due within the next 24h (once per loan). */
  async remindDueSoon(now = new Date()) {
    const soon = new Date(now.getTime() + 24 * 3600_000);
    const loans = await this.prisma.loanRequest.findMany({ where: { status: 'ISSUED', dueAt: { gte: now, lte: soon } } });
    let sent = 0;
    for (const l of loans) {
      const exists = await this.prisma.notification.count({ where: { userId: l.requesterId, type: 'LOAN_DUE', message: { contains: l.refNo } } });
      if (exists) continue;
      await this.notif.notify(null, [l.requesterId], 'LOAN_DUE', 'Equipment due soon', `Loan ${l.refNo} is due ${l.dueAt.toISOString().slice(0, 16).replace('T', ' ')} UTC`, '/requests');
      sent++;
    }
    return { sent };
  }
}
