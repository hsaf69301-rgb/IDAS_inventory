import { useState } from 'react';
import { Download, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DataTable, Field, NativeSelect, PageHeader, QueryBoundary } from '@/components/common';
import { useList } from '@/hooks/useApi';
import { download, qs } from '@/lib/api';
import { humanize } from '@/lib/format';
import { toast } from 'sonner';

const NEEDS_RANGE = ['borrowing-history', 'lab-bookings', 'lab-utilization', 'maintenance', 'repairs', 'repair-costs', 'damage'];

export default function Reports() {
  const types = useList<string[]>('/reports');
  const [type, setType] = useState('asset-register'); const [from, setFrom] = useState(''); const [to, setTo] = useState(''); const [stocktakeId, setSt] = useState(''); const [days, setDays] = useState('90');
  const sts = useList<any[]>('/stocktakes', {}, { enabled: type === 'stocktake' });
  const params = { from: from ? new Date(from).toISOString() : undefined, to: to ? new Date(to + 'T23:59:59').toISOString() : undefined, stocktakeId: stocktakeId || undefined, days: type === 'warranty-expiry' ? days : undefined };
  const ready = type !== 'stocktake' || !!stocktakeId;
  const q = useList<any>(`/reports/${type}`, params, { enabled: ready });
  const exp = async (format: string) => { try { await download(`/reports/${type}${qs({ ...params, format })}`, `${type}.${format}`); } catch (e: any) { toast.error(e.message); } };

  return (
    <>
      <PageHeader title="Reports" sub="Preview on screen, export as PDF, Excel or CSV, or print." action={<>
        <Button variant="outline" onClick={() => exp('pdf')} disabled={!ready}><Download className="mr-1 h-4 w-4" />PDF</Button>
        <Button variant="outline" onClick={() => exp('xlsx')} disabled={!ready}><Download className="mr-1 h-4 w-4" />Excel</Button>
        <Button variant="outline" onClick={() => exp('csv')} disabled={!ready}><Download className="mr-1 h-4 w-4" />CSV</Button>
        <Button variant="outline" onClick={() => window.print()}><Printer className="mr-1 h-4 w-4" />Print</Button></>} />
      <div className="no-print mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Report"><NativeSelect value={type} onChange={(e) => setType(e.target.value)} options={(types.data ?? []).map((t) => ({ value: t, label: humanize(t.replace(/-/g, '_')) }))} /></Field>
        {NEEDS_RANGE.includes(type) && <><Field label="From"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field><Field label="To"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field></>}
        {type === 'stocktake' && <Field label="Stocktake"><NativeSelect placeholder="Select…" value={stocktakeId} onChange={(e) => setSt(e.target.value)} options={(sts.data ?? []).map((s) => ({ value: s.id, label: `${s.refNo} – ${s.title}` }))} /></Field>}
        {type === 'warranty-expiry' && <Field label="Within (days)"><Input type="number" min={1} value={days} onChange={(e) => setDays(e.target.value)} /></Field>}
      </div>
      {!ready ? <p className="text-sm text-muted-foreground">Choose a stocktake to preview its report.</p> : (
        <QueryBoundary q={q}>
          {q.data && (
            <div>
              <h2 className="text-xl font-semibold">{q.data.title}</h2>
              {q.data.summary && <p className="mb-3 text-sm text-muted-foreground">{q.data.summary}</p>}
              <DataTable rows={q.data.rows.map((r: any, i: number) => ({ id: String(i), ...r }))} columns={q.data.columns.map((c: any) => ({ key: c.key, header: c.label, render: (r: any) => String(r[c.key] ?? '') }))} />
            </div>
          )}
        </QueryBoundary>
      )}
    </>
  );
}
