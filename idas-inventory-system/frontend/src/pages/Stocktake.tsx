import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmDialog, DataTable, Field, NativeSelect, PageHeader, Panel, QueryBoundary, StatCard, StatusBadge } from '@/components/common';
import { FormDialog } from '@/components/FormDialog';
import { useAction, useList, useOne } from '@/hooks/useApi';
import { download, post } from '@/lib/api';
import { humanize } from '@/lib/format';
import { fmtDateTime } from '@/lib/time';

const RESULTS = ['VERIFIED', 'NOT_FOUND', 'WRONG_LOCATION', 'DAMAGED', 'NEEDS_INSPECTION'];

export default function Stocktake() {
  const [sel, setSel] = useState<string | null>(null); const [creating, setCreating] = useState(false);
  const list = useList<any[]>('/stocktakes');
  return (
    <>
      <PageHeader title="Stocktaking" sub="Snapshot the inventory, verify each asset, then complete to apply the results." action={<Button onClick={() => setCreating(true)}><Plus className="mr-1 h-4 w-4" />New stocktake</Button>} />
      {sel ? <Session id={sel} onBack={() => setSel(null)} /> : (
        <QueryBoundary q={list}>
          <DataTable rows={list.data ?? []} onRowClick={(r: any) => setSel(r.id)} columns={[
            { key: 'refNo', header: 'Ref', render: (r: any) => <span className="font-mono text-xs">{r.refNo}</span> }, { key: 'title', header: 'Title' },
            { key: 'items', header: 'Assets', render: (r: any) => r._count.items }, { key: 'status', header: 'Status', render: (r: any) => <StatusBadge value={r.status} /> },
            { key: 'by', header: 'Started', render: (r: any) => `${r.startedBy.fullName} · ${fmtDateTime(r.startedAt)}` },
          ]} />
        </QueryBoundary>
      )}
      <NewDialog open={creating} onClose={() => setCreating(false)} onCreated={(id) => setSel(id)} />
    </>
  );
}

function NewDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const locs = useList<any[]>('/locations'); const [title, setTitle] = useState(''); const [loc, setLoc] = useState('');
  const m = useAction(() => post('/stocktakes', { title, locationId: loc || undefined }), { success: 'Stocktake started', invalidate: ['/stocktakes'], onSuccess: (s) => { onClose(); onCreated(s.id); setTitle(''); } });
  return (
    <FormDialog open={open} onOpenChange={(o) => !o && onClose()} title="New stocktake" onSubmit={(e) => { e.preventDefault(); if (title.length >= 3) m.mutate(); }} busy={m.isPending} submitLabel="Start">
      <Field label="Title *"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Q4 2026 full count" /></Field>
      <Field label="Scope" hint="Includes the chosen location and everything inside it"><NativeSelect value={loc} onChange={(e) => setLoc(e.target.value)} placeholder="Whole inventory" options={(locs.data ?? []).map((l) => ({ value: l.id, label: l.name }))} /></Field>
    </FormDialog>
  );
}

function Session({ id, onBack }: { id: string; onBack: () => void }) {
  const q = useOne<any>(`/stocktakes/${id}`);
  const [tag, setTag] = useState(''); const [done, setDone] = useState(false); const [filter, setFilter] = useState('');
  const inv = [`/stocktakes`, '/assets', '/lost', '/dashboard', '/notifications'];
  const check = useAction((v: { assetId?: string; assetTag?: string; result: string }) => post(`/stocktakes/${id}/check`, v), { invalidate: [`/stocktakes`] });
  const complete = useAction(() => post(`/stocktakes/${id}/complete`), { success: 'Stocktake completed', invalidate: inv });
  const s = q.data; const open = s?.status === 'OPEN';
  const rows = (s?.items ?? []).filter((i: any) => !filter || (filter === 'UNCHECKED' ? !i.result : i.result === filter));
  return (
    <QueryBoundary q={q}>
      {s && (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div><Button variant="ghost" size="sm" onClick={onBack}>← All stocktakes</Button><h2 className="text-xl font-semibold">{s.refNo} · {s.title}</h2></div>
            <div className="flex gap-2"><Button variant="outline" onClick={() => download(`/reports/stocktake?stocktakeId=${id}&format=pdf`, 'stocktake.pdf')}>PDF report</Button><Button variant="outline" onClick={() => download(`/reports/stocktake?stocktakeId=${id}&format=xlsx`, 'stocktake.xlsx')}>Excel</Button>{open && <Button onClick={() => setDone(true)}>Complete</Button>}</div></div>
          <div className="mb-4 grid grid-cols-3 gap-3 md:grid-cols-6">{Object.entries(s.summary).map(([k, v]) => <StatCard key={k} label={humanize(k)} value={v as number} />)}</div>
          {open && (
            <Panel title="Scan / quick verify" className="mb-4">
              <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (tag.trim()) { check.mutate({ assetTag: tag.trim(), result: 'VERIFIED' }, { onSuccess: () => setTag('') }); } }}>
                <Input autoFocus aria-label="Asset tag" className="max-w-xs font-mono" placeholder="Scan or type asset tag, press Enter = Verified" value={tag} onChange={(e) => setTag(e.target.value)} /><Button type="submit">Verify</Button>
              </form>
            </Panel>
          )}
          <div className="mb-2 max-w-xs"><NativeSelect aria-label="Filter results" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="All results" options={[{ value: 'UNCHECKED', label: 'Unchecked' }, ...RESULTS.map((r) => ({ value: r, label: humanize(r) }))]} /></div>
          <DataTable rows={rows} columns={[
            { key: 'tag', header: 'Asset', render: (r: any) => <span className="font-mono text-xs">{r.asset.assetTag}</span> }, { key: 'name', header: 'Name', render: (r: any) => r.asset.name },
            { key: 'loc', header: 'Recorded location', render: (r: any) => r.asset.location?.name ?? '—' },
            { key: 'result', header: 'Result', render: (r: any) => open ? (
              <NativeSelect aria-label={`Result for ${r.asset.assetTag}`} className="h-8 w-44" value={r.result ?? ''} placeholder="Unchecked" onChange={(e) => e.target.value && check.mutate({ assetId: r.asset.id, result: e.target.value })} options={RESULTS.map((x) => ({ value: x, label: humanize(x) }))} />
            ) : <StatusBadge value={r.result ?? 'PENDING'} label={r.result ? undefined : 'Unchecked'} /> },
          ]} />
          <ConfirmDialog open={done} onOpenChange={setDone} title="Complete stocktake?" description="Assets marked Not Found become Missing (with a lost report); Damaged and Needs Inspection update asset status. This cannot be undone." confirmLabel="Complete" onConfirm={() => complete.mutate()} />
        </>
      )}
    </QueryBoundary>
  );
}
