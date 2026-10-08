import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ConfirmDialog, DataTable, Field, PageHeader, Panel, QueryBoundary, StatusBadge } from '@/components/common';
import { useAuth } from '@/lib/auth';
import { useAction, useList } from '@/hooks/useApi';
import { useDebounced } from '@/hooks/useDebounced';
import { post } from '@/lib/api';
import { loanSchema } from '@/lib/schemas';
import { fmtDateTime, zonedToUtcIso } from '@/lib/time';

type Sel = { id: string; assetTag: string; name: string; quantity: number; max: number; consumable: boolean };
const toIso = (local: string) => { const [d, t] = local.split('T'); return zonedToUtcIso(d, t); };

export default function Requests() {
  const { user } = useAuth();
  const [sel, setSel] = useState<Sel[]>([]);
  const [search, setSearch] = useState(''); const s = useDebounced(search);
  const [cancel, setCancel] = useState<any>(null);
  const avail = useList<any>('/assets', { status: 'AVAILABLE', search: s, pageSize: 8 });
  const mine = useList<any>('/loans', { mine: 'true', pageSize: 50 });
  const { register, handleSubmit, reset, formState: { errors } } = useForm<z.input<typeof loanSchema>>({ resolver: zodResolver(loanSchema) });

  const submit = useAction((v: z.output<typeof loanSchema>) => post('/loans', { purpose: v.purpose, useLocation: v.useLocation, notes: v.notes || undefined, requiredFrom: toIso(v.requiredFrom), dueAt: toIso(v.dueAt), items: sel.map((i) => ({ assetId: i.id, quantity: i.quantity })) }),
    { success: 'Request submitted – the lab staff will review it', invalidate: ['/loans', '/dashboard'], onSuccess: () => { setSel([]); reset(); } });
  const cancelM = useAction((id: string) => post(`/loans/${id}/cancel`), { success: 'Request cancelled', invalidate: ['/loans'] });

  return (
    <>
      <PageHeader title="Equipment requests" sub={`${user?.fullName} · ${user?.universityId ?? ''} · ${user?.department ?? ''}`} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="1. Choose equipment">
          <Input aria-label="Search equipment" placeholder="Search available equipment…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="mt-3 max-h-64 overflow-auto">
            <QueryBoundary q={avail} isEmpty={!avail.data?.rows.length} empty={<p className="py-4 text-sm text-muted-foreground">No available items match.</p>}>
              {avail.data?.rows.map((a: any) => (
                <div key={a.id} className="flex items-center justify-between border-t py-2 text-sm first:border-0">
                  <div><div>{a.name}</div><div className="font-mono text-xs text-muted-foreground">{a.assetTag} · {a.location?.name ?? '—'}{a.isConsumable ? ` · ${a.quantity} in stock` : ''}</div></div>
                  <Button size="sm" variant="outline" disabled={sel.some((x) => x.id === a.id)} onClick={() => setSel([...sel, { id: a.id, assetTag: a.assetTag, name: a.name, quantity: 1, max: a.quantity, consumable: a.isConsumable }])}><Plus className="h-3.5 w-3.5" /></Button>
                </div>
              ))}
            </QueryBoundary>
          </div>
          <h3 className="mt-4 text-sm font-semibold">Selected ({sel.length})</h3>
          {sel.length === 0 ? <p className="text-sm text-muted-foreground">Nothing selected yet.</p> : sel.map((i) => (
            <div key={i.id} className="mt-1 flex items-center gap-2 text-sm">
              <span className="flex-1">{i.name} <span className="font-mono text-xs text-muted-foreground">{i.assetTag}</span></span>
              {i.consumable && <Input aria-label={`Quantity of ${i.name}`} type="number" min={1} max={i.max} value={i.quantity} className="h-8 w-20" onChange={(e) => setSel(sel.map((x) => (x.id === i.id ? { ...x, quantity: Math.max(1, Math.min(i.max, +e.target.value || 1)) } : x)))} />}
              <Button size="icon" variant="ghost" aria-label={`Remove ${i.name}`} onClick={() => setSel(sel.filter((x) => x.id !== i.id))}><X className="h-4 w-4" /></Button>
            </div>
          ))}
        </Panel>
        <Panel title="2. Request details">
          <form className="space-y-3" noValidate onSubmit={handleSubmit((v) => { if (!sel.length) return toast.error('Select at least one item'); submit.mutate(v as any); })}>
            <Field label="Purpose *" error={errors.purpose?.message}><Textarea rows={2} {...register('purpose')} /></Field>
            <Field label="Where will it be used? *" error={errors.useLocation?.message}><Input {...register('useLocation')} /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Required from *" error={errors.requiredFrom?.message}><Input type="datetime-local" {...register('requiredFrom')} /></Field>
              <Field label="Expected return *" error={errors.dueAt?.message}><Input type="datetime-local" {...register('dueAt')} /></Field>
            </div>
            <Field label="Additional notes"><Textarea rows={2} {...register('notes')} /></Field>
            <label className="flex items-start gap-2 text-xs text-muted-foreground"><input type="checkbox" className="mt-0.5" {...register('agree')} />I agree to return the equipment on time and in the same condition.</label>
            {errors.agree && <p role="alert" className="text-xs text-destructive">{errors.agree.message}</p>}
            <Button type="submit" disabled={submit.isPending}>{submit.isPending ? 'Submitting…' : 'Submit request'}</Button>
            <p className="text-xs text-muted-foreground">Times are in lab time (Asia/Colombo).</p>
          </form>
        </Panel>
      </div>
      <h2 className="mb-3 mt-8 text-xl font-semibold">My requests & loans</h2>
      <QueryBoundary q={mine}>
        <DataTable rows={mine.data?.rows ?? []} columns={[
          { key: 'refNo', header: 'Ref', render: (r: any) => <span className="font-mono text-xs">{r.refNo}</span> },
          { key: 'items', header: 'Items', render: (r: any) => r.items.map((i: any) => i.asset.name).join(', ') },
          { key: 'when', header: 'Period', render: (r: any) => `${fmtDateTime(r.requiredFrom)} → ${fmtDateTime(r.dueAt)}` },
          { key: 'status', header: 'Status', render: (r: any) => <div><StatusBadge value={r.isOverdue ? 'OVERDUE' : r.status} />{r.rejectionReason && <div className="mt-1 text-xs text-destructive">{r.rejectionReason}</div>}</div> },
          { key: 'a', header: '', render: (r: any) => ['PENDING', 'APPROVED'].includes(r.status) && <Button size="sm" variant="ghost" onClick={() => setCancel(r)}>Cancel</Button> },
        ]} />
      </QueryBoundary>
      <ConfirmDialog open={!!cancel} onOpenChange={(o) => !o && setCancel(null)} destructive title={`Cancel request ${cancel?.refNo}?`} confirmLabel="Cancel request" onConfirm={() => { cancelM.mutate(cancel.id); setCancel(null); }} />
    </>
  );
}
