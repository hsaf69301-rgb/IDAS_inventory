import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Tx } from '../common/util';

export const BOOKING_UNUSABLE = ['RETIRED', 'DISPOSED', 'MISSING', 'LOST', 'DAMAGED', 'UNDER_MAINTENANCE', 'UNDER_REPAIR', 'UNDER_INSPECTION', 'OVERDUE'] as const;
export const COMPUTER_CATEGORY_CODE = 'PC';

export interface Conflict { type: 'TIME' | 'COMPUTERS' | 'RESOURCE' | 'MAINTENANCE'; message: string; ref?: string }
export interface AvailabilityResult {
  ok: boolean;
  conflicts: Conflict[];
  computers: { total: number; free: number; requested: number };
  resources: { categoryId: string; name: string; free: number; requested: number }[];
  overlapping: { id: string; refNo: string; course: string; status: string; lecturer: string; startTime: Date; endTime: Date }[];
}
export interface AvailabilityInput {
  start: Date; end: Date; computersNeeded: number;
  resources: { categoryId: string; quantity: number }[];
  excludeBookingId?: string;
}

type Db = Tx | PrismaService;

/** Assets in the pool for a category: not archived and in a bookable status. */
async function pool(db: Db, categoryId: string) {
  return db.asset.findMany({
    where: { categoryId, isArchived: false, status: { notIn: [...BOOKING_UNUSABLE] } },
    select: { id: true, quantity: true, isConsumable: true },
  });
}

/** Asset ids from `ids` that are committed to loans overlapping [start,end). */
async function loanedIds(db: Db, ids: string[], start: Date, end: Date) {
  if (!ids.length) return new Set<string>();
  const rows = await db.loanItem.findMany({
    where: { assetId: { in: ids }, loan: { status: { in: ['APPROVED', 'ISSUED'] }, requiredFrom: { lt: end }, dueAt: { gt: start } } },
    select: { assetId: true },
  });
  return new Set(rows.map((r) => r.assetId));
}

/** Pure(ish) availability engine used both for live checks and for the transactional re-check on approval. */
export async function checkAvailability(db: Db, input: AvailabilityInput): Promise<AvailabilityResult> {
  const conflicts: Conflict[] = [];
  const excl: Prisma.LabBookingWhereInput = input.excludeBookingId ? { id: { not: input.excludeBookingId } } : {};

  // 1) Time conflicts – the lab is a single room: no two APPROVED bookings may overlap.
  const overlapping = await db.labBooking.findMany({
    where: { ...excl, status: { in: ['APPROVED', 'PENDING'] }, startTime: { lt: input.end }, endTime: { gt: input.start } },
    select: { id: true, refNo: true, course: true, status: true, startTime: true, endTime: true, lecturer: { select: { fullName: true } } },
    orderBy: { startTime: 'asc' },
  });
  for (const b of overlapping.filter((x) => x.status === 'APPROVED')) {
    conflicts.push({ type: 'TIME', message: `The lab is already booked for "${b.course}" (${b.refNo}) during this period`, ref: b.refNo });
  }

  // 2) Computers
  const pcCat = await db.category.findUnique({ where: { code: COMPUTER_CATEGORY_CODE } });
  let total = 0, free = 0;
  if (pcCat) {
    const pcs = await pool(db, pcCat.id);
    const out = await loanedIds(db, pcs.map((p) => p.id), input.start, input.end);
    total = pcs.length; free = pcs.filter((p) => !out.has(p.id)).length;
    if (input.computersNeeded > free) {
      const inMaint = await db.maintenance.count({ where: { status: { notIn: ['CLOSED', 'VERIFIED'] }, asset: { categoryId: pcCat.id } } });
      conflicts.push({ type: 'COMPUTERS', message: `Only ${free} computer(s) available but ${input.computersNeeded} requested` });
      if (inMaint) conflicts.push({ type: 'MAINTENANCE', message: `${inMaint} computer(s) are currently under maintenance/repair` });
    }
  }

  // 3) Other equipment, by category
  const resources: AvailabilityResult['resources'] = [];
  for (const r of input.resources.filter((x) => x.quantity > 0)) {
    const cat = await db.category.findUnique({ where: { id: r.categoryId } });
    if (!cat) { conflicts.push({ type: 'RESOURCE', message: 'Unknown equipment category requested' }); continue; }
    const items = await pool(db, cat.id);
    const loaned = await loanedIds(db, items.map((i) => i.id), input.start, input.end);
    const reserved = await db.bookingResource.findMany({
      where: { reserved: true, assetId: { in: items.map((i) => i.id) }, booking: { ...excl, status: 'APPROVED', startTime: { lt: input.end }, endTime: { gt: input.start } } },
      select: { assetId: true, quantity: true },
    });
    const reservedIds = new Set(reserved.map((x) => x.assetId!));
    const freeCount = items.filter((i) => !loaned.has(i.id) && !reservedIds.has(i.id)).reduce((n, i) => n + (i.isConsumable ? i.quantity : 1), 0);
    resources.push({ categoryId: cat.id, name: cat.name, free: freeCount, requested: r.quantity });
    if (r.quantity > freeCount) {
      const inMaint = await db.maintenance.count({ where: { status: { notIn: ['CLOSED', 'VERIFIED'] }, asset: { categoryId: cat.id } } });
      conflicts.push({ type: 'RESOURCE', message: `${cat.name}: ${freeCount} available, ${r.quantity} requested` });
      if (inMaint) conflicts.push({ type: 'MAINTENANCE', message: `${cat.name}: ${inMaint} unit(s) under maintenance/repair` });
    }
  }

  return {
    ok: conflicts.length === 0, conflicts,
    computers: { total, free, requested: input.computersNeeded },
    resources,
    overlapping: overlapping.map((o) => ({ id: o.id, refNo: o.refNo, course: o.course, status: o.status, lecturer: o.lecturer.fullName, startTime: o.startTime, endTime: o.endTime })),
  };
}

/** Pick concrete assets for a category request so they can be reserved on approval. */
export async function pickAssets(db: Tx, categoryId: string, quantity: number, start: Date, end: Date, excludeBookingId: string): Promise<string[]> {
  const items = await pool(db, categoryId);
  const loaned = await loanedIds(db, items.map((i) => i.id), start, end);
  const reserved = await db.bookingResource.findMany({
    where: { reserved: true, assetId: { in: items.map((i) => i.id) }, booking: { id: { not: excludeBookingId }, status: 'APPROVED', startTime: { lt: end }, endTime: { gt: start } } },
    select: { assetId: true },
  });
  const taken = new Set(reserved.map((r) => r.assetId!));
  const picked: string[] = [];
  let remaining = quantity;
  for (const i of items) {
    if (remaining <= 0) break;
    if (loaned.has(i.id) || taken.has(i.id)) continue;
    picked.push(i.id);
    remaining -= i.isConsumable ? i.quantity : 1;
  }
  return picked;
}

// ── time helpers (lab-local time) ──
export function localParts(d: Date, tz: string) {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return { ymd: `${p.year}-${p.month}-${p.day}`, minutes: parseInt(p.hour, 10) * 60 + parseInt(p.minute, 10), weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday) };
}
export const hhmm = (s: string) => { const [h, m] = s.split(':').map(Number); return h * 60 + (m || 0); };
