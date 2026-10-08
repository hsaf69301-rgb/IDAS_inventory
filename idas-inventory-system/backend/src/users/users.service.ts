import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RoleName } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ReqMeta } from '../common/decorators';
import { pageParams } from '../common/util';

const safe = {
  id: true, email: true, fullName: true, universityId: true, phone: true, isActive: true, createdAt: true,
  role: { select: { name: true, label: true } }, department: { select: { id: true, name: true } },
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService, private audit: AuditService, private notif: NotificationsService) {}

  async list(q: { search?: string; role?: string; active?: string; page?: any; pageSize?: any }) {
    const { page, pageSize, skip, take } = pageParams(q);
    const where: Prisma.UserWhereInput = {
      role: q.role ? { name: q.role as RoleName } : undefined,
      isActive: q.active === undefined || q.active === '' ? undefined : q.active === 'true',
      OR: q.search ? [
        { fullName: { contains: q.search, mode: 'insensitive' } },
        { email: { contains: q.search, mode: 'insensitive' } },
        { universityId: { contains: q.search, mode: 'insensitive' } },
      ] : undefined,
    };
    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({ where, select: safe, orderBy: { fullName: 'asc' }, skip, take }),
      this.prisma.user.count({ where }),
    ]);
    return { rows, total, page, pageSize };
  }

  async get(id: string) {
    const u = await this.prisma.user.findUnique({ where: { id }, select: safe });
    if (!u) throw new NotFoundException('User not found');
    const [loans, bookings, notifications, history] = await Promise.all([
      this.prisma.loanRequest.findMany({ where: { requesterId: id }, orderBy: { createdAt: 'desc' }, take: 20, include: { items: { include: { asset: { select: { assetTag: true, name: true } } } } } }),
      this.prisma.labBooking.findMany({ where: { lecturerId: id }, orderBy: { startTime: 'desc' }, take: 20 }),
      this.prisma.notification.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 20 }),
      this.prisma.auditLog.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 30, select: { id: true, action: true, module: true, createdAt: true } }),
    ]);
    return { ...u, loans, bookings, notifications, history };
  }

  async create(actorId: string, dto: any, meta: ReqMeta) {
    const role = await this.prisma.role.findUnique({ where: { name: dto.role } });
    if (!role) throw new BadRequestException('Unknown role');
    const email = dto.email.trim().toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) throw new ConflictException('Email already in use');
    return this.prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          email, fullName: dto.fullName, universityId: dto.universityId || null, phone: dto.phone || null,
          roleId: role.id, departmentId: dto.departmentId || null, passwordHash: await bcrypt.hash(dto.password, 12),
        }, select: safe,
      });
      await this.audit.log(tx, { userId: actorId, action: 'User created', module: 'users', recordId: u.id, next: { email, role: dto.role }, meta });
      return u;
    });
  }

  async update(actorId: string, id: string, dto: any, meta: ReqMeta) {
    const before = await this.prisma.user.findUnique({ where: { id }, include: { role: true } });
    if (!before) throw new NotFoundException('User not found');
    if (dto.isActive === false && id === actorId) throw new BadRequestException('You cannot deactivate your own account');
    const data: Prisma.UserUpdateInput = {};
    if (dto.fullName !== undefined) data.fullName = dto.fullName;
    if (dto.phone !== undefined) data.phone = dto.phone || null;
    if (dto.universityId !== undefined) data.universityId = dto.universityId || null;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.departmentId !== undefined) data.department = dto.departmentId ? { connect: { id: dto.departmentId } } : { disconnect: true };
    let roleChanged = false;
    if (dto.role && dto.role !== before.role.name) {
      const role = await this.prisma.role.findUnique({ where: { name: dto.role } });
      if (!role) throw new BadRequestException('Unknown role');
      if (id === actorId) throw new BadRequestException('You cannot change your own role');
      data.role = { connect: { id: role.id } }; roleChanged = true;
    }
    if (dto.password) data.passwordHash = await bcrypt.hash(dto.password, 12);
    return this.prisma.$transaction(async (tx) => {
      const u = await tx.user.update({ where: { id }, data, select: safe });
      if (dto.isActive === false) await tx.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit.log(tx, {
        userId: actorId, module: 'users', recordId: id, meta,
        action: roleChanged ? 'Permission changed (role)' : dto.isActive !== undefined && dto.isActive !== before.isActive ? (dto.isActive ? 'User activated' : 'User deactivated') : 'User updated',
        previous: { fullName: before.fullName, role: before.role.name, isActive: before.isActive },
        next: { fullName: u.fullName, role: u.role.name, isActive: u.isActive },
      });
      return u;
    });
  }
}
