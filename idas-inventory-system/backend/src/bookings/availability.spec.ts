import { checkAvailability, hhmm, localParts } from './availability';

const T = (h: number) => new Date(Date.UTC(2030, 0, 7, h, 0)); // Monday

/** Minimal in-memory stand-in for the Prisma client used by the availability engine. */
function fakeDb(o: { approved?: any[]; pending?: any[]; pcs?: number; projectors?: number; loanedPcs?: number; maint?: number }) {
  const pcs = Array.from({ length: o.pcs ?? 0 }, (_, i) => ({ id: `pc${i}`, quantity: 1, isConsumable: false }));
  const projs = Array.from({ length: o.projectors ?? 0 }, (_, i) => ({ id: `pj${i}`, quantity: 1, isConsumable: false }));
  return {
    labBooking: { findMany: async () => [...(o.approved ?? []), ...(o.pending ?? [])] },
    category: { findUnique: async ({ where }: any) => (where.code === 'PC' ? { id: 'cat-pc', name: 'Desktop' } : where.id === 'cat-proj' ? { id: 'cat-proj', name: 'Projector' } : null) },
    asset: { findMany: async ({ where }: any) => (where.categoryId === 'cat-pc' ? pcs : projs) },
    loanItem: { findMany: async ({ where }: any) => where.assetId.in.filter((id: string) => id.startsWith('pc')).slice(0, o.loanedPcs ?? 0).map((assetId: string) => ({ assetId })) },
    bookingResource: { findMany: async () => [] },
    maintenance: { count: async () => o.maint ?? 0 },
  } as any;
}
const booking = (status: string) => ({ id: 'b1', refNo: 'BK-0001', course: 'IT 2103', status, startTime: T(4), endTime: T(6), lecturer: { fullName: 'Dr. A' } });

describe('availability engine', () => {
  it('passes when the lab is free and capacity is sufficient', async () => {
    const r = await checkAvailability(fakeDb({ pcs: 24 }), { start: T(4), end: T(6), computersNeeded: 20, resources: [] });
    expect(r.ok).toBe(true);
    expect(r.computers).toMatchObject({ total: 24, free: 24 });
  });
  it('flags a TIME conflict with an approved booking (double-booking prevention)', async () => {
    const r = await checkAvailability(fakeDb({ pcs: 24, approved: [booking('APPROVED')] }), { start: T(5), end: T(7), computersNeeded: 1, resources: [] });
    expect(r.ok).toBe(false);
    expect(r.conflicts[0]).toMatchObject({ type: 'TIME', ref: 'BK-0001' });
  });
  it('pending bookings are shown as overlaps but do not block', async () => {
    const r = await checkAvailability(fakeDb({ pcs: 24, pending: [booking('PENDING')] }), { start: T(5), end: T(7), computersNeeded: 1, resources: [] });
    expect(r.ok).toBe(true);
    expect(r.overlapping).toHaveLength(1);
  });
  it('flags a COMPUTERS shortage and reports maintenance as a cause', async () => {
    const r = await checkAvailability(fakeDb({ pcs: 24, loanedPcs: 6, maint: 2 }), { start: T(4), end: T(6), computersNeeded: 20, resources: [] });
    expect(r.ok).toBe(false);
    expect(r.computers.free).toBe(18);
    expect(r.conflicts.map((c) => c.type)).toEqual(['COMPUTERS', 'MAINTENANCE']);
  });
  it('flags a RESOURCE shortage', async () => {
    const r = await checkAvailability(fakeDb({ pcs: 24, projectors: 1 }), { start: T(4), end: T(6), computersNeeded: 0, resources: [{ categoryId: 'cat-proj', quantity: 2 }] });
    expect(r.ok).toBe(false);
    expect(r.conflicts[0]).toMatchObject({ type: 'RESOURCE' });
    expect(r.resources[0]).toMatchObject({ free: 1, requested: 2 });
  });
});

describe('lab-local time helpers', () => {
  it('converts UTC to Asia/Colombo (UTC+5:30)', () => {
    const p = localParts(new Date('2030-01-07T04:30:00Z'), 'Asia/Colombo');
    expect(p.ymd).toBe('2030-01-07');
    expect(p.minutes).toBe(10 * 60);
    expect(p.weekday).toBe(1);
  });
  it('rolls the date over for late UTC times', () => {
    expect(localParts(new Date('2030-01-07T20:00:00Z'), 'Asia/Colombo').ymd).toBe('2030-01-08');
  });
  it('parses HH:mm', () => { expect(hhmm('08:30')).toBe(510); });
});
