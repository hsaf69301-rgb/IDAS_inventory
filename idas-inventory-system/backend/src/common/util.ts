import { Prisma } from '@prisma/client';

export type Tx = Prisma.TransactionClient;

/** Sequential reference numbers (LN-0001). Serialised per prefix with a transaction-level advisory lock. */
export async function nextRef(tx: Tx, prefix: string): Promise<string> {
  const key = `seq:${prefix.replace(/[^A-Za-z0-9]/g, '')}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
  const row = await tx.setting.findUnique({ where: { key } });
  const n = (row ? parseInt(row.value, 10) : 0) + 1;
  await tx.setting.upsert({ where: { key }, create: { key, value: String(n) }, update: { value: String(n) } });
  return `${prefix}-${String(n).padStart(4, '0')}`;
}

export function pageParams(q: { page?: any; pageSize?: any }) {
  const page = Math.max(1, parseInt(q.page ?? '1', 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(q.pageSize ?? '20', 10) || 20));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export const toNum = (d: Prisma.Decimal | null | undefined) => (d == null ? null : Number(d));
