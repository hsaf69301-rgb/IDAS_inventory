import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { LoansService } from '../loans/loans.service';
import { BookingsService } from '../bookings/bookings.service';

/** Scheduled housekeeping: overdue flagging, reminders, warranty alerts. Disabled when DISABLE_JOBS=true. */
@Injectable()
export class JobsService {
  private log = new Logger('Jobs');
  constructor(private prisma: PrismaService, private notif: NotificationsService, private loans: LoansService, private bookings: BookingsService) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async frequent() {
    if (process.env.DISABLE_JOBS === 'true') return;
    try {
      const o = await this.loans.markOverdue();
      const d = await this.loans.remindDueSoon();
      const b = await this.bookings.remindUpcoming();
      if (o.flagged || d.sent || b.sent) this.log.log(`overdue=${o.flagged} dueReminders=${d.sent} bookingReminders=${b.sent}`);
    } catch (e) { this.log.error((e as Error).message); }
  }

  @Cron(CronExpression.EVERY_DAY_AT_7AM)
  async daily() {
    if (process.env.DISABLE_JOBS === 'true') return;
    try { await this.warrantyAlerts(); } catch (e) { this.log.error((e as Error).message); }
  }

  async warrantyAlerts(days = 30) {
    const soon = new Date(Date.now() + days * 86400_000);
    const rows = await this.prisma.acquisition.findMany({ where: { warrantyEnd: { gte: new Date(), lte: soon }, asset: { isArchived: false } }, include: { asset: true } });
    let sent = 0;
    for (const r of rows) {
      const exists = await this.prisma.notification.count({ where: { type: 'WARRANTY_EXPIRY', message: { contains: r.asset.assetTag } } });
      if (exists) continue;
      await this.notif.notifyRoles(null, ['ADMIN', 'TECHNICIAN'], 'WARRANTY_EXPIRY', 'Warranty expiring soon', `${r.asset.assetTag} · ${r.asset.name} – warranty ends ${r.warrantyEnd!.toISOString().slice(0, 10)}`, `/inventory/${r.asset.id}`);
      sent++;
    }
    return { sent };
  }
}
