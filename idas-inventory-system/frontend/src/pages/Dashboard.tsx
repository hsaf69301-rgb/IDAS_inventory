import { Link } from 'react-router-dom';
import { PageHeader, Panel, QueryBoundary, StatCard, StatusBadge } from '@/components/common';
import { useAuth } from '@/lib/auth';
import { useList } from '@/hooks/useApi';
import { fmtDate, fmtDateTime } from '@/lib/time';
import { humanize } from '@/lib/format';

function greeting() { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; }

export default function Dashboard() {
  const { user, can } = useAuth();
  const management = can('dashboard:view');
  return (
    <>
      <PageHeader title={`${greeting()}, ${user?.fullName.split(' ')[0] ?? ''}`} sub={`${user?.roleLabel} · ${new Date().toLocaleDateString('en-GB', { dateStyle: 'full' })}`} />
      {management ? <Management /> : null}
      <Mine />
    </>
  );
}

function Management() {
  const q = useList<any>('/dashboard');
  const d = q.data;
  const s = d?.stats ?? {};
  const cards: [string, any, ('danger' | 'warning')?][] = [
    ['Total assets', s.totalAssets], ['Available', s.available], ['Borrowed', s.borrowed], ['Reserved', s.reserved], ['Under repair', s.underRepair, 'warning'],
    ['Damaged', s.damaged, s.damaged ? 'danger' : undefined], ['Missing / lost', s.missing, s.missing ? 'danger' : undefined], ['Overdue loans', s.overdueLoans, s.overdueLoans ? 'danger' : undefined],
    ['Pending requests', s.pendingRequests, 'warning'], ['Pending bookings', s.pendingBookings, 'warning'], ['Upcoming bookings', s.upcomingBookings], ['Maintenance alerts', s.maintenanceAlerts, 'warning'], ['Warranty alerts', s.warrantyAlerts, 'warning'],
  ];
  return (
    <QueryBoundary q={q}>
      {d && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-5">
            {cards.map(([l, v, t]) => <StatCard key={l} label={l} value={v ?? 0} tone={t} />)}
          </div>
          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <Panel title="Assets by status" className="lg:col-span-1">
              {d.byStatus.length === 0 ? <p className="text-sm text-muted-foreground">No assets yet.</p> : (
                <ul className="space-y-2 text-sm">
                  {[...d.byStatus].sort((a: any, b: any) => b.count - a.count).map((r: any) => (
                    <li key={r.status}>
                      <div className="mb-0.5 flex justify-between"><span>{humanize(r.status)}</span><span className="font-mono text-xs">{r.count}</span></div>
                      <div className="h-1.5 rounded bg-muted"><div className="h-1.5 rounded bg-primary" style={{ width: `${(r.count / Math.max(1, s.totalAssets)) * 100}%` }} /></div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            <Panel title="Upcoming bookings" action={<Link className="text-sm text-primary" to="/lab-booking">Calendar →</Link>}>
              {d.upcoming.length === 0 ? <p className="text-sm text-muted-foreground">No approved bookings in the next 7 days.</p> : d.upcoming.map((b: any) => (
                <div key={b.id} className="border-t py-2 text-sm first:border-0"><div className="font-medium">{b.course}</div><div className="text-muted-foreground">{fmtDateTime(b.startTime)} · {b.lecturer.fullName}</div></div>
              ))}
            </Panel>
            <Panel title="Maintenance & warranty alerts">
              {d.urgentMaintenance.map((m: any) => (
                <div key={m.id} className="flex items-center justify-between border-t py-2 text-sm first:border-0"><div><span className="font-mono text-xs">{m.refNo}</span> {m.asset.assetTag}<div className="text-muted-foreground">{m.problem}</div></div><StatusBadge value={m.priority} /></div>
              ))}
              {d.warranty.map((w: any) => (
                <div key={w.id} className="flex items-center justify-between border-t py-2 text-sm"><Link to={`/inventory/${w.id}`} className="hover:underline"><span className="font-mono text-xs">{w.assetTag}</span> {w.name}</Link><StatusBadge value={w.expired ? 'EXPIRED' : 'EXPIRING'} label={fmtDate(w.warrantyEnd)} /></div>
              ))}
              {!d.urgentMaintenance.length && !d.warranty.length && <p className="text-sm text-muted-foreground">No alerts.</p>}
            </Panel>
          </div>
          <Panel title="Recent activity" className="mt-6">
            <ol className="space-y-3 border-l-2 border-accent pl-4 text-sm">
              {d.activity.map((a: any) => <li key={a.id}><span className="font-medium">{a.action}</span> <span className="text-muted-foreground">· {a.module} · {a.user?.fullName ?? 'system'} · {fmtDateTime(a.createdAt)}</span></li>)}
            </ol>
          </Panel>
        </>
      )}
    </QueryBoundary>
  );
}

function Mine() {
  const { can } = useAuth();
  const q = useList<any>('/dashboard/me');
  const showLoans = can('loan:request');
  const showBookings = can('booking:request');
  if (!showLoans && !showBookings) return null;
  return (
    <div className="mt-8">
      <h2 className="mb-3 text-xl font-semibold">My activity</h2>
      <QueryBoundary q={q}>
        {q.data && (
          <div className="grid gap-6 lg:grid-cols-2">
            {showLoans && (
              <Panel title="My equipment" action={<Link className="text-sm text-primary" to="/requests">Requests →</Link>}>
                {q.data.loans.length === 0 ? <p className="text-sm text-muted-foreground">No active requests or loans.</p> : q.data.loans.map((l: any) => (
                  <div key={l.id} className="flex items-center justify-between border-t py-2 text-sm first:border-0">
                    <div><span className="font-mono text-xs">{l.refNo}</span> {l.items.map((i: any) => i.asset.name).join(', ')}<div className="text-muted-foreground">due {fmtDateTime(l.dueAt)}</div></div>
                    <StatusBadge value={l.isOverdue ? 'OVERDUE' : l.status} />
                  </div>
                ))}
              </Panel>
            )}
            {showBookings && (
              <Panel title="My lab bookings" action={<Link className="text-sm text-primary" to="/lab-booking">Book a slot →</Link>}>
                {q.data.bookings.length === 0 ? <p className="text-sm text-muted-foreground">No upcoming bookings.</p> : q.data.bookings.map((b: any) => (
                  <div key={b.id} className="flex items-center justify-between border-t py-2 text-sm first:border-0"><div><div className="font-medium">{b.course}</div><div className="text-muted-foreground">{fmtDateTime(b.startTime)}</div></div><StatusBadge value={b.status} /></div>
                ))}
              </Panel>
            )}
          </div>
        )}
      </QueryBoundary>
    </div>
  );
}
