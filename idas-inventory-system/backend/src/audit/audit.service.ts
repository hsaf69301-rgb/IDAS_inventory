import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Tx, pageParams } from '../common/util';
import { ReqMeta } from '../common/decorators';

export interface AuditEntry {
  userId?: string | null;
  action: string;
  module: string;
  recordId?: string | null;
  previous?: unknown;
  next?: unknown;
  meta?: ReqMeta;
}

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  /**
   * Append-only, hash-chained audit entry. Pass the caller's transaction so the audit row
   * commits (or rolls back) together with the business change.
   * Database triggers (see migration) additionally forbid UPDATE/DELETE on "AuditLog".
   */
  async log(tx: Tx | null, e: AuditEntry) {
    const run = async (t: Tx) => {
      await t.$executeRaw`SELECT pg_advisory_xact_lock(7001)`;
      const last = await t.auditLog.findFirst({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { hash: true } });
      const createdAt = new Date();
      const payload = JSON.stringify({
        p: last?.hash ?? null, u: e.userId ?? null, a: e.action, m: e.module, r: e.recordId ?? null,
        pv: e.previous ?? null, nx: e.next ?? null, t: createdAt.toISOString(),
      });
      const hash = createHash('sha256').update(payload).digest('hex');
      return t.auditLog.create({
        data: {
          userId: e.userId ?? null, action: e.action, module: e.module, recordId: e.recordId ?? null,
          previous: (e.previous ?? undefined) as Prisma.InputJsonValue | undefined,
          next: (e.next ?? undefined) as Prisma.InputJsonValue | undefined,
          ip: e.meta?.ip, userAgent: e.meta?.userAgent?.slice(0, 250),
          createdAt, prevHash: last?.hash ?? null, hash,
        },
      });
    };
    if (tx) return run(tx);
    return this.prisma.$transaction((t) => run(t));
  }

  async list(q: { module?: string; action?: string; userId?: string; from?: string; to?: string; page?: any; pageSize?: any }) {
    const { page, pageSize, skip, take } = pageParams(q);
    const where: Prisma.AuditLogWhereInput = {
      module: q.module || undefined,
      action: q.action ? { contains: q.action, mode: 'insensitive' } : undefined,
      userId: q.userId || undefined,
      createdAt: { gte: q.from ? new Date(q.from) : undefined, lte: q.to ? new Date(q.to) : undefined },
    };
    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take, include: { user: { select: { fullName: true, email: true } } } }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { rows, total, page, pageSize };
  }

  /** Recomputes the hash chain to detect tampering. */
  async verifyChain(): Promise<{ ok: boolean; checked: number; brokenAt?: string }> {
    const rows = await this.prisma.auditLog.findMany({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
    let prev: string | null = null;
    for (const r of rows) {
      const payload = JSON.stringify({
        p: prev, u: r.userId ?? null, a: r.action, m: r.module, r: r.recordId ?? null,
        pv: r.previous ?? null, nx: r.next ?? null, t: r.createdAt.toISOString(),
      });
      const h = createHash('sha256').update(payload).digest('hex');
      if (h !== r.hash || (r.prevHash ?? null) !== prev) return { ok: false, checked: rows.length, brokenAt: r.id };
      prev = r.hash;
    }
    return { ok: true, checked: rows.length };
  }
}
