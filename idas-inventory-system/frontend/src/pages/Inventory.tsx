import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DataTable, NativeSelect, PageHeader, QueryBoundary, StatusBadge } from '@/components/common';
import { AssetFormDialog } from '@/components/AssetForm';
import { useAuth } from '@/lib/auth';
import { useList } from '@/hooks/useApi';
import { useDebounced } from '@/hooks/useDebounced';
import { ASSET_STATUSES, CONDITIONS, humanize } from '@/lib/format';

export default function Inventory() {
  const nav = useNavigate();
  const { can } = useAuth();
  const [f, setF] = useState({ search: '', categoryId: '', locationId: '', status: '', condition: '' });
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('assetTag'); const [dir, setDir] = useState<'asc' | 'desc'>('asc');
  const [adding, setAdding] = useState(false);
  const search = useDebounced(f.search);
  const cats = useList<any[]>('/categories'), locs = useList<any[]>('/locations');
  const q = useList<any>('/assets', { ...f, search, page, pageSize: 15, sort, dir });
  const set = (k: string, v: string) => { setF({ ...f, [k]: v }); setPage(1); };

  return (
    <>
      <PageHeader title="Inventory" sub="Every asset in the IDAS Lab, with live availability" action={can('asset:write') && <Button onClick={() => setAdding(true)}><Plus className="mr-1 h-4 w-4" />Add asset</Button>} />
      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <div className="relative lg:col-span-2"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input aria-label="Search assets" className="pl-8" placeholder="Search tag, name, brand, serial…" value={f.search} onChange={(e) => set('search', e.target.value)} /></div>
        <NativeSelect aria-label="Category" placeholder="All categories" value={f.categoryId} onChange={(e) => set('categoryId', e.target.value)} options={(cats.data ?? []).map((c) => ({ value: c.id, label: c.name }))} />
        <NativeSelect aria-label="Status" placeholder="All statuses" value={f.status} onChange={(e) => set('status', e.target.value)} options={ASSET_STATUSES.map((s) => ({ value: s, label: humanize(s) }))} />
        <NativeSelect aria-label="Location" placeholder="All locations" value={f.locationId} onChange={(e) => set('locationId', e.target.value)} options={(locs.data ?? []).map((l) => ({ value: l.id, label: l.name }))} />
      </div>
      <QueryBoundary q={q}>
        <DataTable
          rows={q.data?.rows ?? []} page={q.data?.page} pageSize={q.data?.pageSize} total={q.data?.total} onPage={setPage}
          sort={sort} dir={dir} onSort={(k) => { if (k === sort) setDir(dir === 'asc' ? 'desc' : 'asc'); else { setSort(k); setDir('asc'); } }}
          onRowClick={(r: any) => nav(`/inventory/${r.id}`)}
          columns={[
            { key: 'assetTag', header: 'Asset ID', sortable: true, render: (r: any) => <span className="font-mono text-xs">{r.assetTag}</span> },
            { key: 'name', header: 'Name', sortable: true, render: (r: any) => <div><div className="font-medium">{r.name}</div><div className="text-xs text-muted-foreground">{[r.brand, r.model].filter(Boolean).join(' ')}</div></div> },
            { key: 'category', header: 'Category', render: (r: any) => r.category.name },
            { key: 'location', header: 'Location', render: (r: any) => r.location?.name ?? '—' },
            { key: 'status', header: 'Status', sortable: true, render: (r: any) => <StatusBadge value={r.status} /> },
            { key: 'condition', header: 'Condition', sortable: true, render: (r: any) => humanize(r.condition) },
          ]}
        />
      </QueryBoundary>
      <AssetFormDialog open={adding} onOpenChange={setAdding} onDone={(a) => nav(`/inventory/${a.id}`)} />
    </>
  );
}
