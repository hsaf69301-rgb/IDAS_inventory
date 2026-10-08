import { createHash } from 'crypto';
import { AuditService } from './audit.service';

function chain(n: number) {
  const rows: any[] = [];
  let prev: string | null = null;
  for (let i = 0; i < n; i++) {
    const createdAt = new Date(Date.UTC(2030, 0, 1, 0, i));
    const row: any = { id: `id${i}`, userId: 'u', action: `A${i}`, module: 'm', recordId: null, previous: null, next: { i }, createdAt, prevHash: prev };
    row.hash = createHash('sha256').update(JSON.stringify({ p: prev, u: 'u', a: row.action, m: 'm', r: null, pv: null, nx: { i }, t: createdAt.toISOString() })).digest('hex');
    prev = row.hash; rows.push(row);
  }
  return rows;
}
const svcWith = (rows: any[]) => new AuditService({ auditLog: { findMany: async () => rows } } as any);

describe('audit hash chain', () => {
  it('verifies an untouched chain', async () => {
    expect(await svcWith(chain(5)).verifyChain()).toEqual({ ok: true, checked: 5 });
  });
  it('detects an edited record', async () => {
    const rows = chain(5); rows[2].next = { i: 999 };
    const r = await svcWith(rows).verifyChain();
    expect(r.ok).toBe(false); expect(r.brokenAt).toBe('id2');
  });
  it('detects a deleted record', async () => {
    const rows = chain(5); rows.splice(2, 1);
    expect((await svcWith(rows).verifyChain()).ok).toBe(false);
  });
});
