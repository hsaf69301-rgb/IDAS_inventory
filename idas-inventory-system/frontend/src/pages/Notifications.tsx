import { Link } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState, PageHeader, QueryBoundary } from '@/components/common';
import { useAction, useList } from '@/hooks/useApi';
import { patch } from '@/lib/api';
import { fmtDateTime } from '@/lib/time';
import { cn } from '@/lib/utils';

export default function Notifications() {
  const q = useList<any[]>('/notifications');
  const inv = ['/notifications'];
  const read = useAction((id: string) => patch(`/notifications/${id}/read`), { invalidate: inv });
  const all = useAction(() => patch('/notifications/read-all'), { success: 'All marked as read', invalidate: inv });
  const unread = (q.data ?? []).filter((n) => !n.readAt).length;
  return (
    <>
      <PageHeader title="Notifications" sub={`${unread} unread`} action={<Button variant="outline" disabled={!unread} onClick={() => all.mutate()}><CheckCheck className="mr-1 h-4 w-4" />Mark all read</Button>} />
      <QueryBoundary q={q} isEmpty={!q.data?.length} empty={<EmptyState title="You're all caught up" hint="Booking decisions, loan reminders and alerts will appear here." />}>
        <ul className="space-y-2">
          {q.data?.map((n) => (
            <li key={n.id} className={cn('flex items-start gap-3 rounded-lg border bg-card p-4', !n.readAt && 'border-l-4 border-l-accent')}>
              <Bell className={cn('mt-0.5 h-4 w-4 shrink-0', n.readAt ? 'text-muted-foreground' : 'text-primary')} />
              <div className="min-w-0 flex-1 text-sm"><div className="font-medium">{n.title}</div><div className="text-muted-foreground">{n.message}</div><div className="mt-1 text-xs text-muted-foreground">{fmtDateTime(n.createdAt)}{n.link && <> · <Link className="text-primary underline" to={n.link} onClick={() => !n.readAt && read.mutate(n.id)}>Open</Link></>}</div></div>
              {!n.readAt && <Button size="sm" variant="ghost" onClick={() => read.mutate(n.id)}>Mark read</Button>}
            </li>
          ))}
        </ul>
      </QueryBoundary>
    </>
  );
}
