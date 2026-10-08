import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { DataTable, Field, NativeSelect, PageHeader, QueryBoundary, StatusBadge } from '@/components/common';
import { FormDialog } from '@/components/FormDialog';
import { Button } from '@/components/ui/button';
import { useAction, useList } from '@/hooks/useApi';
import { patch } from '@/lib/api';
import { humanize, money } from '@/lib/format';
import { fmtDateTime } from '@/lib/time';

export default function Damage() {
  const [tab, setTab] = useState('damage'); const [page, setPage] = useState(1);
  const [edit, setEdit] = useState<{ kind: 'damage' | 'lost'; row: any } | null>(null);
  const dmg = useList<any>('/damage', { page, pageSize: 15 });
  const lost = useList<any[]>('/lost');
  return (
    <>
      <PageHeader title="Damage & lost assets" sub="Records are never deleted – status and investigation notes are updated over time. Report damage or missing items from the asset page." />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList><TabsTrigger value="damage">Damage reports</TabsTrigger><TabsTrigger value="lost">Missing / lost</TabsTrigger></TabsList>
        <TabsContent value="damage" className="mt-4">
          <QueryBoundary q={dmg}>
            <DataTable rows={dmg.data?.rows ?? []} page={dmg.data?.page} pageSize={dmg.data?.pageSize} total={dmg.data?.total} onPage={setPage} columns={[
              { key: 'refNo', header: 'Ref', render: (r: any) => <span className="font-mono text-xs">{r.refNo}</span> },
              { key: 'asset', header: 'Asset', render: (r: any) => <Link className="hover:underline" to={`/inventory/${r.asset.id}`}><span className="font-mono text-xs">{r.asset.assetTag}</span> {r.asset.name}</Link> },
              { key: 'description', header: 'Description', render: (r: any) => <span className="line-clamp-2 max-w-xs">{r.description}</span> },
              { key: 'severity', header: 'Severity', render: (r: any) => <StatusBadge value={r.severity} /> },
              { key: 'cost', header: 'Est. cost', render: (r: any) => money(r.estimatedCost) },
              { key: 'status', header: 'Status', render: (r: any) => <StatusBadge value={r.status} /> },
              { key: 'by', header: 'Reported', render: (r: any) => <div className="text-xs">{r.reporter.fullName}<br />{fmtDateTime(r.reportedAt)}</div> },
              { key: 'a', header: '', render: (r: any) => <Button size="sm" variant="outline" onClick={() => setEdit({ kind: 'damage', row: r })}>Update</Button> },
            ]} />
          </QueryBoundary>
        </TabsContent>
        <TabsContent value="lost" className="mt-4">
          <QueryBoundary q={lost}>
            <DataTable rows={lost.data ?? []} columns={[
              { key: 'refNo', header: 'Ref', render: (r: any) => <span className="font-mono text-xs">{r.refNo}</span> },
              { key: 'asset', header: 'Asset', render: (r: any) => <Link className="hover:underline" to={`/inventory/${r.asset.id}`}><span className="font-mono text-xs">{r.asset.assetTag}</span> {r.asset.name}</Link> },
              { key: 'user', header: 'Last known user', render: (r: any) => r.lastKnownUser ?? '—' }, { key: 'loc', header: 'Last location', render: (r: any) => r.lastKnownLocation ?? '—' },
              { key: 'inv', header: 'Investigation', render: (r: any) => <span className="line-clamp-2 max-w-xs">{r.investigation ?? '—'}</span> },
              { key: 'rec', header: 'Recovery', render: (r: any) => <StatusBadge value={r.recovery} /> },
              { key: 'a', header: '', render: (r: any) => <Button size="sm" variant="outline" onClick={() => setEdit({ kind: 'lost', row: r })}>Update</Button> },
            ]} />
          </QueryBoundary>
        </TabsContent>
      </Tabs>
      {edit && <UpdateDialog key={edit.row.id} {...edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function UpdateDialog({ kind, row, onClose }: { kind: 'damage' | 'lost'; row: any; onClose: () => void }) {
  const [status, setStatus] = useState(kind === 'damage' ? row.status : row.recovery);
  const [notes, setNotes] = useState(kind === 'damage' ? row.investigationNotes ?? '' : row.investigation ?? '');
  const opts = kind === 'damage' ? ['REPORTED', 'INVESTIGATING', 'RESOLVED'] : ['INVESTIGATING', 'RECOVERED', 'NOT_RECOVERED', 'WRITTEN_OFF'];
  const m = useAction(() => (kind === 'damage' ? patch(`/damage/${row.id}`, { status, investigationNotes: notes }) : patch(`/lost/${row.id}`, { recovery: status, investigation: notes })), { success: 'Updated', invalidate: ['/damage', '/lost', '/assets', '/dashboard'], onSuccess: onClose });
  return (
    <FormDialog open onOpenChange={(o) => !o && onClose()} title={`Update ${row.refNo}`} onSubmit={(e) => { e.preventDefault(); m.mutate(); }} busy={m.isPending}>
      <Field label={kind === 'damage' ? 'Status' : 'Recovery status'}><NativeSelect value={status} onChange={(e) => setStatus(e.target.value)} options={opts.map((o) => ({ value: o, label: humanize(o) }))} /></Field>
      <Field label="Investigation notes"><Textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      {kind === 'lost' && <p className="text-xs text-muted-foreground">Marking as Recovered sends the asset to inspection before it can be used again.</p>}
    </FormDialog>
  );
}
