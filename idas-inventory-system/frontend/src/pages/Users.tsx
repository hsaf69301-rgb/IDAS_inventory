import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ConfirmDialog, DataTable, Field, NativeSelect, PageHeader, Panel, QueryBoundary, StatusBadge } from '@/components/common';
import { FormDialog } from '@/components/FormDialog';
import { useAuth } from '@/lib/auth';
import { useAction, useList, useOne } from '@/hooks/useApi';
import { useDebounced } from '@/hooks/useDebounced';
import { patch, post } from '@/lib/api';
import { userSchema } from '@/lib/schemas';
import { humanize } from '@/lib/format';
import { fmtDateTime } from '@/lib/time';

export default function Users() {
  const { can, user: me } = useAuth();
  const [search, setSearch] = useState(''); const s = useDebounced(search); const [role, setRole] = useState(''); const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false); const [sel, setSel] = useState<string | null>(null); const [toggle, setToggle] = useState<any>(null);
  const roles = useList<any[]>('/roles'); const q = useList<any>('/users', { search: s, role, page, pageSize: 15 });
  const setActive = useAction((v: { id: string; isActive: boolean }) => patch(`/users/${v.id}`, { isActive: v.isActive }), { success: 'Account updated', invalidate: ['/users'] });
  const canWrite = can('user:write');
  return (
    <>
      <PageHeader title="Users & roles" sub="Accounts, roles and permissions" action={canWrite && <Button onClick={() => setCreating(true)}><Plus className="mr-1 h-4 w-4" />Add user</Button>} />
      <Tabs defaultValue="users">
        <TabsList><TabsTrigger value="users">Users</TabsTrigger><TabsTrigger value="roles">Roles & permissions</TabsTrigger></TabsList>
        <TabsContent value="users" className="mt-4">
          <div className="mb-3 grid gap-2 sm:grid-cols-3"><Input aria-label="Search users" placeholder="Search name, email, ID…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
            <NativeSelect aria-label="Role" placeholder="All roles" value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }} options={(roles.data ?? []).map((r) => ({ value: r.name, label: r.label }))} /></div>
          <QueryBoundary q={q}>
            <DataTable rows={q.data?.rows ?? []} page={q.data?.page} pageSize={q.data?.pageSize} total={q.data?.total} onPage={setPage} onRowClick={(r: any) => setSel(r.id)} columns={[
              { key: 'fullName', header: 'Name', render: (r: any) => <div><div className="font-medium">{r.fullName}</div><div className="text-xs text-muted-foreground">{r.email}</div></div> },
              { key: 'universityId', header: 'ID', render: (r: any) => r.universityId ?? '—' }, { key: 'role', header: 'Role', render: (r: any) => r.role.label }, { key: 'dept', header: 'Department', render: (r: any) => r.department?.name ?? '—' },
              { key: 'isActive', header: 'Status', render: (r: any) => <StatusBadge value={r.isActive ? 'AVAILABLE' : 'DAMAGED'} label={r.isActive ? 'Active' : 'Inactive'} /> },
              { key: 'a', header: '', render: (r: any) => canWrite && r.id !== me?.id && <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setToggle(r); }}>{r.isActive ? 'Deactivate' : 'Activate'}</Button> },
            ]} />
          </QueryBoundary>
        </TabsContent>
        <TabsContent value="roles" className="mt-4"><RoleMatrix /></TabsContent>
      </Tabs>
      <CreateDialog open={creating} onClose={() => setCreating(false)} roles={roles.data ?? []} />
      <Profile id={sel} onClose={() => setSel(null)} />
      <ConfirmDialog open={!!toggle} onOpenChange={(o) => !o && setToggle(null)} destructive={toggle?.isActive} title={`${toggle?.isActive ? 'Deactivate' : 'Activate'} ${toggle?.fullName}?`} description={toggle?.isActive ? 'They will be signed out and unable to log in. History is kept.' : undefined} confirmLabel={toggle?.isActive ? 'Deactivate' : 'Activate'} onConfirm={() => { setActive.mutate({ id: toggle.id, isActive: !toggle.isActive }); setToggle(null); }} />
    </>
  );
}

function RoleMatrix() {
  const roles = useList<any[]>('/roles'); const perms = useList<any[]>('/permissions');
  return (
    <QueryBoundary q={roles}>
      <div className="overflow-x-auto rounded-lg border bg-card"><table className="w-full text-sm">
        <thead className="bg-muted text-xs uppercase text-muted-foreground"><tr><th className="px-3 py-2 text-left">Permission</th>{(roles.data ?? []).map((r) => <th key={r.id} className="px-2 py-2 text-center">{r.label}<div className="font-normal normal-case">{r.userCount} users</div></th>)}</tr></thead>
        <tbody>{(perms.data ?? []).map((p) => <tr key={p.id} className="border-t"><td className="px-3 py-1.5"><span className="font-mono text-xs">{p.code}</span><div className="text-xs text-muted-foreground">{p.description}</div></td>{(roles.data ?? []).map((r) => <td key={r.id} className="px-2 text-center">{r.permissions.includes(p.code) ? '●' : <span className="text-muted-foreground/40">–</span>}</td>)}</tr>)}</tbody>
      </table></div>
      <p className="mt-2 text-xs text-muted-foreground">Permissions are enforced by the API on every request. The matrix is defined in code (backend/src/common/permissions.ts) so changes go through code review and are covered by tests.</p>
    </QueryBoundary>
  );
}

function CreateDialog({ open, onClose, roles }: { open: boolean; onClose: () => void; roles: any[] }) {
  const depts = useList<any[]>('/departments');
  const { register, handleSubmit, reset, formState: { errors } } = useForm<z.input<typeof userSchema>>({ resolver: zodResolver(userSchema) });
  const m = useAction((v: any) => post('/users', { ...v, universityId: v.universityId || undefined, phone: v.phone || undefined, departmentId: v.departmentId || undefined }), { success: 'User created', invalidate: ['/users', '/roles'], onSuccess: () => { reset(); onClose(); } });
  return (
    <FormDialog open={open} onOpenChange={(o) => !o && onClose()} title="Add user" onSubmit={handleSubmit((v) => m.mutate(v))} busy={m.isPending}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Full name *" error={errors.fullName?.message}><Input {...register('fullName')} /></Field>
        <Field label="Email *" error={errors.email?.message}><Input type="email" {...register('email')} /></Field>
        <Field label="Role *" error={errors.role?.message}><NativeSelect placeholder="Select…" options={roles.map((r) => ({ value: r.name, label: r.label }))} {...register('role')} /></Field>
        <Field label="University / staff / student ID"><Input {...register('universityId')} /></Field>
        <Field label="Department"><NativeSelect placeholder="—" options={(depts.data ?? []).map((d) => ({ value: d.id, label: d.name }))} {...register('departmentId')} /></Field>
        <Field label="Phone"><Input {...register('phone')} /></Field>
      </div>
      <Field label="Initial password *" error={errors.password?.message} hint="Min 10 chars with upper-case, lower-case and a digit. Ask the user to change it after first login."><Input type="password" autoComplete="new-password" {...register('password')} /></Field>
    </FormDialog>
  );
}

function Profile({ id, onClose }: { id: string | null; onClose: () => void }) {
  const q = useOne<any>(id ? `/users/${id}` : null); const u = q.data;
  return (
    <FormDialog open={!!id} onOpenChange={(o) => !o && onClose()} wide title={u?.fullName ?? 'User'} onSubmit={(e) => { e.preventDefault(); onClose(); }} submitLabel="Close">
      <QueryBoundary q={q}>
        {u && (
          <div className="space-y-4 text-sm">
            <dl className="grid gap-2 sm:grid-cols-2">{[['Email', u.email], ['ID', u.universityId ?? '—'], ['Role', u.role.label], ['Department', u.department?.name ?? '—'], ['Phone', u.phone ?? '—'], ['Status', u.isActive ? 'Active' : 'Inactive']].map(([k, v]) => <div key={k}><dt className="text-xs uppercase text-muted-foreground">{k}</dt><dd>{v}</dd></div>)}</dl>
            <Panel title="Equipment requests & loans">{u.loans.length ? u.loans.map((l: any) => <div key={l.id} className="flex justify-between border-t py-1.5 first:border-0"><span><span className="font-mono text-xs">{l.refNo}</span> {l.items.map((i: any) => i.asset.name).join(', ')}</span><StatusBadge value={l.status} /></div>) : <p className="text-muted-foreground">None.</p>}</Panel>
            <Panel title="Lab bookings">{u.bookings.length ? u.bookings.map((b: any) => <div key={b.id} className="flex justify-between border-t py-1.5 first:border-0"><span>{b.course} · {fmtDateTime(b.startTime)}</span><StatusBadge value={b.status} /></div>) : <p className="text-muted-foreground">None.</p>}</Panel>
            <Panel title="Recent activity">{u.history.length ? u.history.slice(0, 8).map((h: any) => <div key={h.id} className="border-t py-1.5 first:border-0">{h.action} <span className="text-muted-foreground">· {humanize(h.module)} · {fmtDateTime(h.createdAt)}</span></div>) : <p className="text-muted-foreground">None.</p>}</Panel>
          </div>
        )}
      </QueryBoundary>
    </FormDialog>
  );
}
