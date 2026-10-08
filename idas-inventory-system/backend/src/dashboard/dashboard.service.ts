import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async overview() {
    const now = new Date();
    const in7 = new Date(now.getTime() + 7 * 86400_000);
    const in60 = new Date(now.getTime() + 60 * 86400_000);
    const [byStatus, overdueLoans, pendingRequests, pendingBookings, upcoming, openMaint, urgentMaint, warranty, reserved, activity, totalAssets] = await Promise.all([
      this.prisma.asset.groupBy({ by: ['status'], where: { isArchived: false }, _count: true }),
      this.prisma.loanRequest.count({ where: { status: 'ISSUED', dueAt: { lt: now } } }),
      this.prisma.loanRequest.count({ where: { status: 'PENDING' } }),
      this.prisma.labBooking.count({ where: { status: 'PENDING' } }),
      this.prisma.labBooking.findMany({ where: { status: 'APPROVED', startTime: { gte: now, lte: in7 } }, orderBy: { startTime: 'asc' }, take: 8, select: { id: true, refNo: true, course: true, startTime: true, endTime: true, lecturer: { select: { fullName: true } } } }),
      this.prisma.maintenance.count({ where: { status: { notIn: ['CLOSED', 'VERIFIED'] } } }),
      this.prisma.maintenance.findMany({ where: { status: { notIn: ['CLOSED', 'VERIFIED'] }, priority: { in: ['HIGH', 'CRITICAL'] } }, take: 5, orderBy: { reportedAt: 'asc' }, select: { id: true, refNo: true, problem: true, priority: true, status: true, asset: { select: { assetTag: true } } } }),
      this.prisma.acquisition.findMany({ where: { warrantyEnd: { not: null, lte: in60 }, asset: { isArchived: false } }, take: 8, orderBy: { warrantyEnd: 'asc' }, select: { warrantyEnd: true, asset: { select: { id: true, assetTag: true, name: true } } } }),
      this.prisma.bookingResource.findMany({ where: { reserved: true, booking: { status: 'APPROVED', endTime: { gt: now } } }, distinct: ['assetId'], select: { assetId: true } }),
      this.prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 8, select: { id: true, action: true, module: true, createdAt: true, user: { select: { fullName: true } } } }),
      this.prisma.asset.count({ where: { isArchived: false } }),
    ]);
    const s = (k: string) => byStatus.find((x) => x.status === k)?._count ?? 0;
    return {
      stats: {
        totalAssets, available: s('AVAILABLE'), borrowed: s('BORROWED') + s('OVERDUE'), reserved: reserved.length,
        underRepair: s('UNDER_REPAIR') + s('UNDER_MAINTENANCE'), damaged: s('DAMAGED'), missing: s('MISSING') + s('LOST'),
        overdueLoans, pendingRequests, pendingBookings, upcomingBookings: upcoming.length, maintenanceAlerts: openMaint, warrantyAlerts: warranty.length,
      },
      byStatus: byStatus.map((x) => ({ status: x.status, count: x._count })),
      upcoming, urgentMaintenance: urgentMaint,
      warranty: warranty.map((w) => ({ ...w.asset, warrantyEnd: w.warrantyEnd, expired: w.warrantyEnd! < now })),
      activity,
    };
  }

  async mine(userId: string) {
    const now = new Date();
    const [loans, bookings, unread, pendingLoans] = await Promise.all([
      this.prisma.loanRequest.findMany({ where: { requesterId: userId, status: { in: ['PENDING', 'APPROVED', 'ISSUED'] } }, orderBy: { dueAt: 'asc' }, include: { items: { include: { asset: { select: { assetTag: true, name: true } } } } } }),
      this.prisma.labBooking.findMany({ where: { lecturerId: userId, endTime: { gte: now }, status: { in: ['PENDING', 'APPROVED'] } }, orderBy: { startTime: 'asc' }, take: 10 }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
      this.prisma.loanRequest.count({ where: { requesterId: userId, status: 'PENDING' } }),
    ]);
    return { loans: loans.map((l) => ({ ...l, isOverdue: l.status === 'ISSUED' && l.dueAt < now })), bookings, unreadNotifications: unread, pendingLoans };
  }
}
