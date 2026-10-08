import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AssetStatus, Prisma } from '@prisma/client';
import * as QRCode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ReqMeta } from '../common/decorators';
import { Tx, nextRef, pageParams, toNum } from '../common/util';
import { CreateAssetDto, MoveAssetDto, SetStatusDto, UpdateAssetDto } from './assets.dto';

/** Statuses owned by workflows (loans/bookings/maintenance); cannot be set by hand. */
const WORKFLOW_ONLY: AssetStatus[] = ['BORROWED', 'RESERVED', 'OVERDUE', 'UNDER_MAINTENANCE', 'UNDER_REPAIR'];
const TRACKED_FIELDS = ['name', 'description', 'brand', 'model', 'serialNumber', 'quantity', 'condition', 'notes', 'responsibleUserId'] as const;
const DATE_FIELDS: string[] = ['acquiredAt', 'warrantyStart', 'warrantyEnd'];
const ACQ_FIELDS = ['acquiredAt', 'supplier', 'invoiceRef', 'value', 'fundingSource', 'warrantyStart', 'warrantyEnd', 'warrantyDetails'] as const;

const listInclude = {
  category: { select: { id: true, name: true, code: true } },
  location: { select: { id: true, name: true } },
  responsibleUser: { select: { id: true, fullName: true } },
} satisfies Prisma.AssetInclude;

@Injectable()
export class AssetsService {
  constructor(private prisma: PrismaService, private audit: AuditService, private notif: NotificationsService) {}

  async list(q: { search?: string; categoryId?: string; locationId?: string; status?: string; condition?: string; sort?: string; dir?: string; page?: any; pageSize?: any; includeArchived?: string }) {
    const { page, pageSize, skip, take } = pageParams(q);
    const where: Prisma.AssetWhereInput = {
      isArchived: q.includeArchived === 'true' ? undefined : false,
      categoryId: q.categoryId || undefined,
      locationId: q.locationId || undefined,
      status: (q.status as AssetStatus) || undefined,
      condition: (q.condition as any) || undefined,
      OR: q.search ? [
        { assetTag: { contains: q.search, mode: 'insensitive' } },
        { name: { contains: q.search, mode: 'insensitive' } },
        { brand: { contains: q.search, mode: 'insensitive' } },
        { model: { contains: q.search, mode: 'insensitive' } },
        { serialNumber: { contains: q.search, mode: 'insensitive' } },
      ] : undefined,
    };
    const sortable = ['assetTag', 'name', 'status', 'condition', 'createdAt'];
    const sort = sortable.includes(q.sort ?? '') ? q.sort! : 'assetTag';
    const dir = q.dir === 'desc' ? 'desc' : 'asc';
    const [rows, total] = await Promise.all([
      this.prisma.asset.findMany({ where, include: listInclude, orderBy: { [sort]: dir }, skip, take }),
      this.prisma.asset.count({ where }),
    ]);
    return { rows, total, page, pageSize };
  }

  async get(id: string) {
    const a = await this.prisma.asset.findFirst({
      where: { OR: [{ id: id.match(/^[0-9a-f-]{36}$/i) ? id : undefined }, { assetTag: id }] },
      include: {
        ...listInclude,
        specifications: { where: { isCurrent: true }, orderBy: { key: 'asc' } },
        acquisition: true,
        documents: { select: { id: true, fileName: true, mimeType: true, sizeBytes: true, createdAt: true } },
      },
    });
    if (!a) throw new NotFoundException('Asset not found');
    const activeLoan = await this.prisma.loanItem.findFirst({
      where: { assetId: a.id, loan: { status: 'ISSUED' } },
      include: { loan: { select: { id: true, refNo: true, dueAt: true, requester: { select: { fullName: true } } } } },
    });
    const approvedLoan = await this.prisma.loanItem.findFirst({
      where: { assetId: a.id, loan: { status: 'APPROVED' } }, orderBy: { loan: { requiredFrom: 'asc' } },
      include: { loan: { select: { id: true, refNo: true, requiredFrom: true, requester: { select: { fullName: true } } } } },
    });
    return { ...a, acquisition: a.acquisition ? { ...a.acquisition, value: toNum(a.acquisition.value) } : null, activeLoan, approvedLoan };
  }

  async history(id: string) {
    const [changes, movements, specs] = await Promise.all([
      this.prisma.assetHistory.findMany({ where: { assetId: id }, orderBy: { changedAt: 'desc' } }),
      this.prisma.assetMovement.findMany({ where: { assetId: id }, orderBy: { movedAt: 'desc' }, include: { from: { select: { name: true } }, to: { select: { name: true } }, movedBy: { select: { fullName: true } } } }),
      this.prisma.assetSpecification.findMany({ where: { assetId: id }, orderBy: [{ key: 'asc' }, { validFrom: 'desc' }] }),
    ]);
    const userIds = [...new Set(changes.map((c) => c.changedById).filter(Boolean) as string[])];
    const users = await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true } });
    const nameOf = new Map(users.map((u) => [u.id, u.fullName]));
    return { changes: changes.map((c) => ({ ...c, changedBy: c.changedById ? nameOf.get(c.changedById) ?? null : null })), movements, specifications: specs };
  }

  async create(actorId: string, dto: CreateAssetDto, meta: ReqMeta) {
    const cat = await this.prisma.category.findUnique({ where: { id: dto.categoryId } });
    if (!cat) throw new BadRequestException('Unknown category');
    return this.prisma.$transaction(async (tx) => {
      const assetTag = await nextRef(tx, `IDAS-${cat.code}`);
      const a = await tx.asset.create({
        data: {
          assetTag, name: dto.name, categoryId: dto.categoryId, description: dto.description, brand: dto.brand, model: dto.model,
          serialNumber: dto.serialNumber || null, quantity: dto.quantity ?? 1, isConsumable: dto.isConsumable ?? false,
          condition: dto.condition ?? 'GOOD', locationId: dto.locationId, responsibleUserId: dto.responsibleUserId, notes: dto.notes,
          specifications: dto.specifications?.length ? { create: dto.specifications.map((s) => ({ key: s.key, value: s.value, changedById: actorId })) } : undefined,
          acquisition: dto.acquisition ? { create: this.acqData(dto.acquisition) } : undefined,
        },
      });
      if (dto.locationId) await tx.assetMovement.create({ data: { assetId: a.id, toId: dto.locationId, movedById: actorId, reason: 'Initial placement' } });
      await this.audit.log(tx, { userId: actorId, action: 'Asset created', module: 'assets', recordId: a.id, next: { assetTag, name: a.name, categoryId: a.categoryId }, meta });
      return a;
    });
  }

  private acqData(a: any) {
    return {
      acquiredAt: a.acquiredAt ? new Date(a.acquiredAt) : undefined, supplier: a.supplier, invoiceRef: a.invoiceRef,
      value: a.value, fundingSource: a.fundingSource, warrantyStart: a.warrantyStart ? new Date(a.warrantyStart) : undefined,
      warrantyEnd: a.warrantyEnd ? new Date(a.warrantyEnd) : undefined, warrantyDetails: a.warrantyDetails,
    };
  }

  /** Updates an asset and records old→new values for every changed field (nothing is silently overwritten). */
  async update(actorId: string, id: string, dto: UpdateAssetDto, meta: ReqMeta) {
    const before = await this.prisma.asset.findUnique({ where: { id }, include: { acquisition: true, specifications: { where: { isCurrent: true } } } });
    if (!before) throw new NotFoundException('Asset not found');
    return this.prisma.$transaction(async (tx) => {
      const data: Prisma.AssetUpdateInput = {};
      const hist: { field: string; oldValue: string | null; newValue: string | null }[] = [];
      const str = (v: unknown) => (v == null ? null : String(v));
      for (const f of TRACKED_FIELDS) {
        const nv = (dto as any)[f];
        if (nv === undefined) continue;
        const ov = (before as any)[f];
        if (str(ov) !== str(nv)) {
          hist.push({ field: f, oldValue: str(ov), newValue: str(nv) });
          if (f === 'responsibleUserId') data.responsibleUser = nv ? { connect: { id: nv } } : { disconnect: true };
          else (data as any)[f] = f === 'serialNumber' ? nv || null : nv;
        }
      }
      // Specifications: versioned. Old value is closed (validTo), new value inserted.
      if (dto.specifications) {
        const cur = new Map(before.specifications.map((s) => [s.key, s]));
        const incoming = new Map(dto.specifications.map((s) => [s.key, s.value]));
        for (const [key, value] of incoming) {
          const old = cur.get(key);
          if (old && old.value === value) continue;
          if (old) await tx.assetSpecification.update({ where: { id: old.id }, data: { isCurrent: false, validTo: new Date() } });
          await tx.assetSpecification.create({ data: { assetId: id, key, value, changedById: actorId } });
          hist.push({ field: `spec:${key}`, oldValue: old?.value ?? null, newValue: value });
        }
        for (const [key, old] of cur) {
          if (incoming.has(key)) continue;
          await tx.assetSpecification.update({ where: { id: old.id }, data: { isCurrent: false, validTo: new Date() } });
          hist.push({ field: `spec:${key}`, oldValue: old.value, newValue: null });
        }
      }
      if (dto.acquisition) {
        const prev = before.acquisition as any;
        for (const f of ACQ_FIELDS) {
          const nv = (dto.acquisition as any)[f];
          if (nv === undefined) continue;
          const ov = prev?.[f];
          const norm = (v: any) => (v instanceof Date ? v.toISOString().slice(0, 10) : v == null ? null : DATE_FIELDS.includes(f) ? String(v).slice(0, 10) : String(v));
          if (norm(ov) !== norm(nv)) hist.push({ field: `acquisition:${f}`, oldValue: norm(ov), newValue: norm(nv) });
        }
        await tx.acquisition.upsert({ where: { assetId: id }, create: { assetId: id, ...this.acqData(dto.acquisition) }, update: this.acqData(dto.acquisition) });
      }
      if (!hist.length && !Object.keys(data).length) return this.prisma.asset.findUniqueOrThrow({ where: { id } });
      const a = await tx.asset.update({ where: { id }, data });
      if (hist.length) await tx.assetHistory.createMany({ data: hist.map((h) => ({ ...h, assetId: id, changedById: actorId })) });
      await this.audit.log(tx, {
        userId: actorId, action: 'Asset updated', module: 'assets', recordId: id, meta,
        previous: Object.fromEntries(hist.map((h) => [h.field, h.oldValue])), next: Object.fromEntries(hist.map((h) => [h.field, h.newValue])),
      });
      return a;
    });
  }

  async move(actorId: string, id: string, dto: MoveAssetDto, meta: ReqMeta) {
    const a = await this.prisma.asset.findUnique({ where: { id } });
    if (!a) throw new NotFoundException('Asset not found');
    if (!(await this.prisma.location.findUnique({ where: { id: dto.locationId } }))) throw new BadRequestException('Unknown location');
    if (a.locationId === dto.locationId) throw new BadRequestException('Asset is already at that location');
    return this.prisma.$transaction(async (tx) => {
      await tx.assetMovement.create({ data: { assetId: id, fromId: a.locationId, toId: dto.locationId, movedById: actorId, reason: dto.reason } });
      const u = await tx.asset.update({ where: { id }, data: { locationId: dto.locationId } });
      await tx.assetHistory.create({ data: { assetId: id, field: 'locationId', oldValue: a.locationId, newValue: dto.locationId, changedById: actorId } });
      await this.audit.log(tx, { userId: actorId, action: 'Asset moved', module: 'assets', recordId: id, previous: { locationId: a.locationId }, next: { locationId: dto.locationId }, meta });
      return u;
    });
  }

  /** Manual status change (retire, dispose, mark missing, …). Workflow-owned statuses are rejected. */
  async setStatus(actorId: string, id: string, dto: SetStatusDto, meta: ReqMeta) {
    const a = await this.prisma.asset.findUnique({ where: { id } });
    if (!a) throw new NotFoundException('Asset not found');
    if (WORKFLOW_ONLY.includes(dto.status)) throw new BadRequestException(`${dto.status} is set automatically by loan, booking and maintenance workflows`);
    if (WORKFLOW_ONLY.includes(a.status) ) throw new ConflictException(`Asset is ${a.status}; finish that workflow before changing status manually`);
    if (dto.status === 'AVAILABLE') await this.assertCanBeAvailable(this.prisma, id);
    return this.prisma.$transaction(async (tx) => {
      const u = await this.changeStatus(tx, actorId, id, dto.status, dto.reason, meta);
      if (dto.status === 'MISSING' || dto.status === 'LOST') {
        await this.notif.notifyRoles(tx, ['ADMIN', 'TECHNICIAN'], 'ASSET_MISSING', 'Asset marked ' + dto.status.toLowerCase(), `${a.assetTag} · ${a.name}`, `/inventory/${id}`);
      }
      return u;
    });
  }

  /** Blocks AVAILABLE if an unverified repair or active loan exists. */
  async assertCanBeAvailable(db: Tx | PrismaService, assetId: string) {
    const openMaint = await db.maintenance.count({ where: { assetId, status: { notIn: ['VERIFIED', 'CLOSED'] } } });
    if (openMaint) throw new ConflictException('Asset has an unfinished repair; it cannot become Available until the repair is verified');
    const activeLoan = await db.loanItem.count({ where: { assetId, loan: { status: 'ISSUED' } } });
    if (activeLoan) throw new ConflictException('Asset is currently on loan');
  }

  /** Shared helper: change status and record history + audit in the caller's transaction. */
  async changeStatus(tx: Tx, actorId: string | null, assetId: string, status: AssetStatus, reason?: string, meta?: ReqMeta, condition?: any) {
    const a = await tx.asset.findUniqueOrThrow({ where: { id: assetId } });
    const data: Prisma.AssetUpdateInput = { status };
    if (condition && condition !== a.condition) data.condition = condition;
    const u = await tx.asset.update({ where: { id: assetId }, data });
    if (a.status !== status) {
      await tx.assetHistory.create({ data: { assetId, field: 'status', oldValue: a.status, newValue: status, changedById: actorId } });
      await this.audit.log(tx, { userId: actorId, action: 'Asset status changed', module: 'assets', recordId: assetId, previous: { status: a.status }, next: { status, reason }, meta });
    }
    if (condition && condition !== a.condition) {
      await tx.assetHistory.create({ data: { assetId, field: 'condition', oldValue: a.condition, newValue: condition, changedById: actorId } });
    }
    return u;
  }

  async archive(actorId: string, id: string, meta: ReqMeta) {
    const a = await this.prisma.asset.findUnique({ where: { id } });
    if (!a) throw new NotFoundException('Asset not found');
    if (['BORROWED', 'RESERVED', 'OVERDUE', 'UNDER_REPAIR', 'UNDER_MAINTENANCE'].includes(a.status)) throw new ConflictException('Asset is in an active workflow');
    return this.prisma.$transaction(async (tx) => {
      const u = await tx.asset.update({ where: { id }, data: { isArchived: true } });
      await tx.assetHistory.create({ data: { assetId: id, field: 'isArchived', oldValue: 'false', newValue: 'true', changedById: actorId } });
      await this.audit.log(tx, { userId: actorId, action: 'Asset archived', module: 'assets', recordId: id, meta });
      return u;
    });
  }

  async qr(idOrTag: string) {
    const a = await this.prisma.asset.findFirst({ where: { OR: [{ id: idOrTag.match(/^[0-9a-f-]{36}$/i) ? idOrTag : undefined }, { assetTag: idOrTag }] }, select: { assetTag: true } });
    if (!a) throw new NotFoundException('Asset not found');
    // QR encodes the asset tag; the app resolves it via /assets/by-tag/:tag (authenticated).
    return { assetTag: a.assetTag, png: await QRCode.toBuffer(a.assetTag, { margin: 2, width: 320 }), dataUrl: await QRCode.toDataURL(a.assetTag, { margin: 2, width: 320 }) };
  }
}
