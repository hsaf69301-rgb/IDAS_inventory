import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { ArrowLeft, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ConfirmDialog, DataTable, Field, NativeSelect, PageHeader, Panel, QueryBoundary, StatusBadge } from '@/components/common';
import { FormDialog } from '@/components/FormDialog';
import { AssetFormDialog } from '@/components/AssetForm';
import { useAuth } from '@/lib/auth';
import { useAction, useList, useOne } from '@/hooks/useApi';
import { api, post } from '@/lib/api';
import { damageSchema, maintenanceSchema } from '@/lib/schemas';
import { CONDITIONS, PRIORITIES, SEVERITIES, humanize, money } from '@/lib/format';
import { fmtDate, fmtDateTime } from '@/lib/time';

type Dlg = null | 'edit' | 'move' | 'status' | 'damage' | 'fault' | 'lost' | 'inspect' | 'issue' | 'return' | 'archive';
const MANUAL_STATUSES = ['AVAILABLE', 'IN_USE', 'UNDER_INSPECTION', 'DAMAGED', 'MISSING', 'LOST', 'RETIRED', 'DISPOSED'];

export default function AssetDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { can } = useAuth();
  const q = useOne<any>(`/assets/${id}`);
  const hist = useOne<any>(q.data ? `/assets/${q.data.id}/history` : null);
  const qr = useOne<{ dataUrl: string }>(q.data ? `/assets/${q.data.id}/qr?format=json` : null);
  const [dlg, setDlg] = useState<Dlg>(null);
  const a = q.data;
  const inv = ['/assets', '/loans', '/maintenance', '/damage', '/lost', '/dashboard'];

  return (
    <>
      <Link to="/inventory" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Inventory</Link>
      <QueryBoundary q={q}>
        {a && (
          <>
            <PageHeader title={a.name} sub={`${a.assetTag} · ${a.category.name}`} action={<>
              <StatusBadge value={a.status} />
              {can('asset:write') && <Button variant="outline" size="sm" onClick={() => setDlg('edit')}>Edit</Button>}
              {can('asset:move') && <Button variant="outline" size="sm" onClick={() => setDlg('move')}>Move</Button>}
              {can('asset:write') && <Button variant="outline" size="sm" onClick={() => setDlg('status')}>Change status</Button>}
              {can('loan:manage') && a.approvedLoan && a.status === 'AVAILABLE' && <Button size="sm" onClick={() => setDlg('issue')}>Issue ({a.approvedLoan.loan.refNo})</Button>}
              {can('loan:manage') && a.activeLoan && <Button size="sm" onClick={() => setDlg('return')}>Receive return</Button>}
              {can('loan:manage') && a.status === 'UNDER_INSPECTION' && <Button size="sm" onClick={() => setDlg('inspect')}>Inspect</Button>}
              {can('damage:report') && <Button variant="outline" size="sm" onClick={() => setDlg('damage')}>Report damage</Button>}
              {can('maintenance:report') && <Button variant="outline" size="sm" onClick={() => setDlg('fault')}>Report fault</Button>}
              {can('damage:manage') && !['MISSING', 'LOST'].includes(a.status) && <Button variant="outline" size="sm" onClick={() => setDlg('lost')}>Report missing</Button>}
            </>} />
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="space-y-6 lg:col-span-2">
                <Tabs defaultValue="overview">
                  <TabsList><TabsTrigger value="overview">Overview</TabsTrigger><TabsTrigger value="history">History</TabsTrigger><TabsTrigger value="docs">Documents</TabsTrigger></TabsList>
                  <TabsContent value="overview" className="space-y-4">
                    <Panel title="Details">
                      <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                        {[['Brand / model', [a.brand, a.model].filter(Boolean).join(' ') || '—'], ['Serial number', a.serialNumber ?? '—'], ['Condition', humanize(a.condition)], ['Location', a.location?.name ?? '—'],
                          ['Responsible user', a.responsibleUser?.fullName ?? '—'], ['Quantity', a.quantity], ['Description', a.description ?? '—'], ['Notes', a.notes ?? '—']].map(([k, v]) => (
                          <div key={String(k)}><dt className="text-xs uppercase text-muted-foreground">{k}</dt><dd>{v}</dd></div>
                        ))}
                      </dl>
                      {a.activeLoan && <p className="mt-4 rounded bg-info/10 p-2 text-sm">On loan to <b>{a.activeLoan.loan.requester.fullName}</b> ({a.activeLoan.loan.refNo}), due {fmtDateTime(a.activeLoan.loan.dueAt)}</p>}
                    </Panel>
                    <Panel title="Technical specifications">
                      {a.specifications.length === 0 ? <p className="text-sm text-muted-foreground">None recorded.</p> : (
                        <dl className="grid gap-3 text-sm sm:grid-cols-2">{a.specifications.map((s: any) => <div key={s.id}><dt className="text-xs uppercase text-muted-foreground">{s.key}</dt><dd>{s.value}</dd></div>)}</dl>
                      )}
                    </Panel>
                    <Panel title="Acquisition & warranty">
                      {!a.acquisition ? <p className="text-sm text-muted-foreground">No acquisition record.</p> : (
                        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
                          {[['Acquired', fmtDate(a.acquisition.acquiredAt)], ['Supplier / donor', a.acquisition.supplier ?? '—'], ['Invoice', a.acquisition.invoiceRef ?? '—'], ['Value', money(a.acquisition.value)], ['Funding', a.acquisition.fundingSource ?? '—'], ['Warranty', a.acquisition.warrantyEnd ? `${fmtDate(a.acquisition.warrantyStart)} → ${fmtDate(a.acquisition.warrantyEnd)}` : '—']].map(([k, v]) => (
                            <div key={String(k)}><dt className="text-xs uppercase text-muted-foreground">{k}</dt><dd>{v}</dd></div>
                          ))}
                        </dl>
                      )}
                    </Panel>
                  </TabsContent>
                  <TabsContent value="history" className="space-y-4">
                    <QueryBoundary q={hist}>
                      <Panel title="Change history (old → new)">
                        <DataTable rows={(hist.data?.changes ?? []).map((c: any) => ({ ...c }))} empty={<p className="text-sm text-muted-foreground">No changes recorded.</p>} columns={[
                          { key: 'changedAt', header: 'When', render: (r: any) => fmtDateTime(r.changedAt) }, { key: 'field', header: 'Field', render: (r: any) => <span className="font-mono text-xs">{r.field}</span> },
                          { key: 'oldValue', header: 'Old', render: (r: any) => r.oldValue ?? '—' }, { key: 'newValue', header: 'New', render: (r: any) => r.newValue ?? '—' }, { key: 'changedBy', header: 'By', render: (r: any) => r.changedBy ?? 'system' },
                        ]} />
                      </Panel>
                      <Panel title="Location history">
                        <DataTable rows={hist.data?.movements ?? []} empty={<p className="text-sm text-muted-foreground">No movements.</p>} columns={[
                          { key: 'movedAt', header: 'When', render: (r: any) => fmtDateTime(r.movedAt) }, { key: 'from', header: 'From', render: (r: any) => r.from?.name ?? '—' }, { key: 'to', header: 'To', render: (r: any) => r.to?.name ?? '—' },
                          { key: 'by', header: 'By', render: (r: any) => r.movedBy?.fullName ?? '—' }, { key: 'reason', header: 'Reason', render: (r: any) => r.reason ?? '—' },
                        ]} />
                      </Panel>
                      <Panel title="Specification versions">
                        <DataTable rows={hist.data?.specifications ?? []} empty={<p className="text-sm text-muted-foreground">None.</p>} columns={[
                          { key: 'key', header: 'Spec' }, { key: 'value', header: 'Value' }, { key: 'validFrom', header: 'From', render: (r: any) => fmtDate(r.validFrom) }, { key: 'validTo', header: 'To', render: (r: any) => (r.isCurrent ? <StatusBadge value="AVAILABLE" label="Current" /> : fmtDate(r.validTo)) },
                        ]} />
                      </Panel>
                    </QueryBoundary>
                  </TabsContent>
                  <TabsContent value="docs"><Documents asset={a} canUpload={can('asset:write')} /></TabsContent>
                </Tabs>
              </div>
              <div>
                <Panel title="QR label">
                  {qr.data ? <img src={qr.data.dataUrl} alt={`QR code for ${a.assetTag}`} className="mx-auto h-44 w-44" /> : <div className="mx-auto h-44 w-44 animate-pulse rounded bg-muted" />}
                  <p className="mt-2 text-center font-mono text-sm">{a.assetTag}</p>
                  <Button variant="outline" size="sm" className="mx-auto mt-3 flex" onClick={() => window.print()}><Printer className="mr-1 h-4 w-4" />Print label</Button>
                </Panel>
                {can('asset:write') && !['BORROWED', 'RESERVED', 'OVERDUE', 'UNDER_REPAIR', 'UNDER_MAINTENANCE'].includes(a.status) && (
                  <Button variant="ghost" className="mt-4 w-full text-destructive" onClick={() => setDlg('archive')}>Archive asset</Button>
                )}
              </div>
            </div>
            <AssetFormDialog open={dlg === 'edit'} onOpenChange={(o) => !o && setDlg(null)} asset={a} />
            <MoveDialog open={dlg === 'move'} onClose={() => setDlg(null)} asset={a} inv={inv} />
            <StatusDialog open={dlg === 'status'} onClose={() => setDlg(null)} asset={a} inv={inv} />
            <DamageDialog open={dlg === 'damage'} onClose={() => setDlg(null)} asset={a} inv={inv} />
            <FaultDialog open={dlg === 'fault'} onClose={() => setDlg(null)} asset={a} inv={inv} />
            <LostDialog open={dlg === 'lost'} onClose={() => setDlg(null)} asset={a} inv={inv} />
            <InspectDialog open={dlg === 'inspect'} onClose={() => setDlg(null)} asset={a} inv={inv} />
            <LoanActionDialog kind="issue" open={dlg === 'issue'} onClose={() => setDlg(null)} loanId={a.approvedLoan?.loan.id} inv={inv} />
            <LoanActionDialog kind="return" open={dlg === 'return'} onClose={() => setDlg(null)} loanId={a.activeLoan?.loan.id} inv={inv} />
            <ArchiveConfirm open={dlg === 'archive'} onClose={() => setDlg(null)} asset={a} onDone={() => nav('/inventory')} />
          </>
        )}
      </QueryBoundary>
    </>
  );
}

type DP = { open: boolean; onClose: () => void; asset?: any; inv?: string[] };

function MoveDialog({ open, onClose, asset, inv }: DP) {
  const locs = useList<any[]>('/locations');
  const [loc, setLoc] = useState(''); const [reason, setReason] = useState('');
  const m = useAction(() => post(`/assets/${asset.id}/move`, { locationId: loc, reason: reason || undefined }), { success: 'Asset moved', invalidate: inv, onSuccess: onClose });
  return (
    <FormDialog open={open} onOpenChange={(o) => !o && onClose()} title="Move asset" description={`Currently: ${asset.location?.name ?? 'unassigned'}`} onSubmit={(e) => { e.preventDefault(); if (loc) m.mutate(); }} busy={m.isPending} submitLabel="Move">
      <Field label="New location"><NativeSelect required placeholder="Select…" value={loc} onChange={(e) => setLoc(e.target.value)} options={(locs.data ?? []).filter((l) => l.id !== asset.locationId).map((l) => ({ value: l.id, label: l.parent ? `${l.parent.name} → ${l.name}` : l.name }))} /></Field>
      <Field label="Reason"><Input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
    </FormDialog>
  );
}

function StatusDialog({ open, onClose, asset, inv }: DP) {
  const [status, setStatus] = useState('RETIRED'); const [reason, setReason] = useState('');
  const m = useAction(() => post(`/assets/${asset.id}/status`, { status, reason: reason || undefined }), { success: 'Status updated', invalidate: inv, onSuccess: onClose });
  return (
    <FormDialog open={open} onOpenChange={(o) => !o && onClose()} title="Change status" description="Borrowed, reserved and repair statuses are set automatically by their workflows. An asset cannot become Available while a repair is unverified." onSubmit={(e) => { e.preventDefault(); m.mutate(); }} busy={m.isPending}>
      <Field label="Status"><NativeSelect value={status} onChange={(e) => setStatus(e.target.value)} options={MANUAL_STATUSES.map((s) => ({ value: s, label: humanize(s) }))} /></Field>
      <Field label="Reason"><Input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
    </FormDialog>
  );
}

function DamageDialog({ open, onClose, asset, inv }: DP) {
  const { register, handleSubmit, reset, formState: { errors } } = useForm<z.input<typeof damageSchema>>({ resolver: zodResolver(damageSchema), defaultValues: { assetId: asset.id, severity: 'MINOR' } });
  useEffect(() => { if (open) reset({ assetId: asset.id, severity: 'MINOR' }); }, [open, asset.id, reset]);
  const m = useAction((v: any) => post('/damage', { ...v, estimatedCost: v.estimatedCost === '' || v.estimatedCost == null ? undefined : Number(v.estimatedCost), location: v.location || undefined }), { success: 'Damage reported', invalidate: inv, onSuccess: onClose });
  return (
    <FormDialog open={open} onOpenChange={(o) => !o && onClose()} title="Report damage" description="Major or critical damage automatically opens a maintenance job." onSubmit={handleSubmit((v) => m.mutate(v))} busy={m.isPending}>
      <Field label="What happened? *" error={errors.description?.message}><Textarea rows={3} {...register('description')} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Severity *" error={errors.severity?.message}><NativeSelect options={SEVERITIES.map((s) => ({ value: s, label: humanize(s) }))} {...register('severity')} /></Field>
        <Field label="Est. cost (LKR)" error={errors.estimatedCost?.message as string}><Input type="number" min={0} {...register('estimatedCost')} /></Field>
      </div>
      <Field label="Where"><Input {...register('location')} /></Field>
    </FormDialog>
  );
}

function FaultDialog({ open, onClose, asset, inv }: DP) {
  const { register, handleSubmit, reset, formState: { errors } } = useForm<z.input<typeof maintenanceSchema>>({ resolver: zodResolver(maintenanceSchema), defaultValues: { assetId: asset.id, priority: 'MEDIUM' } });
  useEffect(() => { if (open) reset({ assetId: asset.id, priority: 'MEDIUM' }); }, [open, asset.id, reset]);
  const m = useAction((v: any) => post('/maintenance', v), { success: 'Fault reported – maintenance job opened', invalidate: inv, onSuccess: onClose });
  return (
    <FormDialog open={open} onOpenChange={(o) => !o && onClose()} title="Report a fault" onSubmit={handleSubmit((v) => m.mutate(v))} busy={m.isPending}>
      <Field label="Problem *" error={errors.problem?.message}><Textarea rows={3} {...register('problem')} /></Field>
      <Field label="Priority"><NativeSelect options={PRIORITIES.map((s) => ({ value: s, label: humanize(s) }))} {...register('priority')} /></Field>
    </FormDialog>
  );
}

function LostDialog({ open, onClose, asset, inv }: DP) {
  const [f, setF] = useState({ lastKnownUser: '', lastKnownLocation: '', investigation: '', lost: false });
  const m = useAction(() => post('/lost', { assetId: asset.id, lastKnownUser: f.lastKnownUser || undefined, lastKnownLocation: f.lastKnownLocation || undefined, investigation: f.investigation || undefined, lost: f.lost }), { success: 'Reported', invalidate: inv, onSuccess: onClose });
  return (
    <FormDialog open={open} onOpenChange={(o) => !o && onClose()} title="Report missing / lost asset" onSubmit={(e) => { e.preventDefault(); m.mutate(); }} busy={m.isPending} destructive submitLabel="Report">
      <Field label="Last known user"><Input value={f.lastKnownUser} onChange={(e) => setF({ ...f, lastKnownUser: e.target.value })} /></Field>
      <Field label="Last known location"><Input value={f.lastKnownLocation} onChange={(e) => setF({ ...f, lastKnownLocation: e.target.value })} /></Field>
      <Field label="Investigation notes"><Textarea rows={2} value={f.investigation} onChange={(e) => setF({ ...f, investigation: e.target.value })} /></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.lost} onChange={(e) => setF({ ...f, lost: e.target.checked })} />Treat as permanently lost (otherwise "missing")</label>
    </FormDialog>
  );
}

function InspectDialog({ open, onClose, asset, inv }: DP) {
  const [passed, setPassed] = useState(true); const [cond, setCond] = useState('GOOD'); const [notes, setNotes] = useState('');
  const m = useAction(() => post(`/loans/inspect/${asset.id}`, { passed, conditionFound: cond, damageNotes: notes || undefined }), { success: passed ? 'Inspection passed – asset available' : 'Failed inspection – maintenance opened', invalidate: inv, onSuccess: onClose });
  return (
    <FormDialog open={open} onOpenChange={(o) => !o && onClose()} title="Post-return inspection" onSubmit={(e) => { e.preventDefault(); m.mutate(); }} busy={m.isPending}>
      <Field label="Result"><NativeSelect value={passed ? 'pass' : 'fail'} onChange={(e) => setPassed(e.target.value === 'pass')} options={[{ value: 'pass', label: 'Passed – return to stock' }, { value: 'fail', label: 'Failed – needs maintenance/repair' }]} /></Field>
      <Field label="Condition found"><NativeSelect value={cond} onChange={(e) => setCond(e.target.value)} options={CONDITIONS.map((c) => ({ value: c, label: humanize(c) }))} /></Field>
      <Field label={passed ? 'Notes' : 'Problem found *'}><Textarea rows={3} required={!passed} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
    </FormDialog>
  );
}

export function LoanActionDialog({ kind, open, onClose, loanId, inv }: { kind: 'issue' | 'return'; open: boolean; onClose: () => void; loanId?: string; inv: string[] }) {
  const loan = useOne<any>(open && loanId ? `/loans/${loanId}` : null);
  const [text, setText] = useState('');
  const [conds, setConds] = useState<Record<string, string>>({});
  const m = useAction(() => post(`/loans/${loanId}/${kind}`, kind === 'issue' ? { accessories: text || undefined, conditions: conds } : { missingAccessories: text || undefined, conditions: conds }),
    { success: kind === 'issue' ? 'Equipment issued' : 'Return recorded – asset is awaiting inspection', invalidate: inv, onSuccess: onClose });
  return (
    <FormDialog open={open} onOpenChange={(o) => !o && onClose()} wide title={kind === 'issue' ? `Issue equipment ${loan.data?.refNo ?? ''}` : `Receive return ${loan.data?.refNo ?? ''}`} onSubmit={(e) => { e.preventDefault(); m.mutate(); }} busy={m.isPending} submitLabel={kind === 'issue' ? 'Issue' : 'Record return'}>
      {loan.data && (
        <>
          <p className="text-sm">Borrower: <b>{loan.data.requester.fullName}</b> ({loan.data.requester.universityId ?? '—'}) · due {fmtDateTime(loan.data.dueAt)}</p>
          {loan.data.items.map((i: any) => (
            <div key={i.id} className="grid items-center gap-2 sm:grid-cols-2"><span className="text-sm"><span className="font-mono text-xs">{i.asset.assetTag}</span> {i.asset.name}</span>
              <NativeSelect aria-label={`Condition of ${i.asset.assetTag}`} value={conds[i.assetId] ?? ''} onChange={(e) => setConds({ ...conds, [i.assetId]: e.target.value })} placeholder={kind === 'issue' ? 'Condition before issue (default: recorded)' : 'Condition after return'} options={CONDITIONS.map((c) => ({ value: c, label: humanize(c) }))} /></div>
          ))}
          <Field label={kind === 'issue' ? 'Accessories handed over' : 'Missing accessories'}><Input value={text} onChange={(e) => setText(e.target.value)} /></Field>
        </>
      )}
    </FormDialog>
  );
}

function ArchiveConfirm({ open, onClose, asset, onDone }: DP & { onDone: () => void }) {
  const m = useAction(() => api(`/assets/${asset.id}`, { method: 'DELETE' }), { success: 'Asset archived', invalidate: ['/assets'], onSuccess: onDone });
  return <ConfirmDialog open={open} onOpenChange={(o) => !o && onClose()} destructive title={`Archive ${asset.assetTag}?`} description="Archived assets are hidden from lists but their full history is kept. Records are never deleted." confirmLabel="Archive" onConfirm={() => m.mutate()} />;
}

function Documents({ asset, canUpload }: { asset: any; canUpload: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const up = useAction(async (file: File) => { const fd = new FormData(); fd.append('file', file); return api(`/assets/${asset.id}/documents`, { method: 'POST', body: fd }); }, { success: 'Uploaded', invalidate: ['/assets'] });
  return (
    <Panel title="Photos & documents" action={canUpload && <><input ref={ref} type="file" hidden accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => { const f = e.target.files?.[0]; if (f) up.mutate(f); e.target.value = ''; }} /><Button size="sm" onClick={() => ref.current?.click()} disabled={up.isPending}>Upload</Button></>}>
      {asset.documents.length === 0 ? <p className="text-sm text-muted-foreground">No files. JPG, PNG, WEBP or PDF up to 5 MB.</p> : (
        <ul className="space-y-2 text-sm">{asset.documents.map((d: any) => <DocLink key={d.id} d={d} />)}</ul>
      )}
    </Panel>
  );
}

function DocLink({ d }: { d: any }) {
  const [busy, setBusy] = useState(false);
  return (
    <li className="flex items-center justify-between border-t py-2 first:border-0">
      <span>{d.fileName} <span className="text-xs text-muted-foreground">({Math.round(d.sizeBytes / 1024)} KB)</span></span>
      <Button size="sm" variant="outline" disabled={busy} onClick={async () => { setBusy(true); try { const { download } = await import('@/lib/api'); await download(`/assets/documents/${d.id}/file`, d.fileName); } finally { setBusy(false); } }}>Download</Button>
    </li>
  );
}
