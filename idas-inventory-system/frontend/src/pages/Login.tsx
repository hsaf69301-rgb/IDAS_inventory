import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/common';
import { useAuth } from '@/lib/auth';
import { loginSchema } from '@/lib/schemas';
import type { z } from 'zod';

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const loc = useLocation() as { state?: { from?: string } };
  const [error, setError] = useState('');
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<z.infer<typeof loginSchema>>({ resolver: zodResolver(loginSchema) });
  if (user) return <Navigate to={loc.state?.from ?? '/'} replace />;

  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <div className="hidden flex-col justify-end bg-sidebar p-12 text-sidebar-foreground md:flex">
        <h1 className="text-5xl font-semibold">IDAS Lab</h1>
        <p className="mt-3 max-w-sm opacity-80">Inventory, lending, lab booking and maintenance for the Department of IT, Faculty of Arts, University of Peradeniya.</p>
      </div>
      <form onSubmit={handleSubmit(async (v) => { setError(''); try { await login(v.email, v.password); navigate(loc.state?.from ?? '/', { replace: true }); } catch (e: any) { setError(e.message); } })}
        className="m-auto w-full max-w-sm space-y-4 p-8" noValidate>
        <h2 className="text-2xl font-semibold">Sign in</h2>
        <Field label="Email" error={errors.email?.message}><Input type="email" autoComplete="username" placeholder="you@arts.pdn.ac.lk" {...register('email')} /></Field>
        <Field label="Password" error={errors.password?.message}><Input type="password" autoComplete="current-password" {...register('password')} /></Field>
        {error && <p role="alert" className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={isSubmitting}>{isSubmitting ? 'Signing in…' : 'Sign in'}</Button>
        <p className="text-xs text-muted-foreground">Accounts are created by the lab administrator. Too many failed attempts temporarily lock the account.</p>
      </form>
    </div>
  );
}
