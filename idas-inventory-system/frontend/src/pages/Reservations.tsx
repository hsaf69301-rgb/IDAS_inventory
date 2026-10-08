import { Link } from 'react-router-dom';
import { DataTable, PageHeader, QueryBoundary } from '@/components/common';
import { useList } from '@/hooks/useApi';
import { fmtDateTime } from '@/lib/time';

export default function Reservations() {
  const q = useList<any[]>('/reservations');
  return (
    <>
      <PageHeader title="Reservations" sub="Equipment held by approved lab bookings (upcoming and in progress). Reserved equipment cannot be lent for the same period." />
      <QueryBoundary q={q}>
        <DataTable rows={(q.data ?? []).map((r: any) => ({ ...r }))} columns={[
          { key: 'asset', header: 'Asset', render: (r: any) => <Link className="hover:underline" to={`/inventory/${r.asset.id}`}><span className="font-mono text-xs">{r.asset.assetTag}</span> {r.asset.name}</Link> },
          { key: 'booking', header: 'Booking', render: (r: any) => <div><span className="font-mono text-xs">{r.booking.refNo}</span> {r.booking.course}</div> },
          { key: 'lecturer', header: 'Lecturer', render: (r: any) => r.booking.lecturer.fullName },
          { key: 'when', header: 'Reserved', render: (r: any) => <span className="text-xs">{fmtDateTime(r.booking.startTime)} → {fmtDateTime(r.booking.endTime)}</span> },
        ]} />
      </QueryBoundary>
    </>
  );
}
