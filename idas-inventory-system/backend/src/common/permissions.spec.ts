import { PERMISSIONS, ROLE_PERMISSIONS } from './permissions';

describe('RBAC permission matrix', () => {
  it('admin holds every permission', () => {
    expect(new Set(ROLE_PERMISSIONS.ADMIN)).toEqual(new Set(Object.values(PERMISSIONS)));
  });
  it('only the Dean/Registrar and Admin can decide lab bookings', () => {
    const who = Object.entries(ROLE_PERMISSIONS).filter(([, p]) => p.includes(PERMISSIONS.BOOKING_DECIDE)).map(([r]) => r).sort();
    expect(who).toEqual(['ADMIN', 'DEAN_REGISTRAR']);
  });
  it('only lecturers (and admin) can submit lab bookings', () => {
    const who = Object.entries(ROLE_PERMISSIONS).filter(([, p]) => p.includes(PERMISSIONS.BOOKING_REQUEST)).map(([r]) => r).sort();
    expect(who).toEqual(['ADMIN', 'LECTURER']);
  });
  it('only technicians and admin can verify repairs', () => {
    const who = Object.entries(ROLE_PERMISSIONS).filter(([, p]) => p.includes(PERMISSIONS.MAINT_VERIFY)).map(([r]) => r).sort();
    expect(who).toEqual(['ADMIN', 'TECHNICIAN']);
  });
  it.each(['STUDENT', 'UNIVERSITY_STAFF', 'TRAINEE'] as const)('%s cannot manage users, audit, loans, or maintenance', (role) => {
    const p = ROLE_PERMISSIONS[role];
    for (const forbidden of [PERMISSIONS.USER_WRITE, PERMISSIONS.AUDIT_READ, PERMISSIONS.LOAN_MANAGE, PERMISSIONS.MAINT_MANAGE, PERMISSIONS.ASSET_WRITE, PERMISSIONS.SETTINGS_MANAGE]) {
      expect(p).not.toContain(forbidden);
    }
    expect(p).toContain(PERMISSIONS.LOAN_REQUEST);
  });
  it('audit log is readable only by admin', () => {
    expect(Object.entries(ROLE_PERMISSIONS).filter(([, p]) => p.includes(PERMISSIONS.AUDIT_READ)).map(([r]) => r)).toEqual(['ADMIN']);
  });
});
