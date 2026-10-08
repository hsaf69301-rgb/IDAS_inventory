import { assetSchema, bookingSchema, changePasswordSchema, loanSchema, loginSchema, parseSpecs } from './schemas';

describe('client-side validation', () => {
  it('login requires a valid email', () => {
    expect(loginSchema.safeParse({ email: 'nope', password: 'x' }).success).toBe(false);
    expect(loginSchema.safeParse({ email: 'a@b.lk', password: 'x' }).success).toBe(true);
  });
  it('password policy', () => {
    const base = { current: 'old', confirm: 'Abcdefghi1' };
    expect(changePasswordSchema.safeParse({ ...base, next: 'short' }).success).toBe(false);
    expect(changePasswordSchema.safeParse({ ...base, next: 'alllowercase1' }).success).toBe(false);
    expect(changePasswordSchema.safeParse({ ...base, next: 'Abcdefghi1' }).success).toBe(true);
    expect(changePasswordSchema.safeParse({ ...base, next: 'Abcdefghi1', confirm: 'different' }).success).toBe(false);
  });
  it('booking: end must be after start, students >= 1', () => {
    const ok = { staffId: 'L1', department: 'IT', course: 'C', moduleCode: 'M', purpose: 'Lab practical', batchYear: '2', studentCount: 10, date: '2030-01-07', startTime: '10:00', endTime: '12:00', computersNeeded: 5 };
    expect(bookingSchema.safeParse(ok).success).toBe(true);
    expect(bookingSchema.safeParse({ ...ok, endTime: '09:00' }).success).toBe(false);
    expect(bookingSchema.safeParse({ ...ok, studentCount: 0 }).success).toBe(false);
  });
  it('loan request: terms must be accepted and return after start', () => {
    const ok = { purpose: 'Demo', useLocation: 'Room 2', requiredFrom: '2030-01-07T09:00', dueAt: '2030-01-08T09:00', agree: true };
    expect(loanSchema.safeParse(ok).success).toBe(true);
    expect(loanSchema.safeParse({ ...ok, agree: false }).success).toBe(false);
    expect(loanSchema.safeParse({ ...ok, dueAt: '2030-01-06T09:00' }).success).toBe(false);
  });
  it('asset: warranty end cannot precede start; empty value allowed', () => {
    expect(assetSchema.safeParse({ name: 'PC', categoryId: 'c', value: '', warrantyStart: '2030-02-01', warrantyEnd: '2030-01-01' }).success).toBe(false);
    expect(assetSchema.safeParse({ name: 'PC', categoryId: 'c', value: '' }).success).toBe(true);
  });
  it('parses KEY=VALUE specification text', () => {
    expect(parseSpecs('RAM=16GB, CPU=Core i5 ,junk')).toEqual([{ key: 'RAM', value: '16GB' }, { key: 'CPU', value: 'Core i5' }]);
  });
});
