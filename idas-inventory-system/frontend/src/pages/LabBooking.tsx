import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ConfirmDialog, DataTable, Field, PageHeader, Panel, QueryBoundary, StatusBadge } from '@/components/common';
import { WeekCalendar } from '@/components/WeekCalendar';
import { useAuth } from '@/lib/auth';
import { useAction, useList } from '@/hooks/useApi';
import { useDebounced } from '@/hooks/useDebounced';
import { patch, post } from '@/lib/api';
import { bookingSchema } from '@/lib/schemas';
import { fmtDateTime, labParts, mondayOf, todayLab, zonedToUtcIso } from '@/lib/time';

/** Equipment the lecturer can request alongside the lab (computers are handled by the "number of computers" field). */
const EQUIPMENT: [code: string, label: string][] = [['PROJ', 'Projector'], ['LAP', 'Laptop'], ['MON', 'Monitor'], ['NET', 'Networking equipment'], ['CAM', 'Camera'], ['AUD', 'Microphone / speaker'], ['ADP', 'Adapters'], ['TOOL', 'Tools'], ['OTH', 'Other equipment']];
type FormIn = z.input<typeof bookingSchema>;

export default function LabBooking() {
  const { user, can } = useAuth();
  const canRequest = can('booking:request');
  const [week, setWeek] = useState(mondayOf(todayLab()));
  const [editing, setEditing] = useState<any>(null);
  const [cancel, setCancel] = useState<any>(null);
  const [qty, setQty] = useState<Record<string, number>>({});
  const cats = useList<any[]>('/categories');
  const mine = useList<any>('/bookings', { mine: 'true', pageSize: 50 });
  const blank = useMemo<FormIn>(() => ({ staffId: user?.universityId ?? '', department: user?.department ?? '', course: '', moduleCode: '', purpose: '', batchYear: '', studentCount: 1, date: '', startTime: '', endTime: '', computersNeeded: 0, software: '', osSpecs: '', specialRequirements: '' }), [user]);
  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<FormIn>({ resolver: zodResolver(bookingSchema), defaultValues: blank });

  const catId = (code: string) => cats.data?.find((c) => c.code === code)?.id as string | undefined;
  const resources = EQUIPMENT.map(([code]) => ({ categoryId: catId(code), quantity: qty[code] ?? 0 })).filter((r) => r.categoryId && r.quantity > 0) as { categoryId: string; quantity: number }[];
  const w = watch(); const key = JSON.stringify([w.date, w.startTime, w.endTime, w.computersNeeded, resources]);
  const dKey = useDebounced(key, 400);
  const ready = !!(w.date && w.startTime && w.endTime && w.endTime > w.startTime);
  const [check, setCheck] = useState<any>(null); const [checkErr, setCheckErr] = useState('');
  useEffect(() => {
    if (!canRequest || !ready) { setCheck(null); setCheckErr(''); return; }
    let live = true;
    post('/bookings/check', { startAt: zonedToUtcIso(w.date, w.startTime), endAt: zonedToUtcIso(w.date, w.endTime), computersNeeded: Number(w.computersNeeded) || 0, resources })
      .then((r) => { if (live) { setCheck(r); setCheckErr(''); } }).catch((e) => { if (live) { setCheck(null); setCheckErr(e.message); } });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dKey, canRequest]);

  const inv = ['/bookings', '/dashboard', '/notifications'];
  const save = useAction((v: z.output<typeof bookingSchema>) => {
    const body = { staffId: v.staffId, department: v.department, course: v.course, moduleCode: v.moduleCode, purpose: v.purpose, batchYear: v.batchYear, studentCount: v.studentCount, computersNeeded: v.computersNeeded,
      software: v.software || undefined, osSpecs: v.osSpecs || undefined, specialRequirements: v.specialRequirements || undefined, startAt: zonedToUtcIso(v.date, v.startTime), endAt: zonedToUtcIso(v.date, v.endTime), resources };
    return editing ? patch(`/bookings/${editing.id}`, body) : post('/bookings', body);
  }, { success: editing ? 'Booking updated – sent for re-approval' : 'Booking submitted – the Dean/Registrar has been notified', invalidate: inv, onSuccess: () => { reset(blank); setQty({}); setEditing(null); } });
  const cancelM = useAction((id: string) => post(`/bookings/${id}/cancel`, {}), { success: 'Booking cancelled', invalidate: inv });

  function startEdit(b: any) {
    const s = labParts(b.startTime), e = labParts(b.endTime);
    setEditing(b);
    reset({ staffId: b.staffId, department: b.department, course: b.course, moduleCode: b.moduleCode, purpose: b.purpose, batchYear: b.batchYear, studentCount: b.studentCount, date: s.date, startTime: s.time, endTime: e.time, computersNeeded: b.computersNeeded, software: b.software ?? '', osSpecs: b.osSpecs ?? '', specialRequirements: b.specialRequirements ?? '' });
    const next: Record<string, number> = {};
    for (const r of b.resources.filter((x: any) => !x.reserved && x.categoryId)) { const code = cats.data?.find((c) => c.id === r.categoryId)?.code; if (code) next[code] = r.quantity; }
    setQty(next); window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <>
      <PageHeader title="Lab booking" sub={canRequest ? 'Pick a free slot on the calendar, describe your session and submit for Dean/Registrar approval.' : 'Laboratory timetable'} />
      <div className={canRequest ? 'grid gap-6 xl:grid-cols-5' : ''}>
        <div className="xl:col-span-3">
          <WeekCalendar weekStart={week} onWeekChange={setWeek} onPick={canRequest ? (d, h) => { setValue('date', d, { shouldValidate: true }); setValue('startTime', `${String(h).padStart(2, '0')}:00`); setValue('endTime', `${String(h + 1).padStart(2, '0')}:00`); } : undefined} />
        </div>
        {canRequest && (
          <Panel title={editing ? `Modify ${editing.refNo}` : 'New booking request'} className="xl:col-span-2">
            <form className="space-y-3" noValidate onSubmit={handleSubmit((v) => save.mutate(v as any))}>
              <div className="grid grid-cols-2 gap-3 rounded-md bg-muted/50 p-2 text-sm"><div><div className="text-xs text-muted-foreground">Lecturer</div>{user?.fullName}</div><div><div className="text-xs text-muted-foreground">Email</div>{user?.email}</div></div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Staff ID *" error={errors.staffId?.message}><Input {...register('staffId')} /></Field>
                <Field label="Department *" error={errors.department?.message}><Input {...register('department')} /></Field>
                <Field label="Course / module *" error={errors.course?.message}><Input {...register('course')} /></Field>
                <Field label="Module code *" error={errors.moduleCode?.message}><Input {...register('moduleCode')} /></Field>
                <Field label="Batch / year *" error={errors.batchYear?.message}><Input placeholder="2nd year" {...register('batchYear')} /></Field>
                <Field label="Students *" error={errors.studentCount?.message}><Input type="number" min={1} {...register('studentCount')} /></Field>
              </div>
              <Field label="Purpose *" error={errors.purpose?.message}><Textarea rows={2} {...register('purpose')} /></Field>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Date *" error={errors.date?.message}><Input type="date" min={todayLab()} {...register('date')} /></Field>
                <Field label="Start *" error={errors.startTime?.message}><Input type="time" step={900} {...register('startTime')} /></Field>
                <Field label="End *" error={errors.endTime?.message}><Input type="time" step={900} {...register('endTime')} /></Field>
              </div>
              <Field label="Number of computers" error={errors.computersNeeded?.message}><Input type="number" min={0} {...register('computersNeeded')} /></Field>
              <fieldset className="rounded-md border p-3"><legend className="px-1 text-sm">Additional equipment</legend>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                  {EQUIPMENT.filter(([c]) => catId(c)).map(([code, label]) => (
                    <label key={code} className="flex items-center justify-between gap-2 text-sm">{label}
                      <Input aria-label={`${label} quantity`} type="number" min={0} className="h-8 w-16" value={qty[code] ?? 0} onChange={(e) => setQty({ ...qty, [code]: Math.max(0, +e.target.value || 0) })} /></label>
                  ))}
                </div>
              </fieldset>
              <Field label="Required software"><Input {...register('software')} /></Field>
              <Field label="Operating system / specifications"><Input {...register('osSpecs')} /></Field>
              <Field label="Special technical requirements"><Textarea rows={2} {...register('specialRequirements')} /></Field>
              {checkErr && <p role="alert" className="rounded bg-destructive/10 p-2 text-sm text-destructive">{checkErr}</p>}
              {check && (
                <div role="status" className={`rounded-md border p-2 text-sm ${check.ok ? 'border-success/40 bg-success/10' : 'border-destructive/40 bg-destructive/10'}`}>
                  <div className="flex items-center gap-1.5 font-medium">{check.ok ? <><CheckCircle2 className="h-4 w-4 text-success" />Slot and resources available</> : <><XCircle className="h-4 w-4 text-destructive" />Not available</>}</div>
                  <div className="mt-1 text-xs text-muted-foreground">Computers free: {check.computers.free}/{check.computers.total}{check.resources.map((r: any) => ` · ${r.name}: ${r.free}`).join('')}</div>
                  {check.conflicts.map((c: any, i: number) => <div key={i} className="mt-1 text-xs text-destructive">• {c.message}</div>)}
                  {check.overlapping.filter((o: any) => o.status === 'PENDING').length > 0 && <div className="mt-1 text-xs text-muted-foreground">{check.overlapping.filter((o: any) => o.status === 'PENDING').length} other request(s) pending for this time.</div>}
                </div>
              )}
              <div className="flex gap-2">
                <Button type="submit" disabled={save.isPending || (!!check && !check.ok)}>{save.isPending ? 'Submitting…' : editing ? 'Resubmit for approval' : 'Submit request'}</Button>
                {editing && <Button type="button" variant="outline" onClick={() => { setEditing(null); reset(blank); setQty({}); }}>Cancel edit</Button>}
              </div>
              <p className="text-xs text-muted-foreground">Times are in lab time (Asia/Colombo). Lab hours and open days are set by the administrator.</p>
            </form>
          </Panel>
        )}
      </div>
      {canRequest && (
        <>
          <h2 className="mb-3 mt-8 text-xl font-semibold">My bookings</h2>
          <QueryBoundary q={mine}>
            <DataTable rows={mine.data?.rows ?? []} columns={[
              { key: 'refNo', header: 'Ref', render: (r: any) => <span className="font-mono text-xs">{r.refNo}</span> },
              { key: 'course', header: 'Session', render: (r: any) => <div><div className="font-medium">{r.course}</div><div className="text-xs text-muted-foreground">{r.moduleCode} · {r.studentCount} students · {r.computersNeeded} PCs</div></div> },
              { key: 'when', header: 'When', render: (r: any) => <div className="text-xs">{fmtDateTime(r.startTime)}<br />→ {fmtDateTime(r.endTime)}</div> },
              { key: 'status', header: 'Status', render: (r: any) => <div><StatusBadge value={r.status} />{r.rejectionReason && <div className="mt-1 max-w-48 text-xs text-destructive">{r.rejectionReason}</div>}</div> },
              { key: 'a', header: '', render: (r: any) => ['PENDING', 'APPROVED'].includes(r.status) && <div className="flex gap-1"><Button size="sm" variant="outline" onClick={() => startEdit(r)}>Modify</Button><Button size="sm" variant="ghost" onClick={() => setCancel(r)}>Cancel</Button></div> },
            ]} />
          </QueryBoundary>
        </>
      )}
      <ConfirmDialog open={!!cancel} onOpenChange={(o) => !o && setCancel(null)} destructive title={`Cancel booking ${cancel?.refNo}?`} description="The slot and any reserved equipment are released." confirmLabel="Cancel booking" onConfirm={() => { cancelM.mutate(cancel.id); setCancel(null); }} />
    </>
  );
}
