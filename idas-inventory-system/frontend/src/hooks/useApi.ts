import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { toast } from 'sonner';
import { get, qs } from '@/lib/api';

export const useList = <T = any>(path: string, params: Record<string, unknown> = {}, opts: { enabled?: boolean; refetchInterval?: number } = {}) =>
  useQuery<T>({ queryKey: [path, params], queryFn: () => get<T>(path + qs(params)), ...opts });

export const useOne = <T = any>(path: string | null, opts: { enabled?: boolean } = {}) =>
  useQuery<T>({ queryKey: [path], queryFn: () => get<T>(path!), enabled: !!path && opts.enabled !== false });

/** Mutation with toast feedback and cache invalidation. */
export function useAction<TVars = void, TRes = any>(fn: (v: TVars) => Promise<TRes>, o: { success?: string; invalidate?: (string | QueryKey)[]; onSuccess?: (r: TRes) => void } = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r) => {
      if (o.success) toast.success(o.success);
      // Invalidate by path prefix, e.g. '/assets' also refreshes '/assets/<id>' and '/assets?...'
      for (const k of o.invalidate ?? []) {
        const prefix = Array.isArray(k) ? String(k[0]) : k;
        qc.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === 'string' && (q.queryKey[0] as string).startsWith(prefix) });
      }
      o.onSuccess?.(r);
    },
    onError: (e: any) => {
      const conflicts = e?.details?.message?.conflicts ?? e?.details?.conflicts;
      toast.error(e?.message ?? 'Action failed', conflicts ? { description: conflicts.map((c: any) => c.message).join(' · ') } : undefined);
    },
  });
}
