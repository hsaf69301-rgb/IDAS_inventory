/* Demo data for the IDAS Inventory System.  Run: npm run prisma:seed
 * !! Demo credentials below are for development ONLY. Change/delete them in any real deployment. */
import { PrismaClient, RoleName, AssetStatus, AssetCondition, LocationType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { createHash } from 'crypto';
import { PERMISSIONS, PERMISSION_DESCRIPTIONS, ROLE_LABELS, ROLE_PERMISSIONS } from '../src/common/permissions';

const prisma = new PrismaClient();
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD || 'Idas@2026Demo';
const day = 86400_000;
const at = (offsetDays: number, hour = 9, min = 0) => { const d = new Date(Date.now() + offsetDays * day); d.setUTCHours(hour - 5, min - 30, 0, 0); return d; }; // lab-local (UTC+5:30) hour

let lastHash: string | null = null;
async function audit(userId: string | null, action: string, module: string, recordId?: string, next?: unknown) {
  const createdAt = new Date();
  const payload = JSON.stringify({ p: lastHash, u: userId, a: action, m: module, r: recordId ?? null, pv: null, nx: next ?? null, t: createdAt.toISOString() });
  const hash = createHash('sha256').update(payload).digest('hex');
  await prisma.auditLog.create({ data: { userId, action, module, recordId, next: next as any, createdAt, prevHash: lastHash, hash } });
  lastHash = hash;
}

async function main() {
  const existing = await prisma.user.count();
  if (existing > 0 && process.env.SEED_FORCE !== 'true') {
    console.log('Database already contains users – seed skipped (set SEED_FORCE=true to add anyway).');
    return;
  }
  // ── Roles & permissions ──
  for (const code of Object.values(PERMISSIONS)) await prisma.permission.upsert({ where: { code }, update: {}, create: { code, description: PERMISSION_DESCRIPTIONS[code] ?? code } });
  const perms = await prisma.permission.findMany();
  for (const name of Object.keys(ROLE_LABELS) as RoleName[]) {
    const role = await prisma.role.upsert({ where: { name }, update: { label: ROLE_LABELS[name] }, create: { name, label: ROLE_LABELS[name] } });
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({ data: ROLE_PERMISSIONS[name].map((c) => ({ roleId: role.id, permissionId: perms.find((p) => p.code === c)!.id })) });
  }
  const roleId = async (n: RoleName) => (await prisma.role.findUniqueOrThrow({ where: { name: n } })).id;

  // ── Departments & users ──
  const deptIT = await prisma.department.upsert({ where: { name: 'Department of Information Technology' }, update: {}, create: { name: 'Department of Information Technology' } });
  const deptAdmin = await prisma.department.upsert({ where: { name: 'Faculty Administration' }, update: {}, create: { name: 'Faculty Administration' } });
  await prisma.department.upsert({ where: { name: 'Department of Sinhala' }, update: {}, create: { name: 'Department of Sinhala' } });
  const hash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const mk = async (email: string, fullName: string, role: RoleName, universityId: string, departmentId: string) =>
    prisma.user.create({ data: { email, fullName, universityId, roleId: await roleId(role), departmentId, passwordHash: hash, phone: '+94 81 239 0000' } });
  const admin = await mk('admin@idas.pdn.ac.lk', 'Nimal Admin', 'ADMIN', 'ADM/001', deptIT.id);
  const tech = await mk('technician@idas.pdn.ac.lk', 'R. Silva', 'TECHNICIAN', 'STF/204', deptIT.id);
  const lecturer = await mk('lecturer@idas.pdn.ac.lk', 'Dr. A. Jayasuriya', 'LECTURER', 'LEC/0112', deptIT.id);
  const lecturer2 = await mk('lecturer2@idas.pdn.ac.lk', 'Dr. M. Bandara', 'LECTURER', 'LEC/0127', deptIT.id);
  const dean = await mk('dean@idas.pdn.ac.lk', 'Prof. S. Dean', 'DEAN_REGISTRAR', 'DEAN/001', deptAdmin.id);
  const student = await mk('student@idas.pdn.ac.lk', 'K. Perera', 'STUDENT', 'AR/2021/114', deptIT.id);
  const staff = await mk('staff@idas.pdn.ac.lk', 'N. Wijesinghe', 'UNIVERSITY_STAFF', 'STF/318', deptAdmin.id);
  const trainee = await mk('trainee@idas.pdn.ac.lk', 'T. Fernando', 'TRAINEE', 'TRN/2026/07', deptIT.id);

  // ── Locations (University → Faculty → Department → Lab → Room → Rack) ──
  const loc = async (name: string, type: LocationType, parentId?: string) => prisma.location.create({ data: { name, type, parentId } });
  const uni = await loc('University of Peradeniya', 'UNIVERSITY');
  const fac = await loc('Faculty of Arts', 'FACULTY', uni.id);
  const dep = await loc('Department of IT', 'DEPARTMENT', fac.id);
  const lab = await loc('IDAS Lab', 'LAB', dep.id);
  const hall = await loc('Main Hall', 'ROOM', lab.id);
  const bench = await loc('Repair Bench', 'ROOM', lab.id);
  const store = await loc('Store Room', 'ROOM', lab.id);
  const rack = await loc('Rack R1', 'RACK', lab.id);
  const cabA1 = await loc('Cabinet A1', 'RACK', store.id);
  const entrance = await loc('Entrance', 'ROOM', lab.id);

  // ── Categories ──
  const catDefs: [string, string][] = [['PC', 'Desktop Computer'], ['LAP', 'Laptop'], ['MON', 'Monitor'], ['PROJ', 'Projector'], ['NET', 'Networking Equipment'], ['CCTV', 'CCTV Equipment'], ['AC', 'Air Conditioner'], ['PRN', 'Printer'], ['UPS', 'UPS'], ['CAB', 'Cables'], ['ADP', 'Adapters'], ['TOOL', 'Tools'], ['CAM', 'Camera'], ['AUD', 'Microphone / Speaker'], ['OTH', 'Other Technical Equipment']];
  const cat: Record<string, string> = {};
  for (const [code, name] of catDefs) cat[code] = (await prisma.category.create({ data: { code, name } })).id;

  // ── Assets ──
  const counters: Record<string, number> = {};
  const tag = (code: string) => { counters[code] = (counters[code] ?? 0) + 1; return `IDAS-${code}-${String(counters[code]).padStart(4, '0')}`; };
  async function asset(code: string, name: string, o: { brand?: string; model?: string; status?: AssetStatus; condition?: AssetCondition; locationId?: string; specs?: Record<string, string>; funding?: string; supplier?: string; acquired?: string; value?: number; warrantyEnd?: string; qty?: number; consumable?: boolean; serial?: string } = {}) {
    const a = await prisma.asset.create({
      data: {
        assetTag: tag(code), name, categoryId: cat[code], brand: o.brand, model: o.model, status: o.status ?? 'AVAILABLE', condition: o.condition ?? 'GOOD',
        locationId: o.locationId, quantity: o.qty ?? 1, isConsumable: o.consumable ?? false, serialNumber: o.serial,
        specifications: o.specs ? { create: Object.entries(o.specs).map(([key, value]) => ({ key, value })) } : undefined,
        acquisition: { create: { acquiredAt: o.acquired ? new Date(o.acquired) : undefined, supplier: o.supplier, fundingSource: o.funding, value: o.value, invoiceRef: o.value ? `INV-${Math.floor(Math.random() * 90000 + 10000)}` : undefined, warrantyStart: o.acquired ? new Date(o.acquired) : undefined, warrantyEnd: o.warrantyEnd ? new Date(o.warrantyEnd) : undefined, warrantyDetails: o.warrantyEnd ? 'Manufacturer on-site warranty' : undefined } },
      },
    });
    if (o.locationId) await prisma.assetMovement.create({ data: { assetId: a.id, toId: o.locationId, movedById: admin.id, reason: 'Initial placement' } });
    return a;
  }
  // 24 lab desktops
  const pcs = [];
  for (let i = 1; i <= 24; i++) {
    pcs.push(await asset('PC', 'HP ProDesk 400 G7', { brand: 'HP', model: 'ProDesk 400 G7', locationId: hall.id, specs: { CPU: 'Intel Core i5-10500', RAM: '16GB', Storage: '512GB SSD', OS: 'Ubuntu 22.04 / Windows 11' }, funding: 'Faculty Fund', supplier: 'Metropolitan Computers', acquired: '2021-08-02', value: 185000, warrantyEnd: i % 8 === 0 ? at(25).toISOString().slice(0, 10) : '2026-08-02', serial: `HP-PD-${1000 + i}` }));
  }
  const lap1 = await asset('LAP', 'Dell Latitude 5420', { brand: 'Dell', model: 'Latitude 5420', locationId: cabA1.id, status: 'BORROWED', condition: 'GOOD', specs: { CPU: 'Intel Core i5-1135G7', RAM: '16GB', Storage: '256GB SSD' }, funding: 'UGC Grant 2023', supplier: 'Dell Lanka', acquired: '2023-03-14', value: 320000, warrantyEnd: '2026-03-14', serial: 'DL-5420-0001' });
  const lap2 = await asset('LAP', 'Dell Latitude 5420', { brand: 'Dell', model: 'Latitude 5420', locationId: cabA1.id, condition: 'EXCELLENT', specs: { CPU: 'Intel Core i5-1135G7', RAM: '16GB', Storage: '256GB SSD' }, funding: 'UGC Grant 2023', supplier: 'Dell Lanka', acquired: '2023-03-14', value: 320000, serial: 'DL-5420-0002' });
  for (let i = 0; i < 6; i++) await asset('LAP', 'Lenovo ThinkPad E14', { brand: 'Lenovo', model: 'ThinkPad E14', locationId: cabA1.id, specs: { RAM: '8GB', Storage: '256GB SSD' }, funding: 'AHEAD Project', acquired: '2022-05-18', value: 240000 });
  for (let i = 0; i < 4; i++) await asset('MON', 'Dell P2422H 24" Monitor', { brand: 'Dell', model: 'P2422H', locationId: hall.id, funding: 'Faculty Fund', acquired: '2022-01-10', value: 65000 });
  const proj1 = await asset('PROJ', 'Epson EB-X51 Projector', { brand: 'Epson', model: 'EB-X51', locationId: hall.id, funding: 'Donation – Alumni', acquired: '2022-01-20', value: 210000, warrantyEnd: at(40).toISOString().slice(0, 10) });
  await asset('PROJ', 'BenQ MS550 Projector', { brand: 'BenQ', model: 'MS550', locationId: store.id, funding: 'Faculty Fund', acquired: '2021-03-01', value: 150000 });
  const sw = await asset('NET', 'Cisco Catalyst 2960 Switch', { brand: 'Cisco', model: 'Catalyst 2960', locationId: rack.id, status: 'UNDER_REPAIR', condition: 'FAIR', funding: 'AHEAD Project', acquired: '2020-11-05', value: 180000 });
  await asset('NET', 'TP-Link TL-SG1024 Switch', { brand: 'TP-Link', model: 'TL-SG1024', locationId: rack.id, funding: 'Faculty Fund', acquired: '2023-02-02', value: 28000 });
  await asset('NET', 'Ubiquiti UniFi AP', { brand: 'Ubiquiti', model: 'UniFi 6 Lite', locationId: hall.id, funding: 'Faculty Fund', acquired: '2023-06-02', value: 42000 });
  const cctv = await asset('CCTV', 'Hikvision Dome Camera', { brand: 'Hikvision', model: 'DS-2CD2143', locationId: entrance.id, status: 'DAMAGED', condition: 'POOR', funding: 'University Works', acquired: '2019-06-10', value: 38000 });
  await asset('CCTV', 'Hikvision NVR 8-ch', { brand: 'Hikvision', model: 'DS-7608NI', locationId: rack.id, funding: 'University Works', acquired: '2019-06-10', value: 62000 });
  await asset('AC', 'Daikin 24000 BTU AC', { brand: 'Daikin', model: 'FTKM71', locationId: hall.id, funding: 'University Works', acquired: '2018-04-01', value: 285000 });
  await asset('PRN', 'HP LaserJet Pro M404dn', { brand: 'HP', model: 'M404dn', locationId: store.id, funding: 'Faculty Fund', acquired: '2022-09-01', value: 78000 });
  await asset('UPS', 'APC Smart-UPS 1500VA', { brand: 'APC', model: 'SMT1500I', locationId: rack.id, funding: 'AHEAD Project', acquired: '2021-11-01', value: 125000 });
  await asset('CAB', 'HDMI Cable 2m', { locationId: cabA1.id, qty: 20, consumable: true, funding: 'Faculty Fund' });
  await asset('CAB', 'Cat6 Patch Cable 3m', { locationId: cabA1.id, qty: 40, consumable: true, funding: 'Faculty Fund' });
  await asset('ADP', 'USB-C to HDMI Adapter', { locationId: cabA1.id, qty: 12, consumable: true, funding: 'Faculty Fund' });
  const solder = await asset('TOOL', 'Soldering Station Hakko FX-888D', { brand: 'Hakko', model: 'FX-888D', locationId: bench.id, status: 'BORROWED', funding: 'Faculty Fund', acquired: '2022-09-12', value: 32000 });
  await asset('TOOL', 'Precision Screwdriver Set', { locationId: bench.id, funding: 'Faculty Fund', acquired: '2022-09-12', value: 6000 });
  await asset('CAM', 'Logitech C920 Webcam', { brand: 'Logitech', model: 'C920', locationId: store.id, funding: 'Faculty Fund', acquired: '2022-10-01', value: 18000 });
  await asset('AUD', 'Jabra Speak 750', { brand: 'Jabra', model: 'Speak 750', locationId: store.id, funding: 'Faculty Fund', acquired: '2022-10-01', value: 55000 });
  const rpi = await asset('OTH', 'Raspberry Pi 4 Kit (8GB)', { brand: 'Raspberry Pi', model: '4 Model B', locationId: store.id, status: 'MISSING', condition: 'GOOD', funding: 'AHEAD Project', acquired: '2022-05-18', value: 45000 });
  await asset('LAP', 'Lenovo ThinkPad E14 (old)', { brand: 'Lenovo', model: 'ThinkPad E14', locationId: store.id, status: 'RETIRED', condition: 'POOR', funding: 'Faculty Fund', acquired: '2016-02-11' });

  // asset history demo: RAM upgrade preserved
  await prisma.assetSpecification.updateMany({ where: { assetId: lap2.id, key: 'RAM' }, data: { isCurrent: false, validTo: at(-60) } });
  await prisma.assetSpecification.create({ data: { assetId: lap2.id, key: 'RAM', value: '32GB', changedById: tech.id } });
  await prisma.assetHistory.create({ data: { assetId: lap2.id, field: 'spec:RAM', oldValue: '16GB', newValue: '32GB', changedById: tech.id, changedAt: at(-60) } });

  // ── Loans ──
  const nextLn = (() => { let n = 1036; return () => `LN-${String(++n).padStart(4, '0')}`; })();
  const loan1 = await prisma.loanRequest.create({ data: { refNo: nextLn(), requesterId: student.id, purpose: 'Final-year project demo', useLocation: 'Faculty of Arts – Seminar room 2', requiredFrom: at(-3, 9), dueAt: at(-1, 16), status: 'ISSUED', approverId: tech.id, decidedAt: at(-3, 8), issuerId: tech.id, issuedAt: at(-3, 9, 15), accessories: 'Charger, laptop bag', items: { create: { assetId: lap1.id, conditionOnIssue: 'GOOD' } } } });
  await prisma.asset.update({ where: { id: lap1.id }, data: { status: 'OVERDUE', responsibleUserId: student.id } });
  const loan2 = await prisma.loanRequest.create({ data: { refNo: nextLn(), requesterId: lecturer2.id, purpose: 'Hardware workshop', useLocation: 'Repair Bench', requiredFrom: at(-1, 13), dueAt: at(2, 16), status: 'ISSUED', approverId: tech.id, decidedAt: at(-1, 12), issuerId: tech.id, issuedAt: at(-1, 13, 40), items: { create: { assetId: solder.id, conditionOnIssue: 'GOOD' } } } });
  await prisma.asset.update({ where: { id: solder.id }, data: { responsibleUserId: lecturer2.id } });
  await prisma.loanRequest.create({ data: { refNo: nextLn(), requesterId: staff.id, purpose: 'Reception display', useLocation: 'Faculty office', requiredFrom: at(1, 9), dueAt: at(3, 16), status: 'PENDING', items: { create: { assetId: pcs[0].id } } } });
  await prisma.loanRequest.create({ data: { refNo: nextLn(), requesterId: trainee.id, purpose: 'Networking practice', useLocation: 'IDAS Lab', requiredFrom: at(2, 10), dueAt: at(4, 16), status: 'PENDING', items: { create: [{ assetId: pcs[1].id }, { assetId: pcs[2].id }] } } });
  const loan5 = await prisma.loanRequest.create({ data: { refNo: nextLn(), requesterId: staff.id, purpose: 'Training session', useLocation: 'Main Hall', requiredFrom: at(-14, 9), dueAt: at(-12, 16), status: 'RETURNED', approverId: tech.id, issuerId: tech.id, receiverId: tech.id, issuedAt: at(-14, 9), returnedAt: at(-12, 15), items: { create: { assetId: pcs[3].id, conditionOnIssue: 'GOOD', conditionOnReturn: 'GOOD' } } } });
  void loan1; void loan2; void loan5;

  // ── Lab bookings ──
  const nextBk = (() => { let n = 0; return () => `BK-${String(++n).padStart(4, '0')}`; })();
  const bk = async (lec: typeof lecturer, course: string, code: string, d: number, h1: number, h2: number, status: 'APPROVED' | 'PENDING' | 'REJECTED', pcsN: number, students: number, extra?: { projector?: boolean }) => {
    const b = await prisma.labBooking.create({
      data: {
        refNo: nextBk(), lecturerId: lec.id, staffId: lec.universityId!, department: 'Department of IT', email: lec.email, course, moduleCode: code, purpose: `${course} practical session`,
        batchYear: '2nd year', studentCount: students, date: new Date(at(d, h1).toISOString().slice(0, 10)), startTime: at(d, h1), endTime: at(d, h2), computersNeeded: pcsN, software: 'VS Code, Python 3.12',
        status, deciderId: status === 'PENDING' ? null : dean.id, decidedAt: status === 'PENDING' ? null : new Date(), rejectionReason: status === 'REJECTED' ? 'Clashes with faculty examination schedule' : null,
        resources: extra?.projector ? { create: [{ categoryId: cat.PROJ, quantity: 1, reserved: false }, ...(status === 'APPROVED' ? [{ categoryId: cat.PROJ, assetId: proj1.id, quantity: 1, reserved: true }] : [])] } : undefined,
        approvals: { create: [{ actorId: lec.id, action: 'PENDING' as const, reason: 'Submitted' }, ...(status !== 'PENDING' ? [{ actorId: dean.id, action: status, reason: status === 'REJECTED' ? 'Clashes with faculty examination schedule' : undefined }] : [])] },
      },
    });
    return b;
  };
  await bk(lecturer, 'IT 2103 Practical', 'IT2103', 1, 9, 11, 'APPROVED', 20, 20, { projector: true });
  await bk(lecturer2, 'Networking Lab', 'IT3042', 3, 10, 12, 'APPROVED', 6, 18);
  await bk(lecturer, 'Database Systems Lab', 'IT2203', 4, 13, 16, 'PENDING', 24, 22);
  await bk(lecturer2, 'Staff Training', 'TRN001', 5, 8, 10, 'PENDING', 0, 12);
  await bk(lecturer, 'Intro to Programming', 'IT1103', 2, 14, 17, 'REJECTED', 30, 30);

  // ── Maintenance / damage / lost ──
  const m1 = await prisma.maintenance.create({ data: { refNo: 'MT-0208', assetId: sw.id, problem: 'Ports 12–18 not linking', reporterId: lecturer2.id, reportedAt: at(-10), priority: 'HIGH', status: 'UNDER_REPAIR', technicianId: tech.id, diagnosis: 'Faulty port ASIC group', repairStart: at(-7), steps: { create: [{ toStatus: 'REPORTED', actorId: lecturer2.id }, { fromStatus: 'REPORTED', toStatus: 'DIAGNOSING', actorId: tech.id }, { fromStatus: 'DIAGNOSING', toStatus: 'ASSIGNED', actorId: tech.id }, { fromStatus: 'ASSIGNED', toStatus: 'UNDER_REPAIR', actorId: tech.id }] } } });
  const m2 = await prisma.maintenance.create({ data: { refNo: 'MT-0207', assetId: cctv.id, problem: 'Lens cracked, water ingress', reporterId: tech.id, reportedAt: at(-13), priority: 'MEDIUM', status: 'DIAGNOSING', steps: { create: [{ toStatus: 'REPORTED', actorId: tech.id }, { fromStatus: 'REPORTED', toStatus: 'DIAGNOSING', actorId: tech.id }] } } });
  void m1; void m2;
  await prisma.damageReport.create({ data: { refNo: 'DM-0001', assetId: cctv.id, reporterId: tech.id, reportedAt: at(-13), location: 'Entrance', description: 'Dome cracked after storm; water ingress', severity: 'MAJOR', estimatedCost: 25000, status: 'INVESTIGATING' } });
  await prisma.lostReport.create({ data: { refNo: 'LS-0001', assetId: rpi.id, reporterId: tech.id, reportedAt: at(-25), lastKnownUser: 'S. Fernando', lastKnownLocation: 'Drawer D4', lastSeenAt: at(-26), investigation: 'Reported missing after practical', recovery: 'INVESTIGATING' } });

  // ── Notifications ──
  const note = (userId: string, type: any, title: string, message: string, link: string) => prisma.notification.create({ data: { userId, type, title, message, link } });
  await note(dean.id, 'BOOKING_REQUESTED', 'New lab booking request BK-0003', 'Dr. A. Jayasuriya – Database Systems Lab (IT2203), 22 students', '/approvals');
  await note(dean.id, 'BOOKING_REQUESTED', 'New lab booking request BK-0004', 'Dr. M. Bandara – Staff Training (TRN001), 12 students', '/approvals');
  await note(lecturer.id, 'BOOKING_APPROVED', 'Booking BK-0001 approved', 'IT 2103 Practical is confirmed and the lab and equipment are reserved.', '/lab-booking');
  await note(lecturer.id, 'BOOKING_REJECTED', 'Booking BK-0005 rejected', 'Reason: Clashes with faculty examination schedule', '/lab-booking');
  await note(student.id, 'LOAN_OVERDUE', 'Loan LN-0037 is overdue', 'Please return the equipment to the IDAS Lab.', '/requests');
  await note(tech.id, 'LOAN_REQUESTED', 'New equipment request LN-0040', 'N. Wijesinghe requested 1 item(s)', '/loans');
  await note(tech.id, 'WARRANTY_EXPIRY', 'Warranty expiring soon', 'IDAS-PROJ-0001 · Epson EB-X51 Projector – warranty ending soon', '/inventory');
  await note(admin.id, 'ASSET_MISSING', 'Missing asset: IDAS-OTH-0001', 'Raspberry Pi 4 Kit (8GB) reported missing', '/damage');

  // ── Audit entries for demo (hash-chained) ──
  await audit(admin.id, 'User created', 'users', admin.id, { email: admin.email });
  await audit(admin.id, 'Asset created', 'assets', lap1.id, { assetTag: lap1.assetTag });
  await audit(tech.id, 'Asset issued', 'loans', loan1.id, { refNo: loan1.refNo });
  await audit(dean.id, 'Booking approved', 'bookings', undefined, { refNo: 'BK-0001' });
  await audit(dean.id, 'Booking rejected', 'bookings', undefined, { refNo: 'BK-0005' });
  await audit(tech.id, 'Maintenance created', 'maintenance', m1.id, { refNo: 'MT-0208' });

  // sequence counters so new refs continue after demo data
  const seqs: Record<string, number> = { LN: 1041, BK: 5, MT: 208, DM: 1, LS: 1, ST: 0 };
  for (const [p, n] of Object.entries(seqs)) await prisma.setting.upsert({ where: { key: `seq:${p}` }, create: { key: `seq:${p}`, value: String(n) }, update: { value: String(n) } });
  for (const [code, n] of Object.entries(counters)) await prisma.setting.upsert({ where: { key: `seqIDAS${code}` }, create: { key: `seqIDAS${code}`, value: String(n) }, update: { value: String(n) } });
  await prisma.setting.createMany({ data: [{ key: 'app.labOpen', value: '08:00' }, { key: 'app.labClose', value: '18:00' }, { key: 'app.labDays', value: '1,2,3,4,5' }, { key: 'app.labName', value: 'IDAS Lab' }], skipDuplicates: true });

  console.log('\n✔ Seed complete. Demo accounts (password for all: ' + DEMO_PASSWORD + '):');
  for (const u of [admin, tech, lecturer, lecturer2, dean, student, staff, trainee]) console.log('   ' + u.email.padEnd(32) + (await prisma.role.findUniqueOrThrow({ where: { id: u.roleId } })).label);
  console.log('\n⚠  These are DEMO credentials. Change them before any real deployment.\n');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
