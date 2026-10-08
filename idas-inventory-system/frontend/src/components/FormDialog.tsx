import type { FormEventHandler, ReactNode } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export function FormDialog({ open, onOpenChange, title, description, onSubmit, submitLabel = 'Save', busy, wide, children, destructive }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; onSubmit: FormEventHandler<HTMLFormElement>;
  submitLabel?: string; busy?: boolean; wide?: boolean; children: ReactNode; destructive?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={wide ? 'max-h-[90vh] overflow-y-auto sm:max-w-3xl' : 'max-h-[90vh] overflow-y-auto sm:max-w-lg'}>
        <DialogHeader><DialogTitle>{title}</DialogTitle>{description && <DialogDescription>{description}</DialogDescription>}</DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {children}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={busy} variant={destructive ? 'destructive' : 'default'}>{busy ? 'Working…' : submitLabel}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
