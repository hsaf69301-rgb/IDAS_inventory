import { Fragment, cloneElement, isValidElement, useId, useState, type ReactNode } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, ChevronsUpDown, Inbox, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { humanize } from '@/lib/format';

export function PageHeader({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b pb-4">
      <div>
        <h1 className="text-3xl font-semibold">{title}</h1>
        {sub && <p className="mt-1 text-sm text-muted-foreground">{sub}</p>}
      </div>
      {action && <div className="flex flex-wrap gap-2">{action}</div>}
    </div>
  );
}

const tone: Record<string, string> = {
  AVAILABLE: 'success', APPROVED: 'success', RETURNED: 'success', VERIFIED: 'success', CLOSED: 'success', RESOLVED: 'success', COMPLETED: 'success', RECOVERED: 'success', LOW: 'success', MINOR: 'success', NEW: 'success', EXCELLENT: 'success', GOOD: 'success',
  ISSUED: 'info', BORROWED: 'info', RESERVED: 'info', IN_USE: 'info', UNDER_REPAIR: 'info', REPAIRED: 'info', DIAGNOSING: 'info', ASSIGNED: 'info', OPEN: 'info', REPORTED: 'info', INVESTIGATING: 'info',
  PENDING: 'warning', UNDER_INSPECTION: 'warning', UNDER_MAINTENANCE: 'warning', AWAITING_VERIFICATION: 'warning', MEDIUM: 'warning', MODERATE: 'warning', FAIR: 'warning', WRONG_LOCATION: 'warning', NEEDS_INSPECTION: 'warning', EXPIRING: 'warning', NOT_RECOVERED: 'warning',
  OVERDUE: 'danger', DAMAGED: 'danger', MISSING: 'danger', LOST: 'danger', REJECTED: 'danger', CANCELLED: 'danger', HIGH: 'danger', CRITICAL: 'danger', MAJOR: 'danger', POOR: 'danger', NON_FUNCTIONAL: 'danger', NOT_FOUND: 'danger', EXPIRED: 'danger', WRITTEN_OFF: 'danger',
};
const toneCls: Record<string, string> = {
  success: 'bg-success/15 text-success', info: 'bg-info/15 text-info', warning: 'bg-warning/20 text-accent-foreground', danger: 'bg-destructive/15 text-destructive', neutral: 'bg-muted text-muted-foreground',
};
export function StatusBadge({ value, label }: { value?: string | null; label?: string }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  return <span className={cn('inline-block whitespace-nowrap rounded px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide', toneCls[tone[value] ?? 'neutral'])}>{label ?? humanize(value)}</span>;
}

export function StatCard({ label, value, hint, tone: t }: { label: string; value: ReactNode; hint?: string; tone?: 'danger' | 'warning' }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn('mt-1.5 font-display text-3xl font-semibold text-primary', t === 'danger' && 'text-destructive', t === 'warning' && 'text-accent-foreground')}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function Panel({ title, action, children, className }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-lg border bg-card p-5', className)}>
      {(title || action) && <div className="mb-3 flex items-center justify-between gap-2"><h2 className="text-lg font-semibold">{title}</h2>{action}</div>}
      {children}
    </section>
  );
}

export function Loading({ rows = 4 }: { rows?: number }) {
  return <div className="space-y-2" role="status" aria-label="Loading">{Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;
}
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center text-sm">
      <AlertTriangle className="h-6 w-6 text-destructive" />
      <p className="font-medium text-destructive">Something went wrong</p>
      <p className="text-muted-foreground">{(error as Error)?.message ?? 'Unknown error'}</p>
      {onRetry && <Button size="sm" variant="outline" onClick={onRetry}><RefreshCw className="mr-1 h-3.5 w-3.5" />Retry</Button>}
    </div>
  );
}
export function EmptyState({ title = 'Nothing here yet', hint }: { title?: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
      <Inbox className="h-6 w-6" /><p className="font-medium text-foreground">{title}</p>{hint && <p>{hint}</p>}
    </div>
  );
}
export const Spinner = () => <Loader2 className="h-4 w-4 animate-spin" />;

/** Query-state wrapper: loading → error → empty → content. */
export function QueryBoundary({ q, isEmpty, empty, children }: { q: { isLoading: boolean; isError: boolean; error: unknown; refetch: () => void }; isEmpty?: boolean; empty?: ReactNode; children: ReactNode }) {
  if (q.isLoading) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} onRetry={q.refetch} />;
  if (isEmpty) return <>{empty ?? <EmptyState />}</>;
  return <>{children}</>;
}

export interface Column<T> { key: string; header: string; render?: (row: T) => ReactNode; sortable?: boolean; className?: string }
export function DataTable<T extends { id?: string }>({ columns, rows, sort, dir, onSort, page, pageSize, total, onPage, onRowClick, empty }: {
  columns: Column<T>[]; rows: T[]; sort?: string; dir?: 'asc' | 'desc'; onSort?: (key: string) => void;
  page?: number; pageSize?: number; total?: number; onPage?: (p: number) => void; onRowClick?: (r: T) => void; empty?: ReactNode;
}) {
  if (!rows.length) return <>{empty ?? <EmptyState />}</>;
  const pages = page && pageSize && total ? Math.max(1, Math.ceil(total / pageSize)) : 1;
  return (
    <div>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={cn('px-4 py-3 font-medium', c.className)} aria-sort={sort === c.key ? (dir === 'desc' ? 'descending' : 'ascending') : undefined}>
                  {c.sortable && onSort ? (
                    <button className="inline-flex items-center gap-1 uppercase hover:text-foreground" onClick={() => onSort(c.key)}>{c.header}<ChevronsUpDown className={cn('h-3 w-3', sort === c.key && 'text-primary')} /></button>
                  ) : c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id ?? i} className={cn('border-t hover:bg-muted/50', onRowClick && 'cursor-pointer')} onClick={() => onRowClick?.(r)}>
                {columns.map((c) => <td key={c.key} className={cn('px-4 py-3 align-top', c.className)}>{c.render ? c.render(r) : String((r as any)[c.key] ?? '—')}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {page && onPage && total !== undefined && (
        <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
          <span>{total} record{total === 1 ? '' : 's'}</span>
          <div className="flex items-center gap-2">
            <Button size="icon" variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></Button>
            <span>Page {page} of {pages}</span>
            <Button size="icon" variant="outline" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page"><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function Field({ label, error, hint, children, className }: { label: string; error?: string; hint?: string; children: ReactNode; className?: string }) {
  const id = useId();
  // Associate the label with its control so it is announced by screen readers and usable by tests.
  const control = isValidElement(children) && children.type !== Fragment
    ? cloneElement(children as any, { id: (children as any).props.id ?? id, 'aria-invalid': error ? true : undefined })
    : children;
  const controlId = isValidElement(children) && children.type !== Fragment ? ((children as any).props.id ?? id) : undefined;
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label className="text-sm" htmlFor={controlId}>{label}</Label>
      {control}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export const selectCls = 'h-9 w-full rounded-md border border-input bg-card px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40';
export function NativeSelect({ options, placeholder, className, ...p }: React.SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string }[]; placeholder?: string }) {
  return (
    <select {...p} className={cn(selectCls, className)}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel = 'Confirm', destructive, onConfirm, children }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; confirmLabel?: string; destructive?: boolean; onConfirm: () => void; children?: ReactNode;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>{title}</AlertDialogTitle>{description && <AlertDialogDescription>{description}</AlertDialogDescription>}</AlertDialogHeader>
        {children}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction className={destructive ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''} onClick={onConfirm}>{confirmLabel}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Asks for a reason (required) before running a destructive/decision action, e.g. rejecting a booking. */
export function ReasonDialog({ open, onOpenChange, title, confirmLabel, onSubmit, required = true }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; confirmLabel: string; onSubmit: (reason: string) => void; required?: boolean }) {
  const [reason, setReason] = useState('');
  return (
    <ConfirmDialog open={open} onOpenChange={(o) => { if (!o) setReason(''); onOpenChange(o); }} title={title} confirmLabel={confirmLabel} destructive
      onConfirm={() => { if (required && !reason.trim()) return; onSubmit(reason.trim()); setReason(''); }}>
      <textarea aria-label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Reason…" className="w-full rounded-md border bg-card p-2 text-sm" />
    </ConfirmDialog>
  );
}
