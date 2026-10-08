import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BookingStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthUser, ReqMeta } from '../common/decorators';
import { PERMISSIONS } from '../common/permissions';
import { Tx, nextRef, pageParams } from '../common/util';
import { AvailabilityInput, checkAvailability, hhmm, localParts, pickAssets } from './availability';

const include = {
  lecturer: { select: { id: true, fullName: true, email: true } },
  decider: { select: { fullName: true } },
  resources: { include: { asset: { select: { assetTag: true, name: true } } } },
  approvals: { orderBy: { at: 'asc' } },
} satisfies Prisma.LabBookingInclude;

@Injectable()
export class BookingsService {
  constructor(private prisma: PrismaService, private audit: AuditService, private notif: NotificationsService, private cfg: ConfigService) {}

  get tz() { return this.cfg.get('LAB_TIMEZONE') ?? 'Asia/Colombo'; }

  private async setting(key: string, def: string) {
    const s = await this.prisma.setting.findUnique({ where: { key } });
    return s?.value ?? def;
  }

  /** Lab opening hours / days (admin-editable settings). */
  async labHours() {
    return {
      open: await this.setting('app.labOpen', '08:00'),
      close: await this.setting('app.labClose', '18:00'),
      days: (await this.setting('app.labDays', '1,2,3,4,5')).split(',').map(Number),
      timezone: this.tz,
    };
  }

  private async validateWindow(start: Date, end: Date) {
    if (isNaN(+start) || isNaN(+end)) throw new BadRequestException('Invalid date/time');
    if (end <= start) throw new BadRequestException('End time must be after start time');
    if (start.getTime() <= Date.now()) throw new BadRequestException('Bookings must be in the future');
    const h = await this.labHours();
    const s = localParts(start, h.timezone), e = localParts(end, h.timezone);
    if (s.ymd !== e.ymd) throw new BadRequestException('A booking must start and end on the same day');
    if (!h.days.includes(s.weekday)) throw new BadRequestException('The lab is closed on that day');
    if (s.minutes < hhmm(h.open) || e.minutes > hhmm(h.close)) throw new BadRequestException(`Bookings must be within lab hours (${h.open}–${h.close})`);
    return s.ymd;
  }

  private toInput(dto: { startAt: string; endAt: string; computersNeeded?: number; resources?: { categoryId: string; quantity: number }[] }, excludeBookingId?: string): AvailabilityInput {
    return { start: new Date(dto.startAt), end: new Date(dto.endAt), computersNeeded: dto.computersNeeded ?? 0, resources: dto.resources ?? [], excludeBookingId };
  }

  async availability(dto: any) {
    await this.validateWindow(new Date(dto.startAt), new Date(dto.endAt));
    return checkAvailability(this.prisma, this.toInput(dto));
  }

  /** Busy blocks and free windows for one lab-local day. */
  async slots(date: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BadRequestException('date must be YYYY-MM-DD');
    const h = await this.labHours();
    const from = new Date(new Date(`${date}T00:00:00Z`).getTime() - 24 * 3600_000), to = new Date(new Date(`${date}T00:00:00Z`).getTime() + 48 * 3600_000);
    const rows = await this.prisma.labBooking.findMany({ where: { status: { in: ['APPROVED', 'PENDING'] }, startTime: { lt: to }, endTime: { gt: from } }, orderBy: { startTime: 'asc' }, select: { id: true, refNo: true, course: true, status: true, startTime: true, endTime: true } });
    const day = rows.filter((r) => localParts(r.startTime, h.timezone).ymd === date);
    const busy = day.filter((r) => r.status === 'APPROVED').map((r) => ({ start: localParts(r.startTime, h.timezone).minutes, end: localParts(r.endTime, h.timezone).minutes }));
    const free: { start: string; end: string }[] = [];
    let cursor = hhmm(h.open);
    const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    for (const b of busy.sort((a, b) => a.start - b.start)) {
      if (b.start > cursor) free.push({ start: fmt(cursor), end: fmt(b.start) });
      cursor = Math.max(cursor, b.end);
    }
    if (cursor < hhmm(h.close)) free.push({ start: fmt(cursor), end: fmt(hhmm(h.close)) });
    return { date, open: !!h.days.includes(localParts(new Date(`${date}T12:00:00Z`), h.timezone).weekday), hours: h, bookings: day, free };
  }

  async list(user: AuthUser, q: { status?: string; from?: string; to?: string; mine?: string; page?: any; pageSize?: any }) {
    const { page, pageSize, skip, take } = pageParams(q);
    const canAll = user.permissions.includes(PERMISSIONS.BOOKING_DECIDE) || user.permissions.includes(PERMISSIONS.ASSET_WRITE);
    const where: Prisma.LabBookingWhereInput = {
      lecturerId: !canAll || q.mine === 'true' ? user.id : undefined,
      status: (q.status as BookingStatus) || undefined,
      startTime: { gte: q.from ? new Date(q.from) : undefined, lte: q.to ? new Date(q.to) : undefined },
    };
    const [rows, total] = await Promise.all([
      this.prisma.labBooking.findMany({ where, include, orderBy: { startTime: 'desc' }, skip, take }),
      this.prisma.labBooking.count({ where }),
    ]);
    return { rows, total, page, pageSize };
  }

  /** Calendar feed: minimal data (no personal details of other lecturers). */
  async calendar(from: string, to: string) {
    const f = new Date(from), t = new Date(to);
    if (isNaN(+f) || isNaN(+t)) throw new BadRequestException('from/to required');
    const rows = await this.prisma.labBooking.findMany({
      where: { status: { in: ['APPROVED', 'PENDING'] }, startTime: { lt: t }, endTime: { gt: f } }, orderBy: { startTime: 'asc' },
      select: { id: true, refNo: true, course: true, moduleCode: true, status: true, startTime: true, endTime: true, studentCount: true, lecturer: { select: { fullName: true } } },
    });
    return rows;
  }

  async get(user: AuthUser, id: string) {
    const b = await this.prisma.labBooking.findUnique({ where: { id }, include });
    if (!b) throw new NotFoundException('Booking not found');
    const canAll = user.permissions.includes(PERMISSIONS.BOOKING_DECIDE) || user.permissions.includes(PERMISSIONS.ASSET_WRITE);
    if (b.lecturerId !== user.id && !canAll) throw new ForbiddenException();
    const requested = b.resources.filter((r) => !r.reserved && r.categoryId).map((r) => ({ categoryId: r.categoryId!, quantity: r.quantity }));
    const analysis = await checkAvailability(this.prisma, { start: b.startTime, end: b.endTime, computersNeeded: b.computersNeeded, resources: requested, excludeBookingId: b.id });
    const cats = await this.prisma.category.findMany({ where: { id: { in: requested.map((r) => r.categoryId) } }, select: { id: true, name: true } });
    return { ...b, requestedResources: requested.map((r) => ({ ...r, name: cats.find((c) => c.id === r.categoryId)?.name })), analysis };
  }

  async create(user: AuthUser, dto: any, meta: ReqMeta) {
    const date = await this.validateWindow(new Date(dto.startAt), new Date(dto.endAt));
    const input = this.toInput(dto);
    const res = await checkAvailability(this.prisma, input);
    if (!res.ok) {
      const kind = res.conflicts.some((c) => c.type === 'TIME') ? 'Requested slot unavailable' : 'Requested resources unavailable';
      await this.notif.notify(null, [user.id], 'BOOKING_CONFLICT', kind, res.conflicts.map((c) => c.message).join('; '), '/lab-booking');
      throw new ConflictException({ message: kind, conflicts: res.conflicts });
    }
    const profile = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    return this.prisma.$transaction(async (tx) => {
      const refNo = await nextRef(tx, 'BK');
      const b = await tx.labBooking.create({
        data: {
          refNo, lecturerId: user.id, staffId: dto.staffId, department: dto.department, email: profile.email, course: dto.course, moduleCode: dto.moduleCode,
          purpose: dto.purpose, batchYear: dto.batchYear, studentCount: dto.studentCount, date: new Date(date), startTime: input.start, endTime: input.end,
          computersNeeded: dto.computersNeeded ?? 0, software: dto.software, osSpecs: dto.osSpecs, specialRequirements: dto.specialRequirements,
          resources: { create: (dto.resources ?? []).filter((r: any) => r.quantity > 0).map((r: any) => ({ categoryId: r.categoryId, quantity: r.quantity })) },
          approvals: { create: { actorId: user.id, action: 'PENDING', reason: 'Submitted' } },
        },
      });
      await this.audit.log(tx, { userId: user.id, action: 'Booking requested', module: 'bookings', recordId: b.id, next: { refNo, course: dto.course, start: input.start, end: input.end }, meta });
      await this.notif.notifyRoles(tx, ['DEAN_REGISTRAR'], 'BOOKING_REQUESTED', `New lab booking request ${refNo}`, `${user.fullName} – ${dto.course} (${dto.moduleCode}), ${dto.studentCount} students`, '/approvals');
      return b;
    });
  }

  /** Modify own booking. Approved bookings go back to PENDING and need a fresh approval. */
  async update(user: AuthUser, id: string, dto: any, meta: ReqMeta) {
    const b = await this.prisma.labBooking.findUnique({ where: { id } });
    if (!b) throw new NotFoundException('Booking not found');
    if (b.lecturerId !== user.id) throw new ForbiddenException();
    if (!['PENDING', 'APPROVED'].includes(b.status)) throw new ConflictException(`A ${b.status.toLowerCase()} booking cannot be modified`);
    const date = await this.validateWindow(new Date(dto.startAt), new Date(dto.endAt));
    const input = this.toInput(dto, id);
    const res = await checkAvailability(this.prisma, input);
    if (!res.ok) throw new ConflictException({ message: 'Requested slot or resources unavailable', conflicts: res.conflicts });
    return this.prisma.$transaction(async (tx) => {
      await tx.bookingResource.deleteMany({ where: { bookingId: id } }); // derived rows; the audit log keeps the history
      const u = await tx.labBooking.update({
        where: { id },
        data: {
          department: dto.department, staffId: dto.staffId, course: dto.course, moduleCode: dto.moduleCode, purpose: dto.purpose, batchYear: dto.batchYear,
          studentCount: dto.studentCount, date: new Date(date), startTime: input.start, endTime: input.end, computersNeeded: dto.computersNeeded ?? 0,
          software: dto.software, osSpecs: dto.osSpecs, specialRequirements: dto.specialRequirements, status: 'PENDING', deciderId: null, decidedAt: null, rejectionReason: null,
          resources: { create: (dto.resources ?? []).filter((r: any) => r.quantity > 0).map((r: any) => ({ categoryId: r.categoryId, quantity: r.quantity })) },
          approvals: { create: { actorId: user.id, action: 'PENDING', reason: 'Modified – re-submitted for approval' } },
        },
      });
      await this.audit.log(tx, { userId: user.id, action: 'Booking modified', module: 'bookings', recordId: id, previous: { status: b.status, start: b.startTime, end: b.endTime }, next: { status: 'PENDING', start: input.start, end: input.end }, meta });
      await this.notif.notifyRoles(tx, ['DEAN_REGISTRAR'], 'BOOKING_REQUESTED', `Booking ${b.refNo} modified`, `${user.fullName} changed ${dto.course}; approval required again`, '/approvals');
      return u;
    });
  }

  /**
   * Approve/reject. Approval re-checks availability INSIDE a transaction guarded by an advisory lock,
   * reserves concrete assets, and relies on a database exclusion constraint as a last line of defence
   * against double booking.
   */
  async decide(user: AuthUser, id: string, approve: boolean, reason: string | undefined, meta: ReqMeta) {
    const b = await this.prisma.labBooking.findUnique({ where: { id }, include: { resources: true } });
    if (!b) throw new NotFoundException('Booking not found');
    if (b.status !== 'PENDING') throw new ConflictException(`Booking is already ${b.status.toLowerCase()}`);
    if (!approve && !reason?.trim()) throw new BadRequestException('A reason is required when rejecting');
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(7002)`;
      if (approve) {
        const requested = b.resources.filter((r) => !r.reserved && r.categoryId).map((r) => ({ categoryId: r.categoryId!, quantity: r.quantity }));
        const res = await checkAvailability(tx, { start: b.startTime, end: b.endTime, computersNeeded: b.computersNeeded, resources: requested, excludeBookingId: b.id });
        if (!res.ok) throw new ConflictException({ message: 'Cannot approve: conflicts exist', conflicts: res.conflicts });
        for (const r of requested) {
          const ids = await pickAssets(tx, r.categoryId, r.quantity, b.startTime, b.endTime, b.id);
          if (!ids.length) throw new ConflictException({ message: 'Cannot approve: resources no longer available', conflicts: [{ type: 'RESOURCE', message: 'Equipment became unavailable' }] });
          await tx.bookingResource.createMany({ data: ids.map((assetId) => ({ bookingId: b.id, categoryId: r.categoryId, assetId, quantity: 1, reserved: true })) });
        }
      }
      const status: BookingStatus = approve ? 'APPROVED' : 'REJECTED';
      const u = await tx.labBooking.update({
        where: { id }, data: { status, deciderId: user.id, decidedAt: new Date(), rejectionReason: approve ? null : reason, approvals: { create: { actorId: user.id, action: status, reason } } },
      });
      await this.audit.log(tx, { userId: user.id, action: approve ? 'Booking approved' : 'Booking rejected', module: 'bookings', recordId: id, previous: { status: b.status }, next: { status, reason }, meta });
      await this.notif.notify(tx, [b.lecturerId], approve ? 'BOOKING_APPROVED' : 'BOOKING_REJECTED',
        approve ? `Booking ${b.refNo} approved` : `Booking ${b.refNo} rejected`,
        approve ? `${b.course} is confirmed and the lab and equipment are reserved.` : `Reason: ${reason}`, '/lab-booking');
      return u;
    });
  }

  async cancel(user: AuthUser, id: string, reason: string | undefined, meta: ReqMeta) {
    const b = await this.prisma.labBooking.findUnique({ where: { id } });
    if (!b) throw new NotFoundException('Booking not found');
    const privileged = user.permissions.includes(PERMISSIONS.BOOKING_DECIDE);
    if (b.lecturerId !== user.id && !privileged) throw new ForbiddenException();
    if (!['PENDING', 'APPROVED'].includes(b.status)) throw new ConflictException(`A ${b.status.toLowerCase()} booking cannot be cancelled`);
    return this.prisma.$transaction(async (tx) => {
      const u = await tx.labBooking.update({ where: { id }, data: { status: 'CANCELLED', approvals: { create: { actorId: user.id, action: 'CANCELLED', reason } } } });
      await this.audit.log(tx, { userId: user.id, action: 'Booking cancelled', module: 'bookings', recordId: id, previous: { status: b.status }, next: { status: 'CANCELLED', reason }, meta });
      if (b.lecturerId !== user.id) await this.notif.notify(tx, [b.lecturerId], 'BOOKING_CANCELLED', `Booking ${b.refNo} cancelled`, reason ?? 'Cancelled by administration', '/lab-booking');
      else if (b.status === 'APPROVED') await this.notif.notifyRoles(tx, ['DEAN_REGISTRAR'], 'BOOKING_CANCELLED', `Booking ${b.refNo} cancelled`, `${user.fullName} cancelled ${b.course}`, '/approvals');
      return u;
    });
  }

  /** Reservations = concrete equipment held by approved bookings (upcoming/ongoing). */
  async reservations() {
    const rows = await this.prisma.bookingResource.findMany({
      where: { reserved: true, booking: { status: 'APPROVED', endTime: { gt: new Date() } } },
      include: { asset: { select: { id: true, assetTag: true, name: true } }, booking: { select: { id: true, refNo: true, course: true, startTime: true, endTime: true, lecturer: { select: { fullName: true } } } } },
      orderBy: { booking: { startTime: 'asc' } },
    });
    return rows;
  }

  async remindUpcoming(now = new Date()) {
    const soon = new Date(now.getTime() + 24 * 3600_000);
    const rows = await this.prisma.labBooking.findMany({ where: { status: 'APPROVED', startTime: { gte: now, lte: soon } } });
    let sent = 0;
    for (const b of rows) {
      const exists = await this.prisma.notification.count({ where: { userId: b.lecturerId, type: 'BOOKING_UPCOMING', message: { contains: b.refNo } } });
      if (exists) continue;
      await this.notif.notify(null, [b.lecturerId], 'BOOKING_UPCOMING', 'Upcoming lab booking', `${b.refNo} – ${b.course} starts ${b.startTime.toISOString().slice(0, 16).replace('T', ' ')} UTC`, '/lab-booking');
      sent++;
    }
    return { sent };
  }
}
