import { Injectable } from '@nestjs/common';
import { NotificationType, RoleName } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Tx } from '../common/util';

/**
 * In-app notifications. `emailedAt` and the `deliver()` hook are the extension point for
 * adding an email (SMTP) channel later without touching callers.
 */
@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  async notify(tx: Tx | null, userIds: string[], type: NotificationType, title: string, message: string, link?: string) {
    const db = tx ?? this.prisma;
    const ids = [...new Set(userIds)];
    if (!ids.length) return;
    await db.notification.createMany({ data: ids.map((userId) => ({ userId, type, title, message, link })) });
  }

  async notifyRoles(tx: Tx | null, roles: RoleName[], type: NotificationType, title: string, message: string, link?: string) {
    const db = tx ?? this.prisma;
    const users = await db.user.findMany({ where: { isActive: true, role: { name: { in: roles } } }, select: { id: true } });
    await this.notify(tx, users.map((u) => u.id), type, title, message, link);
  }

  list(userId: string, unreadOnly = false) {
    return this.prisma.notification.findMany({
      where: { userId, readAt: unreadOnly ? null : undefined },
      orderBy: { createdAt: 'desc' }, take: 100,
    });
  }
  unreadCount(userId: string) { return this.prisma.notification.count({ where: { userId, readAt: null } }); }
  markRead(userId: string, id: string) {
    return this.prisma.notification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: new Date() } });
  }
  markAllRead(userId: string) {
    return this.prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
  }
}
