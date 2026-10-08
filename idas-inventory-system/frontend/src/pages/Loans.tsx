import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DataTable, PageHeader, Panel, QueryBoundary, ReasonDialog, StatusBadge } from '@/components/common';
import { LoanActionDialog } from './AssetDetail';
import { useAction, useList } from '@/hooks/useApi';
import { post } from '@/lib/api';
import { fmtDateTime } from '@/lib/time';

const TABS = [['PENDING', 'Pending'], ['APPROVED', 'Approved'], ['ISSUED', 'On loan'], ['OVERDUE', 'Overdue'], ['RETURNED', 'Returned'], ['ALL', 'All']];

export default function Loans() {
  const [tab, setTab] = useState('PENDING'); const [page, setPage] = useState(1);
  const [reject, setReject] = useState<any>(null); const [act, setAct] = useState<{ kind: 'issue' | 'return'; id: string } | null>(null);
  const inv = ['/loans', '/assets', '/dashboard'];
  const params = tab === 'OVERDUE' ? { overdue: 'true' } : tab === 'ALL' ? {} : { status: tab };
  const q = useList<any>('/loans', { ...params, page, pageSize: 15 });
  const inspect = useList<any>('/assets', { status: 'UNDER_INSPECTION', pageSize: 20 });
  const decide = useAction((v: { id: string; approve: boolean; reason?: string }) => post(`/loans/${v.id}/decision`, { approve: v.approve, reason: v.reason }), { success: 'Decision recorded', invalidate: inv });
  const overdueJob = useAction(() => post('/loans/jobs/overdue'), { success: 'Overdue check complete', invalidate: inv });

  return (
    <>
      <PageHeader title="Loans & equipment requests" sub="Request → Approval → Issue → Active loan → Return → Inspection" action={<Button variant="outline" onClick={() => overdueJob.mutate()}>Run overdue check</Button>} />
      {!!inspect.data?.rows.length && (
        <Panel title={`Awaiting inspection (${inspect.data.total})`} className="mb-6">
          <div className="flex flex-wrap gap-2">{inspect.data.rows.map((a: any) => <Link key={a.id} to={`/inventory/${a.id}`} className="rounded border px-2 py-1 text-sm hover:bg-muted"><span className="font-mono text-xs">{a.assetTag}</span> {a.name}</Link>)}</div>
        </Panel>
      )}
      <Tabs value={tab} onValueChange={(v) => { setTab(v); setPage(1); }}><TabsList className="flex-wrap">{TABS.map(([v, l]) => <TabsTrigger key={v} value={v}>{l}</TabsTrigger>)}</TabsList></Tabs>
      <div className="mt-4">
        <QueryBoundary q={q}>
          <DataTable rows={q.data?.rows ?? []} page={q.data?.page} pageSize={q.data?.pageSize} total={q.data?.total} onPage={setPage} columns={[
            { key: 'refNo', header: 'Ref', render: (r: any) => <span className="font-mono text-xs">{r.refNo}</span> },
            { key: 'who', header: 'Borrower', render: (r: any) => <div><div className="font-medium">{r.requester.fullName}</div><div className="text-xs text-muted-foreground">{r.requester.role.label} · {r.requester.universityId ?? ''}</div></div> },
            { key: 'items', header: 'Items', render: (r: any) => <div>{r.items.map((i: any) => <div key={i.id}><Link className="hover:underline" to={`/inventory/${i.asset.id}`}><span className="font-mono text-xs">{i.asset.assetTag}</span> {i.asset.name}{i.quantity > 1 ? ` ×${i.quantity}` : ''}</Link></div>)}</div> },
            { key: 'purpose', header: 'Purpose / use', render: (r: any) => <div className="max-w-xs text-xs">{r.purpose}<div className="text-muted-foreground">{r.useLocation}</div></div> },
            { key: 'when', header: 'Period', render: (r: any) => <div className="text-xs">{fmtDateTime(r.requiredFrom)}<br />→ {fmtDateTime(r.dueAt)}</div> },
            { key: 'status', header: 'Status', render: (r: any) => <StatusBadge value={r.isOverdue ? 'OVERDUE' : r.status} /> },
            { key: 'a', header: 'Actions', render: (r: any) => (
              <div className="flex flex-wrap gap-1">
                {r.status === 'PENDING' && <><Button size="sm" onClick={() => decide.mutate({ id: r.id, approve: true })}>Approve</Button><Button size="sm" variant="outline" onClick={() => setReject(r)}>Reject</Button></>}
                {r.status === 'APPROVED' && <Button size="sm" onClick={() => setAct({ kind: 'issue', id: r.id })}>Issue</Button>}
                {r.status === 'ISSUED' && <Button size="sm" onClick={() => setAct({ kind: 'return', id: r.id })}>Receive return</Button>}
              </div>) },
          ]} />
        </QueryBoundary>
      </div>
      <ReasonDialog open={!!reject} onOpenChange={(o) => !o && setReject(null)} title={`Reject ${reject?.refNo}`} confirmLabel="Reject" onSubmit={(reason) => { decide.mutate({ id: reject.id, approve: false, reason }); setReject(null); }} />
      <LoanActionDialog kind={act?.kind ?? 'issue'} open={!!act} onClose={() => setAct(null)} loanId={act?.id} inv={inv} />
    </>
  );
}
