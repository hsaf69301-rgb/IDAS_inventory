import { useState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DataTable, EmptyState, PageHeader, Panel, QueryBoundary, ReasonDialog, StatCard, StatusBadge } from '@/components/common';
import { WeekCalendar } from '@/components/WeekCalendar';
import { useAction, useList, useOne } from '@/hooks/useApi';
import { post } from '@/lib/api';
import { fmtDateTime, mondayOf, todayLab } from '@/lib/time';

export default function Approvals() {
  const [week, setWeek] = useState(mondayOf(todayLab()));
  const [tab, setTab] = useState('APPROVED');
  const pending = useList<any>('/bookings', { status: 'PENDING', pageSize: 50 });
  const approved = useList<any>('/bookings', { status: 'APPROVED', pageSize: 1 });
  const rejected = useList<any>('/bookings', { status: 'REJECTED', pageSize: 1 });
  const hist = useList<any>('/bookings', { status: tab === 'ALL' ? undefined : tab, pageSize: 30 });
  const [reject, setReject] = useState<any>(null);
  const inv = ['/bookings', '/dashboard', '/notifications'];
  const decide = useAction((v: { id: string; approve: boolean; reason?: string }) => post(`/bookings/${v.id}/decision`, { approve: v.approve, reason: v.reason }), { success: 'Decision recorded – lecturer notified', invalidate: inv });

  return (
    <>
      <PageHeader title="Lab slot approvals" sub="Dean / Registrar · review requests against live availability" />
      <div className="mb-6 grid grid-cols-3 gap-3">
        <StatCard label="Waiting" value={pending.data?.total ?? '…'} tone="warning" /><StatCard label="Approved" value={approved.data?.total ?? '…'} /><StatCard label="Rejected" value={rejected.data?.total ?? '…'} />
      </div>
      <h2 className="mb-3 text-xl font-semibold">Waiting for your decision</h2>
      <QueryBoundary q={pending} isEmpty={!pending.data?.rows.length} empty={<EmptyState title="No pending requests" hint="New lab booking requests will appear here and in your notifications." />}>
        <div className="space-y-4">{pending.data?.rows.map((b: any) => <PendingCard key={b.id} id={b.id} onApprove={() => decide.mutate({ id: b.id, approve: true })} onReject={() => setReject(b)} busy={decide.isPending} />)}</div>
      </QueryBoundary>
      <h2 className="mb-3 mt-10 text-xl font-semibold">Calendar</h2>
      <WeekCalendar weekStart={week} onWeekChange={setWeek} />
      <h2 className="mb-3 mt-10 text-xl font-semibold">Booking history</h2>
      <Tabs value={tab} onValueChange={setTab}><TabsList>{[['APPROVED', 'Approved'], ['REJECTED', 'Rejected'], ['CANCELLED', 'Cancelled'], ['ALL', 'All']].map(([v, l]) => <TabsTrigger key={v} value={v}>{l}</TabsTrigger>)}</TabsList></Tabs>
      <div className="mt-3">
        <QueryBoundary q={hist}>
          <DataTable rows={hist.data?.rows ?? []} columns={[
            { key: 'refNo', header: 'Ref', render: (r: any) => <span className="font-mono text-xs">{r.refNo}</span> },
            { key: 'course', header: 'Session', render: (r: any) => <div><div className="font-medium">{r.course}</div><div className="text-xs text-muted-foreground">{r.lecturer.fullName} · {r.studentCount} students</div></div> },
            { key: 'when', header: 'When', render: (r: any) => <span className="text-xs">{fmtDateTime(r.startTime)} → {fmtDateTime(r.endTime)}</span> },
            { key: 'status', header: 'Status', render: (r: any) => <StatusBadge value={r.status} /> },
            { key: 'hist', header: 'Approval history', render: (r: any) => <ul className="text-xs text-muted-foreground">{r.approvals.map((a: any) => <li key={a.id}>{a.action.toLowerCase()} · {fmtDateTime(a.at)}{a.reason ? ` – ${a.reason}` : ''}</li>)}</ul> },
          ]} />
        </QueryBoundary>
      </div>
      <ReasonDialog open={!!reject} onOpenChange={(o) => !o && setReject(null)} title={`Reject ${reject?.refNo}`} confirmLabel="Reject request" onSubmit={(reason) => { decide.mutate({ id: reject.id, approve: false, reason }); setReject(null); }} />
    </>
  );
}

function PendingCard({ id, onApprove, onReject, busy }: { id: string; onApprove: () => void; onReject: () => void; busy: boolean }) {
  const q = useOne<any>(`/bookings/${id}`);
  const b = q.data;
  return (
    <Panel>
      <QueryBoundary q={q}>
        {b && (
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="text-sm lg:col-span-2">
              <div className="flex items-center gap-2"><h3 className="text-lg font-semibold">{b.course}</h3><span className="font-mono text-xs text-muted-foreground">{b.refNo} · {b.moduleCode}</span></div>
              <dl className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
                <div><dt className="inline text-muted-foreground">Lecturer: </dt><dd className="inline">{b.lecturer.fullName} ({b.staffId})</dd></div>
                <div><dt className="inline text-muted-foreground">Department: </dt><dd className="inline">{b.department}</dd></div>
                <div><dt className="inline text-muted-foreground">When: </dt><dd className="inline">{fmtDateTime(b.startTime)} → {fmtDateTime(b.endTime)}</dd></div>
                <div><dt className="inline text-muted-foreground">Batch: </dt><dd className="inline">{b.batchYear} · {b.studentCount} students</dd></div>
                <div><dt className="inline text-muted-foreground">Computers: </dt><dd className="inline">{b.computersNeeded}</dd></div>
                <div><dt className="inline text-muted-foreground">Equipment: </dt><dd className="inline">{b.requestedResources.length ? b.requestedResources.map((r: any) => `${r.name} ×${r.quantity}`).join(', ') : 'none'}</dd></div>
                {b.software && <div><dt className="inline text-muted-foreground">Software: </dt><dd className="inline">{b.software}</dd></div>}
                {b.osSpecs && <div><dt className="inline text-muted-foreground">OS / specs: </dt><dd className="inline">{b.osSpecs}</dd></div>}
              </dl>
              <p className="mt-2"><span className="text-muted-foreground">Purpose: </span>{b.purpose}</p>
              {b.specialRequirements && <p className="mt-1"><span className="text-muted-foreground">Special requirements: </span>{b.specialRequirements}</p>}
            </div>
            <div className="space-y-3">
              <div className={`rounded-md border p-3 text-sm ${b.analysis.ok ? 'border-success/40 bg-success/10' : 'border-destructive/40 bg-destructive/10'}`}>
                <div className="flex items-center gap-1.5 font-medium">{b.analysis.ok ? <><CheckCircle2 className="h-4 w-4 text-success" />Available</> : <><AlertTriangle className="h-4 w-4 text-destructive" />Conflicts</>}</div>
                <div className="mt-1 text-xs text-muted-foreground">Computers free {b.analysis.computers.free}/{b.analysis.computers.total} (need {b.analysis.computers.requested}){b.analysis.resources.map((r: any) => ` · ${r.name} ${r.free}/${r.requested}`).join('')}</div>
                {b.analysis.conflicts.map((c: any, i: number) => <div key={i} className="mt-1 text-xs text-destructive">• {c.message}</div>)}
                {b.analysis.overlapping.filter((o: any) => o.status === 'PENDING').map((o: any) => <div key={o.id} className="mt-1 text-xs text-accent-foreground">Competing pending request: {o.refNo} {o.course} ({o.lecturer})</div>)}
              </div>
              <div className="flex gap-2"><Button disabled={busy || !b.analysis.ok} onClick={onApprove}>Approve</Button><Button variant="outline" disabled={busy} onClick={onReject}>Reject</Button></div>
              {!b.analysis.ok && <p className="text-xs text-muted-foreground">Approval is blocked while conflicts exist. Reject with a reason or ask the lecturer to modify the request.</p>}
            </div>
          </div>
        )}
      </QueryBoundary>
    </Panel>
  );
}
