import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Field, NativeSelect } from '@/components/common';
import { FormDialog } from '@/components/FormDialog';
import { assetSchema, parseSpecs } from '@/lib/schemas';
import { CONDITIONS, humanize } from '@/lib/format';
import { useList, useAction } from '@/hooks/useApi';
import { patch, post } from '@/lib/api';

type V = z.input<typeof assetSchema>;
const d10 = (s?: string | null) => (s ? s.slice(0, 10) : '');

export function AssetFormDialog({ open, onOpenChange, asset, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; asset?: any; onDone?: (a: any) => void }) {
  const editing = !!asset;
  const cats = useList<any[]>('/categories');
  const locs = useList<any[]>('/locations');
  const { register, handleSubmit, reset, formState: { errors } } = useForm<V>({ resolver: zodResolver(assetSchema), defaultValues: { condition: 'GOOD', quantity: 1 } });

  useEffect(() => {
    if (!open) return;
    reset(asset ? {
      name: asset.name, categoryId: asset.categoryId, brand: asset.brand ?? '', model: asset.model ?? '', serialNumber: asset.serialNumber ?? '', description: asset.description ?? '',
      locationId: asset.locationId ?? '', condition: asset.condition, quantity: asset.quantity, notes: asset.notes ?? '',
      specs: (asset.specifications ?? []).map((s: any) => `${s.key}=${s.value}`).join(', '),
      acquiredAt: d10(asset.acquisition?.acquiredAt), supplier: asset.acquisition?.supplier ?? '', invoiceRef: asset.acquisition?.invoiceRef ?? '', value: asset.acquisition?.value ?? '',
      fundingSource: asset.acquisition?.fundingSource ?? '', warrantyStart: d10(asset.acquisition?.warrantyStart), warrantyEnd: d10(asset.acquisition?.warrantyEnd),
    } : { condition: 'GOOD', quantity: 1 });
  }, [open, asset, reset]);

  const save = useAction(async (v: z.output<typeof assetSchema>) => {
    const acquisition = {
      acquiredAt: v.acquiredAt || undefined, supplier: v.supplier || undefined, invoiceRef: v.invoiceRef || undefined, value: v.value === '' || v.value === undefined ? undefined : Number(v.value),
      fundingSource: v.fundingSource || undefined, warrantyStart: v.warrantyStart || undefined, warrantyEnd: v.warrantyEnd || undefined,
    };
    const common = { name: v.name, brand: v.brand || undefined, model: v.model || undefined, serialNumber: v.serialNumber || undefined, description: v.description || undefined, condition: v.condition, quantity: v.quantity, notes: v.notes || undefined, specifications: parseSpecs(v.specs), acquisition };
    return editing ? patch(`/assets/${asset.id}`, common) : post('/assets', { ...common, categoryId: v.categoryId, locationId: v.locationId || undefined, isConsumable: v.quantity > 1 });
  }, { success: editing ? 'Asset updated' : 'Asset created', invalidate: ['/assets', '/dashboard'], onSuccess: (a) => { onOpenChange(false); onDone?.(a); } });

  const e = (k: keyof V) => (errors[k]?.message as string | undefined);
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} wide title={editing ? `Edit ${asset.assetTag}` : 'Add asset'} description={editing ? 'Every change is recorded in the asset history with old and new values.' : 'An asset ID (e.g. IDAS-PC-0001) is generated automatically.'}
      onSubmit={handleSubmit((v) => save.mutate(v as any))} busy={save.isPending}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name *" error={e('name')}><Input {...register('name')} /></Field>
        <Field label="Category *" error={e('categoryId')}><NativeSelect disabled={editing} placeholder="Select…" options={(cats.data ?? []).map((c) => ({ value: c.id, label: `${c.name} (${c.code})` }))} {...register('categoryId')} /></Field>
        <Field label="Brand"><Input {...register('brand')} /></Field>
        <Field label="Model"><Input {...register('model')} /></Field>
        <Field label="Serial number"><Input {...register('serialNumber')} /></Field>
        <Field label="Condition"><NativeSelect options={CONDITIONS.map((c) => ({ value: c, label: humanize(c) }))} {...register('condition')} /></Field>
        {!editing && <Field label="Location"><NativeSelect placeholder="Select…" options={(locs.data ?? []).map((l) => ({ value: l.id, label: l.parent ? `${l.parent.name} → ${l.name}` : l.name }))} {...register('locationId')} /></Field>}
        <Field label="Quantity" error={e('quantity')} hint="Use >1 for cables/adapters tracked by count"><Input type="number" min={1} {...register('quantity')} /></Field>
      </div>
      <Field label="Technical specifications" hint="Comma separated KEY=VALUE, e.g. RAM=16GB, CPU=Core i5, Storage=512GB SSD. Changed values are versioned."><Textarea rows={2} {...register('specs')} /></Field>
      <Field label="Description"><Textarea rows={2} {...register('description')} /></Field>
      <h3 className="pt-1 text-base font-semibold">Acquisition & warranty</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Acquired / provided on"><Input type="date" {...register('acquiredAt')} /></Field>
        <Field label="Supplier / donor"><Input {...register('supplier')} /></Field>
        <Field label="Invoice / reference"><Input {...register('invoiceRef')} /></Field>
        <Field label="Value (LKR)" error={e('value')}><Input type="number" min={0} step="0.01" {...register('value')} /></Field>
        <Field label="Funding source"><Input {...register('fundingSource')} /></Field>
        <span />
        <Field label="Warranty start"><Input type="date" {...register('warrantyStart')} /></Field>
        <Field label="Warranty end" error={e('warrantyEnd')}><Input type="date" {...register('warrantyEnd')} /></Field>
      </div>
      <Field label="Notes"><Textarea rows={2} {...register('notes')} /></Field>
    </FormDialog>
  );
}
