import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { addDays, labParts, mondayOf, todayLab, zonedToUtcIso } from '@/lib/time';
import { useList } from '@/hooks/useApi';
import { ErrorState } from './common';

export interface CalBooking { id: string; refNo: string; course: string; moduleCode?: string; status: string; startTime: string; endTime: string; studentCount?: number; lecturer: { fullName: string } }
const START_H = 8, END_H = 18, ROW = 44; // px per hour

/** Week view (Mon–Fri) of lab bookings. Clicking an empty cell reports the chosen date and hour. */
export function WeekCalendar({ weekStart, onWeekChange, onPick, highlightId }: { weekStart: string; onWeekChange: (w: string) => void; onPick?: (date: string, startHour: number) => void; highlightId?: string }) {
  const days = Array.from({ length: 5 }, (_, i) => addDays(weekStart, i));
  const from = zonedToUtcIso(weekStart, '00:00'), to = zonedToUtcIso(addDays(weekStart, 5), '00:00');
  const q = useList<CalBooking[]>('/bookings/calendar', { from, to });
  const today = todayLab();

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b p-3">
        <div className="flex items-center gap-2">
          <Button size="icon" variant="outline" aria-label="Previous week" onClick={() => onWeekChange(addDays(weekStart, -7))}><ChevronLeft className="h-4 w-4" /></Button>
          <Button size="icon" variant="outline" aria-label="Next week" onClick={() => onWeekChange(addDays(weekStart, 7))}><ChevronRight className="h-4 w-4" /></Button>
          <Button size="sm" variant="ghost" onClick={() => onWeekChange(mondayOf(today))}>Today</Button>
        </div>
        <div className="text-sm font-medium">{weekStart} → {days[4]}</div>
        <div className="hidden items-center gap-3 text-xs sm:flex">
          <span className="flex items-center gap-1"><i className="inline-block h-3 w-3 rounded bg-success/40" />Approved</span>
          <span className="flex items-center gap-1"><i className="inline-block h-3 w-3 rounded border border-dashed border-accent-foreground/50 bg-warning/30" />Pending</span>
        </div>
      </div>
      {q.isError && <div className="p-3"><ErrorState error={q.error} onRetry={() => q.refetch()} /></div>}
      <div className="overflow-x-auto">
        <div className="grid min-w-[720px] grid-cols-[48px_repeat(5,1fr)]">
          <div />
          {days.map((d) => (
            <div key={d} className={cn('border-l p-2 text-center text-xs font-medium', d === today && 'bg-accent/20')}>
              {new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}
            </div>
          ))}
          <div>{Array.from({ length: END_H - START_H }, (_, i) => <div key={i} style={{ height: ROW }} className="pr-1 text-right text-[10px] text-muted-foreground">{String(START_H + i).padStart(2, '0')}:00</div>)}</div>
          {days.map((d) => (
            <div key={d} className="relative border-l" style={{ height: ROW * (END_H - START_H) }}>
              {Array.from({ length: END_H - START_H }, (_, i) => (
                <button key={i} type="button" aria-label={`Free slot ${d} ${START_H + i}:00`} disabled={!onPick} onClick={() => onPick?.(d, START_H + i)}
                  className={cn('block w-full border-t', onPick && 'hover:bg-primary/5')} style={{ height: ROW }} />
              ))}
              {(q.data ?? []).filter((b) => labParts(b.startTime).date === d).map((b) => {
                const s = labParts(b.startTime), e = labParts(b.endTime);
                const top = ((s.minutes - START_H * 60) / 60) * ROW, h = Math.max(((e.minutes - s.minutes) / 60) * ROW, 20);
                return (
                  <div key={b.id} title={`${b.refNo} · ${b.course} · ${b.lecturer.fullName}`}
                    className={cn('absolute inset-x-0.5 overflow-hidden rounded border px-1.5 py-0.5 text-[11px] leading-tight',
                      b.status === 'APPROVED' ? 'border-success/40 bg-success/25' : 'border-dashed border-accent-foreground/50 bg-warning/30', highlightId === b.id && 'ring-2 ring-primary')}
                    style={{ top, height: h }}>
                    <div className="truncate font-medium">{b.course}</div>
                    <div className="truncate text-muted-foreground">{s.time}–{e.time} · {b.lecturer.fullName}</div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
