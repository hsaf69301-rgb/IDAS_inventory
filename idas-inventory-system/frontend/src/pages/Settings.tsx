import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DataTable, Field, NativeSelect, PageHeader, Panel, QueryBoundary } from '@/components/common';
import { useAuth } from '@/lib/auth';
import { useAction, useList } from '@/hooks/useApi';
import { post, put } from '@/lib/api';
import { changePasswordSchema } from '@/lib/schemas';
import { humanize } from '@/lib/format';

export default function Settings() {
  const { user, can } = useAuth();
  return (
    <>
      <PageHeader title="Settings" sub={`${user?.fullName} · ${user?.email}`} />
      <Tabs defaultValue="account">
        <TabsList className="flex-wrap"><TabsTrigger value="account">My account</TabsTrigger>{can('settings:manage') && <TabsTrigger value="lab">Lab hours</TabsTrigger>}{can('lookup:write') && <><TabsTrigger value="categories">Categories</TabsTrigger><TabsTrigger value="locations">Locations</TabsTrigger></>}</TabsList>
        <TabsContent value="account" className="mt-4"><Account /></TabsContent>
        {can('settings:manage') && <TabsContent value="lab" className="mt-4"><LabHours /></TabsContent>}
        {can('lookup:write') && <><TabsContent value="categories" className="mt-4"><Categories /></TabsContent><TabsContent value="locations" className="mt-4"><Locations /></TabsContent></>}
      </Tabs>
    </>
  );
}

function Account() {
  const { user, logout } = useAuth();
  const { register, handleSubmit, reset, formState: { errors } } = useForm<z.input<typeof changePasswordSchema>>({ resolver: zodResolver(changePasswordSchema) });
  const m = useAction((v: any) => post('/auth/change-password', { current: v.current, next: v.next }), { success: 'Password changed – please sign in again', onSuccess: () => { reset(); setTimeout(() => logout(), 800); } });
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Panel title="Profile"><dl className="grid grid-cols-2 gap-3 text-sm">{[['Name', user?.fullName], ['Email', user?.email], ['Role', user?.roleLabel], ['Department', user?.department ?? '—'], ['ID', user?.universityId ?? '—']].map(([k, v]) => <div key={k}><dt className="text-xs uppercase text-muted-foreground">{k}</dt><dd>{v}</dd></div>)}</dl></Panel>
      <Panel title="Change password">
        <form className="space-y-3" noValidate onSubmit={handleSubmit((v) => m.mutate(v))}>
          <Field label="Current password" error={errors.current?.message}><Input type="password" autoComplete="current-password" {...register('current')} /></Field>
          <Field label="New password" error={errors.next?.message}><Input type="password" autoComplete="new-password" {...register('next')} /></Field>
          <Field label="Confirm new password" error={errors.confirm?.message}><Input type="password" autoComplete="new-password" {...register('confirm')} /></Field>
          <Button type="submit" disabled={m.isPending}>Change password</Button>
        </form>
      </Panel>
    </div>
  );
}

function LabHours() {
  const q = useList<any[]>('/settings'); const get = (k: string, d: string) => q.data?.find((s) => s.key === k)?.value ?? d;
  const [v, setV] = useState<Record<string, string>>({});
  const save = useAction(async () => { for (const [k, val] of Object.entries(v)) await put(`/settings/${k}`, { value: val }); }, { success: 'Settings saved', invalidate: ['/settings', '/bookings'], onSuccess: () => setV({}) });
  const val = (k: string, d: string) => v[k] ?? get(k, d);
  return (
    <QueryBoundary q={q}>
      <Panel title="Booking window" className="max-w-xl">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Opens"><Input type="time" value={val('app.labOpen', '08:00')} onChange={(e) => setV({ ...v, 'app.labOpen': e.target.value })} /></Field>
          <Field label="Closes"><Input type="time" value={val('app.labClose', '18:00')} onChange={(e) => setV({ ...v, 'app.labClose': e.target.value })} /></Field>
          <Field label="Open days" hint="0=Sun … 6=Sat, comma separated" className="col-span-2"><Input value={val('app.labDays', '1,2,3,4,5')} onChange={(e) => setV({ ...v, 'app.labDays': e.target.value })} /></Field>
        </div>
        <Button className="mt-4" disabled={!Object.keys(v).length || save.isPending} onClick={() => save.mutate()}>Save</Button>
      </Panel>
    </QueryBoundary>
  );
}

function Categories() {
  const q = useList<any[]>('/categories'); const [name, setName] = useState(''); const [code, setCode] = useState('');
  const m = useAction(() => post('/categories', { name, code: code.toUpperCase() }), { success: 'Category added', invalidate: ['/categories'], onSuccess: () => { setName(''); setCode(''); } });
  return (
    <div className="space-y-4">
      <Panel title="Add category"><form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
        <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} required /></Field><Field label="Code" hint="2–8 letters; used in asset IDs (IDAS-CODE-0001)"><Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} required pattern="[A-Z0-9]{2,8}" className="w-28 font-mono" /></Field><Button type="submit" disabled={m.isPending}>Add</Button></form></Panel>
      <QueryBoundary q={q}><DataTable rows={q.data ?? []} columns={[{ key: 'name', header: 'Category' }, { key: 'code', header: 'Code', render: (r: any) => <span className="font-mono text-xs">{r.code}</span> }, { key: 'n', header: 'Assets', render: (r: any) => r._count.assets }]} /></QueryBoundary>
    </div>
  );
}

const LOC_TYPES = ['UNIVERSITY', 'FACULTY', 'DEPARTMENT', 'LAB', 'ROOM', 'RACK'];
function Locations() {
  const q = useList<any[]>('/locations'); const [name, setName] = useState(''); const [type, setType] = useState('ROOM'); const [parentId, setParent] = useState('');
  const m = useAction(() => post('/locations', { name, type, parentId: parentId || undefined }), { success: 'Location added', invalidate: ['/locations'], onSuccess: () => setName('') });
  return (
    <div className="space-y-4">
      <Panel title="Add location (University → Faculty → Department → Lab → Room → Rack)"><form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
        <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} required /></Field>
        <Field label="Type"><NativeSelect value={type} onChange={(e) => setType(e.target.value)} options={LOC_TYPES.map((t) => ({ value: t, label: humanize(t) }))} /></Field>
        <Field label="Inside"><NativeSelect value={parentId} onChange={(e) => setParent(e.target.value)} placeholder="— top level —" options={(q.data ?? []).map((l) => ({ value: l.id, label: l.name }))} /></Field><Button type="submit" disabled={m.isPending}>Add</Button></form></Panel>
      <QueryBoundary q={q}><DataTable rows={q.data ?? []} columns={[{ key: 'name', header: 'Location' }, { key: 'type', header: 'Type', render: (r: any) => humanize(r.type) }, { key: 'parent', header: 'Inside', render: (r: any) => r.parent?.name ?? '—' }, { key: 'n', header: 'Assets', render: (r: any) => r._count.assets }]} /></QueryBoundary>
    </div>
  );
}
