import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DataTable, NativeSelect, PageHeader, QueryBoundary } from '@/components/common';
import { useList } from '@/hooks/useApi';
import { get } from '@/lib/api';
import { useDebounced } from '@/hooks/useDebounced';
import { fmtDateTime } from '@/lib/time';

const MODULES = ['auth', 'users', 'assets', 'categories', 'locations', 'loans', 'bookings', 'maintenance', 'damage', 'lost', 'stocktakes', 'settings', 'reports'];

export default function Audit() {
  const [module, setModule] = useState(''); const [action, setAction] = useState(''); const a = useDebounced(action); const [page, setPage] = useState(1); const [open, setOpen] = useState<string | null>(null);
  const q = useList<any>('/audit', { module, action: a, page, pageSize: 25 });
  const verify = async () => { try { const r = await get('/audit/verify'); r.ok ? toast.success(`Audit chain intact (${r.checked} entries verified)`) : toast.error(`Tampering detected at entry ${r.brokenAt}`); } catch (e: any) { toast.error(e.message); } };
  return (
    <>
      <PageHeader title="Audit log" sub="Append-only and hash-chained. Entries cannot be edited or deleted – not even by administrators." action={<Button variant="outline" onClick={verify}><ShieldCheck className="mr-1 h-4 w-4" />Verify integrity</Button>} />
      <div className="mb-3 grid gap-2 sm:grid-cols-3"><NativeSelect aria-label="Module" placeholder="All modules" value={module} onChange={(e) => { setModule(e.target.value); setPage(1); }} options={MODULES.map((m) => ({ value: m, label: m }))} /><Input aria-label="Action contains" placeholder="Action contains…" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} /></div>
      <QueryBoundary q={q}>
        <DataTable rows={q.data?.rows ?? []} page={q.data?.page} pageSize={q.data?.pageSize} total={q.data?.total} onPage={setPage} onRowClick={(r: any) => setOpen(open === r.id ? null : r.id)} columns={[
          { key: 'createdAt', header: 'When', render: (r: any) => <span className="whitespace-nowrap text-xs">{fmtDateTime(r.createdAt)}</span> },
          { key: 'user', header: 'User', render: (r: any) => r.user?.fullName ?? <span className="text-muted-foreground">system</span> },
          { key: 'action', header: 'Action', render: (r: any) => r.action }, { key: 'module', header: 'Module', render: (r: any) => <span className="font-mono text-xs">{r.module}</span> },
          { key: 'record', header: 'Record', render: (r: any) => <span className="font-mono text-xs">{r.recordId?.slice(0, 8) ?? '—'}</span> },
          { key: 'ip', header: 'IP', render: (r: any) => <span className="font-mono text-xs">{r.ip ?? '—'}</span> },
          { key: 'detail', header: 'Values', render: (r: any) => open === r.id ? <pre className="max-w-md whitespace-pre-wrap break-all text-[11px]">{JSON.stringify({ previous: r.previous, next: r.next, device: r.userAgent }, null, 1)}</pre> : <span className="text-xs text-primary">{r.previous || r.next ? 'show' : ''}</span> },
        ]} />
      </QueryBoundary>
    </>
  );
}
