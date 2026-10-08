import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DataTable, Field, NativeSelect, PageHeader, Panel, QueryBoundary, StatusBadge } from '@/components/common';
import { FormDialog } from '@/components/FormDialog';
import { useAuth } from '@/lib/auth';
import { useAction, useList, useOne } from '@/hooks/useApi';
import { post } from '@/lib/api';
import { CONDITIONS, MAINT_STEPS, PRIORITIES, humanize, money } from '@/lib/format';
import { fmtDateTime } from '@/lib/time';

const NEXT: Record<string, string> = { REPORTED: 'DIAGNOSING', DIAGNOSING: 'ASSIGNED', ASSIGNED: 'UNDER_REPAIR', UNDER_REPAIR: 'REPAIRED', REPAIRED: 'AWAITING_VERIFICATION', VERIFIED: 'CLOSED' };

export default function Maintenance() {
  const { can } = useAuth();
  const [tab, setTab] = useState('open'); const [page, setPage] = useState(1);
  const [sel, setSel] = useState<string | null>(null); const [creating, setCreating] = useState(false);
  const q = useList<any>('/maintenance', { open: tab === 'open' ? 'true' : undefined, status: tab === 'CLOSED' ? 'CLOSED' : undefined, page, pageSize: 15 });
  return (
    <>
      <PageHeader title="Maintenance & repairs" sub="Reported → Diagnosing → Assigned → Under repair → Repaired → Awaiting verification → Verified → Closed" action={can('maintenance:report') && <Button onClick={() => setCreating(true)}><Plus className="mr-1 h-4 w-4" />Report fault</Button>} />
      <Tabs value={tab} onValueChange={(v) => { setTab(v); setPage(1); }}><TabsList><TabsTrigger value="open">Open</TabsTrigger><TabsTrigger value="CLOSED">Closed</TabsTrigger><TabsTrigger value="all">All</TabsTrigger></TabsList></Tabs>
      <div className="mt-4">
        <QueryBoundary q={q}>
          <DataTable rows={q.data?.rows ?? []} page={q.data?.page} pageSize={q.data?.pageSize} total={q.data?.total} onPage={setPage} onRowClick={(r: any) => setSel(r.id)} columns={[
            { key: 'refNo', header: 'Ref', render: (r: any) => <span className="font-mono text-xs">{r.refNo}</span> },
            { key: 'asset', header: 'Asset', render: (r: any) => <div><span className="font-mono text-xs">{r.asset.assetTag}</span> {r.asset.name}</div> },
            { key: 'problem', header: 'Problem', render: (r: any) => <span className="line-clamp-2 max-w-xs">{r.problem}</span> },
            { key: 'priority', header: 'Priority', render: (r: any) => <StatusBadge value={r.priority} /> },
            { key: 'status', header: 'Status', render: (r: any) => <StatusBadge value={r.status} /> },
            { key: 'tech', header: 'Technician', render: (r: any) => r.technician?.fullName ?? '—' },
            { key: 'cost', header: 'Cost', render: (r: any) => money(r.cost) },
          ]} />
        </QueryBoundary>
      </div>
      <ReportDialog open={creating} onClose={() => setCreating(false)} />
      <Detail id={sel} onClose={() => setSel(null)} />
    </>
  );
}

function ReportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tag, setTag] = useState(''); const [problem, setProblem] = useState(''); const [priority, setPriority] = useState('MEDIUM');
  const found = useList<any>('/assets', { search: tag, pageSize: 6 }, { enabled: tag.length >= 2 });
  const [asset, setAsset] = useState<any>(null);
  const m = useAction(() => post('/maintenance', { assetId: asset.id, problem, priority }), { success: 'Maintenance job opened', invalidate: ['/maintenance', '/assets', '/dashboard'], onSuccess: () => { onClose(); setAsset(null); setTag(''); setProblem(''); } });
  return (
    <FormDialog open={open} onOpenChange={(o) => !o && onClose()} title="Report a fault" onSubmit={(e) => { e.preventDefault(); if (asset && problem.length >= 3) m.mutate(); }} busy={m.isPending}>
      <Field label="Asset *">
        {asset ? <div className="flex items-center justify-between rounded border p-2 text-sm"><span><span className="font-mono text-xs">{asset.assetTag}</span> {asset.name}</span><Button type="button" size="sm" variant="ghost" onClick={() => setAsset(null)}>Change</Button></div> : (
          <>
            <Input placeholder="Search asset tag or name…" value={tag} onChange={(e) => setTag(e.target.value)} />
            {found.data?.rows.map((a: any) => <button key={a.id} type="button" className="mt-1 block w-full rounded border p-2 text-left text-sm hover:bg-muted" onClick={() => setAsset(a)}><span className="font-mono text-xs">{a.assetTag}</span> {a.name} <StatusBadge value={a.status} /></button>)}
          </>
        )}
      </Field>
      <Field label="Problem *"><Textarea rows={3} value={problem} onChange={(e) => setProblem(e.target.value)} /></Field>
      <Field label="Priority"><NativeSelect value={priority} onChange={(e) => setPriority(e.target.value)} options={PRIORITIES.map((p) => ({ value: p, label: humanize(p) }))} /></Field>
    </FormDialog>
  );
}

function Detail({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { can } = useAuth();
  const q = useOne<any>(id ? `/maintenance/${id}` : null);
  const techs = useList<any>('/users', { role: 'TECHNICIAN', active: 'true', pageSize: 50 }, { enabled: !!id && can('user:read') });
  const m = q.data;
  const [f, setF] = useState<any>({}); const [v, setV] = useState({ testPerformed: '', testPassed: 'true', notes: '', condition: 'GOOD' });
  useEffect(() => { setF({}); }, [id, m?.status]);
  const inv = ['/maintenance', '/assets', '/dashboard', '/notifications'];
  const adv = useAction((to: string) => post(`/maintenance/${id}/advance`, { to, ...Object.fromEntries(Object.entries(f).filter(([, x]) => x !== '' && x != null)), cost: f.cost ? Number(f.cost) : undefined }), { success: 'Updated', invalidate: inv });
  const ver = useAction(() => post(`/maintenance/${id}/verify`, { testPerformed: v.testPerformed, testPassed: v.testPassed === 'true', notes: v.notes || undefined, condition: v.condition }), { success: 'Verification recorded', invalidate: inv });
  const next = m ? NEXT[m.status] : undefined;
  const canManage = can('maintenance:manage');

  return (
    <FormDialog open={!!id} onOpenChange={(o) => !o && onClose()} wide title={m ? `${m.refNo} · ${m.asset.assetTag}` : 'Maintenance'} onSubmit={(e) => { e.preventDefault(); if (next) adv.mutate(next); }} busy={adv.isPending} submitLabel={next ? `Move to ${humanize(next)}` : 'Close'}>
      <QueryBoundary q={q}>
        {m && (
          <>
            <ol className="flex flex-wrap gap-1 text-[11px]">{MAINT_STEPS.map((s) => <li key={s} className={`rounded px-2 py-0.5 font-mono uppercase ${s === m.status ? 'bg-primary text-primary-foreground' : MAINT_STEPS.indexOf(s) < MAINT_STEPS.indexOf(m.status) ? 'bg-success/20 text-success' : 'bg-muted text-muted-foreground'}`}>{humanize(s)}</li>)}</ol>
            <p className="text-sm"><b>Problem:</b> {m.problem}</p>
            <p className="text-xs text-muted-foreground">Reported by {m.reporter.fullName} · {fmtDateTime(m.reportedAt)} · <Link className="underline" to={`/inventory/${m.asset.id}`}>open asset</Link> · asset status <StatusBadge value={m.asset.status} /></p>
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              {[['Technician', m.technician?.fullName], ['Diagnosis', m.diagnosis], ['Action taken', m.actionTaken], ['Parts used', m.partsUsed], ['Cost', m.cost != null ? money(m.cost) : null], ['Repair provider', m.repairProvider], ['Repaired by', m.repairedBy], ['Repair period', m.repairStart ? `${fmtDateTime(m.repairStart)} → ${fmtDateTime(m.repairEnd)}` : null],
                ['Verified by', m.verifiedBy?.fullName], ['Verification', m.verifiedAt ? `${fmtDateTime(m.verifiedAt)} – ${m.testPassed ? 'PASSED' : 'FAILED'}` : null], ['Test performed', m.testPerformed], ['Verification notes', m.verificationNotes]].filter(([, x]) => x).map(([k, x]) => <div key={String(k)}><dt className="text-xs uppercase text-muted-foreground">{k}</dt><dd>{x}</dd></div>)}
            </dl>
            {canManage && next && (
              <Panel title="Details for this step">
                <div className="grid gap-3 sm:grid-cols-2">
                  {(m.status === 'REPORTED' || m.status === 'DIAGNOSING') && <Field label="Diagnosis" className="sm:col-span-2"><Textarea rows={2} value={f.diagnosis ?? m.diagnosis ?? ''} onChange={(e) => setF({ ...f, diagnosis: e.target.value })} /></Field>}
                  {m.status === 'DIAGNOSING' && <Field label="Assign technician *"><NativeSelect placeholder="Select…" value={f.technicianId ?? ''} onChange={(e) => setF({ ...f, technicianId: e.target.value })} options={(techs.data?.rows ?? []).map((t: any) => ({ value: t.id, label: t.fullName }))} /></Field>}
                  {m.status === 'ASSIGNED' && <Field label="Repair provider (if external)"><Input value={f.repairProvider ?? ''} onChange={(e) => setF({ ...f, repairProvider: e.target.value })} /></Field>}
                  {m.status === 'UNDER_REPAIR' && <>
                    <Field label="Action taken *" className="sm:col-span-2"><Textarea rows={2} value={f.actionTaken ?? ''} onChange={(e) => setF({ ...f, actionTaken: e.target.value })} /></Field>
                    <Field label="Parts used"><Input value={f.partsUsed ?? ''} onChange={(e) => setF({ ...f, partsUsed: e.target.value })} /></Field>
                    <Field label="Cost (LKR)"><Input type="number" min={0} value={f.cost ?? ''} onChange={(e) => setF({ ...f, cost: e.target.value })} /></Field>
                  </>}
                </div>
              </Panel>
            )}
            {can('maintenance:verify') && m.status === 'AWAITING_VERIFICATION' && (
              <Panel title="Verification – asset stays unavailable until this passes">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Test performed *" className="sm:col-span-2"><Input value={v.testPerformed} onChange={(e) => setV({ ...v, testPerformed: e.target.value })} /></Field>
                  <Field label="Result"><NativeSelect value={v.testPassed} onChange={(e) => setV({ ...v, testPassed: e.target.value })} options={[{ value: 'true', label: 'Passed' }, { value: 'false', label: 'Failed – back to repair' }]} /></Field>
                  <Field label="Condition after repair"><NativeSelect value={v.condition} onChange={(e) => setV({ ...v, condition: e.target.value })} options={CONDITIONS.map((c) => ({ value: c, label: humanize(c) }))} /></Field>
                  <Field label="Notes" className="sm:col-span-2"><Input value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} /></Field>
                </div>
                <Button type="button" className="mt-3" disabled={ver.isPending || v.testPerformed.length < 3} onClick={() => ver.mutate()}>Record verification</Button>
              </Panel>
            )}
            <div><h4 className="text-sm font-semibold">Timeline</h4><ol className="mt-1 space-y-1 border-l-2 border-accent pl-3 text-xs">{m.steps.map((s: any) => <li key={s.id}>{fmtDateTime(s.at)} · {humanize(s.toStatus)}{s.note ? ` – ${s.note}` : ''}</li>)}</ol></div>
          </>
        )}
      </QueryBoundary>
    </FormDialog>
  );
}
