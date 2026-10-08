import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '@/lib/auth';
import { Loading } from '@/components/common';
import { AppShell } from '@/components/AppShell';
import Login from '@/pages/Login';
import Dashboard from '@/pages/Dashboard';
import Inventory from '@/pages/Inventory';
import AssetDetail from '@/pages/AssetDetail';
import Scan from '@/pages/Scan';
import Requests from '@/pages/Requests';
import Loans from '@/pages/Loans';
import LabBooking from '@/pages/LabBooking';
import Approvals from '@/pages/Approvals';
import Reservations from '@/pages/Reservations';
import Maintenance from '@/pages/Maintenance';
import Damage from '@/pages/Damage';
import Stocktake from '@/pages/Stocktake';
import Users from '@/pages/Users';
import Reports from '@/pages/Reports';
import Notifications from '@/pages/Notifications';
import Audit from '@/pages/Audit';
import Settings from '@/pages/Settings';

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="p-10"><Loading rows={3} /></div>;
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  return <>{children}</>;
}

/** UI-level guard only – the API enforces the same permission on the server. */
function Guard({ perm, children }: { perm?: string; children: ReactNode }) {
  const { can } = useAuth();
  if (perm && !can(perm)) {
    return <div role="alert" className="rounded-lg border bg-card p-8 text-center"><h1 className="text-2xl">Access denied</h1><p className="mt-2 text-sm text-muted-foreground">Your role does not have permission to view this page.</p></div>;
  }
  return <>{children}</>;
}

const page = (perm: string | undefined, el: ReactNode) => <Guard perm={perm}>{el}</Guard>;

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<RequireAuth><AppShell /></RequireAuth>}>
        <Route index element={<Dashboard />} />
        <Route path="inventory" element={page('asset:read', <Inventory />)} />
        <Route path="inventory/:id" element={page('asset:read', <AssetDetail />)} />
        <Route path="scan" element={page('asset:read', <Scan />)} />
        <Route path="requests" element={page('loan:request', <Requests />)} />
        <Route path="loans" element={page('loan:read-all', <Loans />)} />
        <Route path="lab-booking" element={page('booking:read-all', <LabBooking />)} />
        <Route path="approvals" element={page('booking:decide', <Approvals />)} />
        <Route path="reservations" element={page('asset:write', <Reservations />)} />
        <Route path="maintenance" element={page('maintenance:read', <Maintenance />)} />
        <Route path="damage" element={page('damage:manage', <Damage />)} />
        <Route path="stocktake" element={page('stocktake:manage', <Stocktake />)} />
        <Route path="users" element={page('user:read', <Users />)} />
        <Route path="reports" element={page('report:view', <Reports />)} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="audit" element={page('audit:read', <Audit />)} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
