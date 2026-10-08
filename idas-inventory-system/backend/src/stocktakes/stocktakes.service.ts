import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { StocktakeResult } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AssetsService } from '../assets/assets.service';
import { ReqMeta } from '../common/decorators';
import { nextRef } from '../common/util';

@Injectable()
export class StocktakesService {
  constructor(private prisma: PrismaService, private audit: AuditService, private assets: AssetsService, private notif: NotificationsService) {}

  list() {
    return this.prisma.stocktake.findMany({ orderBy: { startedAt: 'desc' }, include: { startedBy: { select: { fullName: true } }, _count: { select: { items: true } } } });
  }

  async summary(id: string) {
    const groups = await this.prisma.stocktakeItem.groupBy({ by: ['result'], where: { stocktakeId: id }, _count: true });
    const s: Record<string, number> = { VERIFIED: 0, NOT_FOUND: 0, WRONG_LOCATION: 0, DAMAGED: 0, NEEDS_INSPECTION: 0, UNCHECKED: 0 };
    for (const g of groups) s[g.result ?? 'UNCHECKED'] = g._count;
    return s;
  }

  async get(id: string) {
    const st = await this.prisma.stocktake.findUnique({
      where: { id },
      include: { startedBy: { select: { fullName: true } }, items: { include: { asset: { select: { id: true, assetTag: true, name: true, status: true, location: { select: { name: true } } } } }, orderBy: { asset: { assetTag: 'asc' } } } },
    });
    if (!st) throw new NotFoundException('Stocktake not found');
    return { ...st, summary: await this.summary(id) };
  }

  /** Snapshot: one line per in-scope asset. Scope = chosen location and its descendants (or everything). */
  async start(actorId: string, dto: { title: string; locationId?: string }, meta: ReqMeta) {
    let locationIds: string[] | undefined;
    if (dto.locationId) {
      const all = await this.prisma.location.findMany({ select: { id: true, parentId: true } });
      const ids = new Set([dto.locationId]);
      let grew = true;
      while (grew) { grew = false; for (const l of all) if (l.parentId && ids.has(l.parentId) && !ids.has(l.id)) { ids.add(l.id); grew = true; } }
      locationIds = [...ids];
    }
    const assets = await this.prisma.asset.findMany({ where: { isArchived: false, status: { notIn: ['DISPOSED', 'RETIRED'] }, locationId: locationIds ? { in: locationIds } : undefined }, select: { id: true } });
    if (!assets.length) throw new BadRequestException('No assets in scope for this stocktake');
    return this.prisma.$transaction(async (tx) => {
      const refNo = await nextRef(tx, 'ST');
      const st = await tx.stocktake.create({ data: { refNo, title: dto.title, locationId: dto.locationId, startedById: actorId, items: { create: assets.map((a) => ({ assetId: a.id })) } } });
      await this.audit.log(tx, { userId: actorId, action: 'Stocktake started', module: 'stocktakes', recordId: st.id, next: { refNo, items: assets.length }, meta });
      return st;
    });
  }

  async check(actorId: string, id: string, dto: { assetId?: string; assetTag?: string; result: StocktakeResult; note?: string }, meta: ReqMeta) {
    const st = await this.prisma.stocktake.findUnique({ where: { id } });
    if (!st) throw new NotFoundException('Stocktake not found');
    if (st.status !== 'OPEN') throw new ConflictException('Stocktake is completed');
    const asset = await this.prisma.asset.findFirst({ where: dto.assetId ? { id: dto.assetId } : { assetTag: dto.assetTag } });
    if (!asset) throw new NotFoundException('Asset not found');
    const item = await this.prisma.stocktakeItem.findUnique({ where: { stocktakeId_assetId: { stocktakeId: id, assetId: asset.id } } });
    if (!item) throw new BadRequestException('Asset is not part of this stocktake');
    return this.prisma.$transaction(async (tx) => {
      const u = await tx.stocktakeItem.update({ where: { id: item.id }, data: { result: dto.result, note: dto.note, checkedAt: new Date() } });
      await this.audit.log(tx, { userId: actorId, action: 'Stocktake item checked', module: 'stocktakes', recordId: id, next: { asset: asset.assetTag, result: dto.result }, meta });
      return u;
    });
  }

  /** Completing applies consequences: Not Found → missing report, Damaged/Needs Inspection → status update. */
  async complete(actorId: string, id: string, meta: ReqMeta) {
    const st = await this.prisma.stocktake.findUnique({ where: { id }, include: { items: { include: { asset: true } } } });
    if (!st) throw new NotFoundException('Stocktake not found');
    if (st.status !== 'OPEN') throw new ConflictException('Already completed');
    return this.prisma.$transaction(async (tx) => {
      for (const it of st.items) {
        const a = it.asset;
        if (it.result === 'NOT_FOUND' && !['MISSING', 'LOST'].includes(a.status)) {
          const refNo = await nextRef(tx, 'LS');
          await tx.lostReport.create({ data: { refNo, assetId: a.id, reporterId: actorId, lastKnownLocation: a.locationId ?? undefined, investigation: `Not found during stocktake ${st.refNo}`, notes: it.note } });
          await this.assets.changeStatus(tx, actorId, a.id, 'MISSING', `Stocktake ${st.refNo}: not found`, meta);
          await this.notif.notifyRoles(tx, ['ADMIN', 'TECHNICIAN'], 'ASSET_MISSING', `Missing after stocktake: ${a.assetTag}`, a.name, '/damage');
        } else if (it.result === 'NEEDS_INSPECTION' && a.status === 'AVAILABLE') {
          await this.assets.changeStatus(tx, actorId, a.id, 'UNDER_INSPECTION', `Stocktake ${st.refNo}: needs inspection`, meta);
        } else if (it.result === 'DAMAGED' && a.status === 'AVAILABLE') {
          await this.assets.changeStatus(tx, actorId, a.id, 'DAMAGED', `Stocktake ${st.refNo}: damaged`, meta, 'DAMAGED');
        }
      }
      const u = await tx.stocktake.update({ where: { id }, data: { status: 'COMPLETED', completedAt: new Date() } });
      await this.audit.log(tx, { userId: actorId, action: 'Stocktake completed', module: 'stocktakes', recordId: id, meta });
      return u;
    });
  }
}
