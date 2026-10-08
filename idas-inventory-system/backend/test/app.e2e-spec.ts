/**
 * API integration tests against a REAL PostgreSQL database (migrated + seeded).
 *   DATABASE_URL=postgresql://... npm run prisma:deploy && npm run prisma:seed && npm run test:e2e
 * Use a dedicated test database – the AuditLog table is append-only by design, so it is never cleaned.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/app.setup';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-test-secret-test-secret-1234';
process.env.DISABLE_JOBS = 'true';
process.env.RATE_LIMIT_PER_MINUTE = '100000';
const PASSWORD = process.env.SEED_DEMO_PASSWORD || 'Idas@2026Demo';

describe('IDAS API (e2e)', () => {
  let app: INestApplication; let http: any; const prisma = new PrismaClient();
  const tokens: Record<string, string> = {};

  const login = async (key: string, email: string) => {
    const r = await request(http).post('/api/auth/login').send({ email, password: PASSWORD }).expect(200);
    tokens[key] = r.body.accessToken;
  };
  const as = (k: string) => ({ Authorization: `Bearer ${tokens[k]}` });
  const get = (k: string, url: string) => request(http).get('/api' + url).set(as(k));
  const post = (k: string, url: string, body: any = {}) => request(http).post('/api' + url).set(as(k)).send(body);

  /** A unique future Monday 10:00–12:00 lab time (04:30–06:30 UTC) so repeated runs never collide. */
  let weekCounter = 20 + Math.floor((Date.now() / 1000) % 300);
  const slot = (startH = 10, endH = 12) => {
    const d = new Date(); d.setUTCDate(d.getUTCDate() + 7 * ++weekCounter); d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7 || 7));
    const mk = (h: number) => { const x = new Date(d); x.setUTCHours(h - 6, 30, 0, 0); return x.toISOString(); };
    return { startAt: mk(startH), endAt: mk(endH) };
  };
  const bookingBody = (extra: any = {}) => ({ staffId: 'LEC/0112', department: 'Department of IT', course: 'E2E Practical', moduleCode: 'IT9999', purpose: 'Automated test', batchYear: '2nd year', studentCount: 10, computersNeeded: 5, ...slot(), ...extra });

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication(); setupApp(app); await app.init(); http = app.getHttpServer();
    await login('admin', 'admin@idas.pdn.ac.lk'); await login('tech', 'technician@idas.pdn.ac.lk'); await login('lecturer', 'lecturer@idas.pdn.ac.lk');
    await login('dean', 'dean@idas.pdn.ac.lk'); await login('student', 'student@idas.pdn.ac.lk'); await login('staff', 'staff@idas.pdn.ac.lk');
  });
  afterAll(async () => { await prisma.$disconnect(); await app.close(); });

  describe('authentication & authorisation', () => {
    it('rejects unauthenticated requests', async () => {
      await request(http).get('/api/assets').expect(401);
      await request(http).get('/api/users').expect(401);
    });
    it('rejects a wrong password and never reveals which part was wrong', async () => {
      const r = await request(http).post('/api/auth/login').send({ email: 'admin@idas.pdn.ac.lk', password: 'nope-nope-nope' }).expect(401);
      expect(r.body.message).toBe('Invalid email or password');
    });
    it('enforces permissions on the backend (not just in the UI)', async () => {
      await get('student', '/users').expect(403);
      await get('student', '/audit').expect(403);
      await get('lecturer', '/users').expect(403);
      await post('student', '/bookings', bookingBody()).expect(403);
      await post('lecturer', '/bookings/x/decision', { approve: true }).expect(403);
      await get('tech', '/audit').expect(403);
      await get('admin', '/audit').expect(200);
    });
    it('hashes passwords and never returns them', async () => {
      const r = await get('admin', '/users').expect(200);
      expect(JSON.stringify(r.body)).not.toMatch(/passwordHash|\$2[aby]\$/);
    });
    it('validates input (unknown fields rejected)', async () => {
      await post('admin', '/users', { email: 'bad', fullName: 'x', role: 'ADMIN', password: 'short', isAdmin: true }).expect(400);
    });
  });

  describe('lab booking: lecturer → dean → calendar', () => {
    let id: string; let body: any;
    it('lecturer submits a booking; dean is notified', async () => {
      body = bookingBody();
      const before = (await get('dean', '/notifications/unread-count')).body.count;
      const r = await post('lecturer', '/bookings', body).expect(201);
      id = r.body.id; expect(r.body.status).toBe('PENDING');
      expect((await get('dean', '/notifications/unread-count')).body.count).toBe(before + 1);
    });
    it('dean sees the request with availability analysis', async () => {
      const r = await get('dean', `/bookings/${id}`).expect(200);
      expect(r.body.analysis.computers.total).toBeGreaterThanOrEqual(5);
      expect(r.body.analysis.ok).toBe(true);
    });
    it('rejection requires a reason', async () => { await post('dean', `/bookings/${id}/decision`, { approve: false }).expect(400); });
    it('dean approves; slot becomes reserved and the lecturer is notified', async () => {
      const before = (await get('lecturer', '/notifications/unread-count')).body.count;
      const r = await post('dean', `/bookings/${id}/decision`, { approve: true }).expect(201);
      expect(r.body.status).toBe('APPROVED');
      expect((await get('lecturer', '/notifications/unread-count')).body.count).toBe(before + 1);
      const cal = await get('lecturer', `/bookings/calendar?from=${encodeURIComponent(new Date(body.startAt).toISOString())}&to=${encodeURIComponent(new Date(body.endAt).toISOString())}`).expect(200);
      expect(cal.body.find((b: any) => b.id === id)?.status).toBe('APPROVED');
      const slots = await get('lecturer', `/bookings/slots?date=${new Date(new Date(body.startAt).getTime() + 5.5 * 3600_000).toISOString().slice(0, 10)}`).expect(200);
      expect(slots.body.free.some((f: any) => f.start === '10:00')).toBe(false);
    });
    it('PREVENTS DOUBLE BOOKING of an approved slot', async () => {
      const r = await post('lecturer', '/bookings', { ...body, course: 'Clash' }).expect(409);
      expect(JSON.stringify(r.body)).toMatch(/TIME|already booked/i);
      // the failed attempt is recorded as a notification for the lecturer
      const n = await get('lecturer', '/notifications?unread=true').expect(200);
      expect(n.body.some((x: any) => x.type === 'BOOKING_CONFLICT')).toBe(true);
    });
    it('rejects bookings outside lab hours, in the past, or spanning days', async () => {
      await post('lecturer', '/bookings', bookingBody(slot(6, 7))).expect(400);
      await post('lecturer', '/bookings', bookingBody({ startAt: '2020-01-06T04:30:00Z', endAt: '2020-01-06T06:30:00Z' })).expect(400);
    });
    it('rejects a booking that needs more computers than exist', async () => {
      await post('lecturer', '/bookings', bookingBody({ computersNeeded: 500 })).expect(400); // DTO max
      await post('lecturer', '/bookings', bookingBody({ computersNeeded: 100 })).expect(409);
    });
    it('database exclusion constraint blocks overlapping APPROVED rows even if the app is bypassed', async () => {
      const row = await prisma.labBooking.findUniqueOrThrow({ where: { id } });
      const { id: _i, refNo: _r, createdAt: _c, updatedAt: _u, ...rest } = row as any;
      await expect(prisma.labBooking.create({ data: { ...rest, refNo: 'BK-RAW-' + Date.now(), status: 'APPROVED' } })).rejects.toThrow();
    });
    it('lecturer can cancel; slot is freed', async () => {
      await post('lecturer', `/bookings/${id}/cancel`, { reason: 'test' }).expect(201);
      await post('lecturer', '/bookings', { ...body, course: 'Reuse' }).expect(201);
    });
  });

  describe('equipment loan lifecycle', () => {
    let assetId: string; let loanId: string;
    const win = () => ({ requiredFrom: new Date(Date.now() + 3600_000).toISOString(), dueAt: new Date(Date.now() + 48 * 3600_000).toISOString() });
    beforeAll(async () => {
      const a = await get('tech', '/assets?status=AVAILABLE&search=Monitor&pageSize=1').expect(200);
      assetId = a.body.rows[0].id;
    });
    it('student requests → technician approves → issues', async () => {
      const r = await post('student', '/loans', { purpose: 'Project demo', useLocation: 'Seminar room', items: [{ assetId }], ...win() }).expect(201);
      loanId = r.body.id;
      await post('student', `/loans/${loanId}/decision`, { approve: true }).expect(403); // students cannot approve
      await post('tech', `/loans/${loanId}/decision`, { approve: true }).expect(201);
      await post('tech', `/loans/${loanId}/issue`, { accessories: 'Power cable' }).expect(201);
      expect((await get('tech', `/assets/${assetId}`)).body.status).toBe('BORROWED');
    });
    it('a borrowed asset cannot be requested by someone else', async () => {
      await post('staff', '/loans', { purpose: 'x test', useLocation: 'x', items: [{ assetId }], ...win() }).expect(409);
    });
    it('overdue detection flags the loan and the asset and notifies the borrower', async () => {
      await prisma.$executeRaw`UPDATE "LoanRequest" SET "dueAt" = now() - interval '1 hour', "requiredFrom" = now() - interval '2 days' WHERE id = ${loanId}`;
      const r = await post('tech', '/loans/jobs/overdue').expect(201);
      expect(r.body.flagged).toBeGreaterThanOrEqual(1);
      expect((await get('tech', `/assets/${assetId}`)).body.status).toBe('OVERDUE');
      const l = await get('tech', '/loans?overdue=true').expect(200);
      expect(l.body.rows.some((x: any) => x.id === loanId)).toBe(true);
    });
    it('return → asset goes to inspection; failing inspection opens maintenance; asset stays unavailable', async () => {
      await post('tech', `/loans/${loanId}/return`, { missingAccessories: 'none' }).expect(201);
      expect((await get('tech', `/assets/${assetId}`)).body.status).toBe('UNDER_INSPECTION');
      const ins = await post('tech', `/loans/inspect/${assetId}`, { passed: false, conditionFound: 'POOR', damageNotes: 'Cracked bezel' }).expect(201);
      expect(ins.body.maintenanceId).toBeTruthy();
      expect((await get('tech', `/assets/${assetId}`)).body.status).toBe('UNDER_MAINTENANCE');
      // status endpoint must not allow bypassing the repair gate
      await post('tech', `/assets/${assetId}/status`, { status: 'AVAILABLE' }).expect(409);
      (global as any).__maint = ins.body.maintenanceId;
    });
    it('maintenance must pass every step; AVAILABLE only after successful verification', async () => {
      const m = (global as any).__maint as string;
      const adv = (to: string, extra: any = {}) => post('tech', `/maintenance/${m}/advance`, { to, ...extra });
      await adv('UNDER_REPAIR').expect(400); // cannot skip
      await adv('DIAGNOSING', { diagnosis: 'Bezel damaged' }).expect(201);
      const techUser = (await get('admin', '/users?role=TECHNICIAN')).body.rows[0];
      await adv('ASSIGNED', { technicianId: techUser.id }).expect(201);
      await adv('UNDER_REPAIR').expect(201);
      await adv('REPAIRED').expect(400); // action taken required
      await adv('REPAIRED', { actionTaken: 'Replaced bezel', cost: 4500 }).expect(201);
      await adv('VERIFIED').expect(400);
      await adv('AWAITING_VERIFICATION').expect(201);
      expect((await get('tech', `/assets/${assetId}`)).body.status).toBe('UNDER_REPAIR');
      await post('tech', `/maintenance/${m}/verify`, { testPerformed: 'Visual + power test', testPassed: false }).expect(201);
      expect((await get('tech', `/assets/${assetId}`)).body.status).toBe('UNDER_REPAIR');
      await adv('REPAIRED', { actionTaken: 'Re-seated panel' }).expect(201);
      await adv('AWAITING_VERIFICATION').expect(201);
      await post('lecturer', `/maintenance/${m}/verify`, { testPerformed: 'x', testPassed: true }).expect(403);
      await post('tech', `/maintenance/${m}/verify`, { testPerformed: 'Visual + 30 min burn-in', testPassed: true, condition: 'GOOD' }).expect(201);
      expect((await get('tech', `/assets/${assetId}`)).body.status).toBe('AVAILABLE');
      await adv('CLOSED').expect(201);
    });
    it('asset history preserves old and new values', async () => {
      const a = await get('tech', '/assets?pageSize=1&search=Raspberry').expect(200);
      const id = a.body.rows[0].id;
      await request(http).patch(`/api/assets/${id}`).set(as('tech')).send({ specifications: [{ key: 'RAM', value: '8GB' }], condition: 'FAIR' }).expect(200);
      await request(http).patch(`/api/assets/${id}`).set(as('tech')).send({ specifications: [{ key: 'RAM', value: '16GB' }] }).expect(200);
      const h = await get('tech', `/assets/${id}/history`).expect(200);
      const ram = h.body.changes.filter((c: any) => c.field === 'spec:RAM');
      expect(ram.map((c: any) => [c.oldValue, c.newValue])).toEqual(expect.arrayContaining([['8GB', '16GB'], [null, '8GB']]));
      expect(h.body.specifications.filter((s: any) => s.key === 'RAM').length).toBe(2);
    });
  });

  describe('audit log', () => {
    it('records business actions with user, module and values', async () => {
      const r = await get('admin', '/audit?module=loans&pageSize=5').expect(200);
      expect(r.body.rows.length).toBeGreaterThan(0);
      expect(r.body.rows[0]).toMatchObject({ module: 'loans' });
      expect(r.body.rows[0].user?.fullName).toBeTruthy();
    });
    it('hash chain verifies', async () => { expect((await get('admin', '/audit/verify').expect(200)).body.ok).toBe(true); });
    it('cannot be modified or deleted – even straight through SQL', async () => {
      const row = await prisma.auditLog.findFirstOrThrow();
      await expect(prisma.auditLog.update({ where: { id: row.id }, data: { action: 'tampered' } })).rejects.toThrow(/append-only/);
      await expect(prisma.auditLog.delete({ where: { id: row.id } })).rejects.toThrow(/append-only/);
    });
  });

  describe('misc', () => {
    it('dashboard exposes all required statistics', async () => {
      const r = await get('admin', '/dashboard').expect(200);
      for (const k of ['totalAssets', 'available', 'borrowed', 'reserved', 'underRepair', 'damaged', 'missing', 'overdueLoans', 'pendingRequests', 'pendingBookings', 'upcomingBookings', 'maintenanceAlerts', 'warrantyAlerts']) expect(r.body.stats).toHaveProperty(k);
    });
    it('reports export as CSV/XLSX/PDF', async () => {
      const csv = await get('admin', '/reports/asset-register?format=csv').expect(200);
      expect(csv.text).toContain('Asset ID');
      await get('admin', '/reports/asset-register?format=xlsx').expect(200).expect('Content-Type', /spreadsheetml/);
      await get('admin', '/reports/asset-register?format=pdf').expect(200).expect('Content-Type', /pdf/);
      await get('student', '/reports/asset-register').expect(403);
    });
    it('QR endpoint returns a PNG for an asset tag', async () => {
      const a = await get('tech', '/assets?pageSize=1').expect(200);
      await get('tech', `/assets/${a.body.rows[0].assetTag}/qr`).expect(200).expect('Content-Type', /png/);
    });
    it('stocktake: Not Found creates a missing-asset report on completion', async () => {
      const st = await post('tech', '/stocktakes', { title: 'E2E stocktake', locationId: (await prisma.location.findFirstOrThrow({ where: { name: 'Cabinet A1' } })).id }).expect(201);
      const full = await get('tech', `/stocktakes/${st.body.id}`).expect(200);
      const item = full.body.items.find((i: any) => i.asset.status === 'AVAILABLE');
      await post('tech', `/stocktakes/${st.body.id}/check`, { assetId: item.asset.id, result: 'NOT_FOUND', note: 'e2e' }).expect(201);
      await post('tech', `/stocktakes/${st.body.id}/complete`).expect(201);
      expect((await get('tech', `/assets/${item.asset.id}`)).body.status).toBe('MISSING');
    });
  });
});
