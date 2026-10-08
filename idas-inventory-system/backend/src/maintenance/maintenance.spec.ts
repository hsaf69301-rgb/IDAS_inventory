import { ConflictException, BadRequestException } from '@nestjs/common';
import { MAINT_FLOW, MaintenanceService } from './maintenance.service';

describe('maintenance workflow definition', () => {
  it('follows Reported → Diagnosing → Assigned → Under Repair → Repaired → Awaiting Verification', () => {
    const chain = ['REPORTED', 'DIAGNOSING', 'ASSIGNED', 'UNDER_REPAIR', 'REPAIRED', 'AWAITING_VERIFICATION'] as const;
    for (let i = 0; i < chain.length - 1; i++) expect(MAINT_FLOW[chain[i]]).toEqual([chain[i + 1]]);
  });
  it('cannot reach VERIFIED through advance() – only verify() can', () => {
    for (const next of Object.values(MAINT_FLOW)) expect(next).not.toContain('VERIFIED');
  });
  it('CLOSED is terminal', () => { expect(MAINT_FLOW.CLOSED).toEqual([]); });
});

function make(m: any) {
  const changeStatus = jest.fn();
  const tx: any = {
    maintenance: { update: jest.fn().mockResolvedValue({}), findUnique: jest.fn().mockResolvedValue({ ...m, steps: [], cost: null }) },
    maintenanceStep: { create: jest.fn() },
    asset: { findUniqueOrThrow: jest.fn().mockResolvedValue({ status: 'UNDER_REPAIR' }) },
  };
  const prisma: any = { maintenance: { findUnique: jest.fn().mockResolvedValue(m) }, $transaction: (fn: any) => fn(tx) };
  const audit: any = { log: jest.fn() };
  const notif: any = { notify: jest.fn() };
  const svc = new MaintenanceService(prisma, audit, notif, { changeStatus, assertCanBeAvailable: jest.fn() } as any);
  jest.spyOn(svc, 'get').mockResolvedValue({ id: m.id } as any);
  return { svc, changeStatus, tx, notif };
}

describe('repair verification gate', () => {
  const base = { id: 'm1', refNo: 'MT-1', assetId: 'a1', reporterId: 'u1', status: 'AWAITING_VERIFICATION' };

  it('successful verification makes the asset AVAILABLE and notifies the reporter', async () => {
    const { svc, changeStatus, notif } = make(base);
    await svc.verify('tech', 'm1', { testPerformed: 'Burn-in 30 min', testPassed: true }, {});
    expect(changeStatus).toHaveBeenCalledWith(expect.anything(), 'tech', 'a1', 'AVAILABLE', expect.any(String), {}, 'GOOD');
    expect(notif.notify).toHaveBeenCalled();
  });
  it('FAILED verification returns the job to UNDER_REPAIR and never makes the asset available', async () => {
    const { svc, changeStatus, tx } = make(base);
    await svc.verify('tech', 'm1', { testPerformed: 'Ports still down', testPassed: false }, {});
    expect(changeStatus).not.toHaveBeenCalled();
    expect(tx.maintenance.update.mock.calls[0][0].data.status).toBe('UNDER_REPAIR');
  });
  it('refuses to verify a repair that is not awaiting verification', async () => {
    const { svc } = make({ ...base, status: 'UNDER_REPAIR' });
    await expect(svc.verify('tech', 'm1', { testPerformed: 'x', testPassed: true }, {})).rejects.toBeInstanceOf(BadRequestException);
  });
  it('advance() rejects skipping steps and the VERIFIED shortcut', async () => {
    const { svc } = make({ ...base, status: 'UNDER_REPAIR' });
    await expect(svc.advance('tech', 'm1', { to: 'AWAITING_VERIFICATION' }, {})).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.advance('tech', 'm1', { to: 'VERIFIED' }, {})).rejects.toBeInstanceOf(BadRequestException);
  });
});
