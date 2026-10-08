import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Bell, Boxes, CalendarCheck, CalendarDays, ClipboardCheck, ClipboardList, FileBarChart, HandCoins, LayoutDashboard, LogOut, Menu, ScrollText, Settings, ShieldAlert, Users, Wrench, X, Bookmark, ScanLine } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useList } from '@/hooks/useApi';
import { cn } from '@/lib/utils';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/inventory', label: 'Inventory', icon: Boxes, perm: 'asset:read' },
  { to: '/scan', label: 'Scan / Find Asset', icon: ScanLine, perm: 'asset:read' },
  { to: '/requests', label: 'Equipment Requests', icon: ClipboardList, perm: 'loan:request' },
  { to: '/loans', label: 'Loans', icon: HandCoins, perm: 'loan:read-all' },
  { to: '/lab-booking', label: 'Lab Booking', icon: CalendarDays, perm: 'booking:read-all' },
  { to: '/approvals', label: 'Booking Approvals', icon: CalendarCheck, perm: 'booking:decide' },
  { to: '/reservations', label: 'Reservations', icon: Bookmark, perm: 'asset:write' },
  { to: '/maintenance', label: 'Maintenance', icon: Wrench, perm: 'maintenance:read' },
  { to: '/damage', label: 'Damage & Lost', icon: ShieldAlert, perm: 'damage:manage' },
  { to: '/stocktake', label: 'Stocktake', icon: ClipboardCheck, perm: 'stocktake:manage' },
  { to: '/users', label: 'Users', icon: Users, perm: 'user:read' },
  { to: '/reports', label: 'Reports', icon: FileBarChart, perm: 'report:view' },
  { to: '/notifications', label: 'Notifications', icon: Bell },
  { to: '/audit', label: 'Audit Logs', icon: ScrollText, perm: 'audit:read' },
  { to: '/settings', label: 'Settings', icon: Settings },
];

function UnreadBadge() {
  const q = useList<{ count: number }>('/notifications/unread-count', {}, { refetchInterval: 30000 });
  if (!q.data?.count) return null;
  return <span aria-label={`${q.data.count} unread`} className="ml-auto rounded-full bg-accent px-1.5 text-[10px] font-semibold text-accent-foreground">{q.data.count}</span>;
}

export function AppShell() {
  const { user, logout, can } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const items = NAV.filter((n) => !n.perm || can(n.perm));

  const sidebar = (
    <div className="flex h-full flex-col bg-sidebar p-5 text-sidebar-foreground">
      <div className="mb-6">
        <div className="font-display text-2xl font-semibold">IDAS Lab</div>
        <div className="mt-1 text-xs opacity-70">Dept. of IT · Faculty of Arts<br />University of Peradeniya</div>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto text-sm" aria-label="Main">
        {items.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} onClick={() => setOpen(false)}
            className={({ isActive }) => cn('flex items-center gap-2.5 rounded-md border-l-2 border-transparent px-3 py-2 transition-colors hover:bg-sidebar-accent', isActive && 'border-accent bg-sidebar-accent font-medium')}>
            <n.icon className="h-4 w-4 shrink-0 opacity-80" />{n.label}{n.to === '/notifications' && <UnreadBadge />}
          </NavLink>
        ))}
      </nav>
      <div className="mt-4 border-t border-sidebar-accent pt-4 text-xs">
        <div className="font-medium">{user?.fullName}</div>
        <div className="opacity-70">{user?.roleLabel}</div>
        <button onClick={async () => { await logout(); navigate('/login'); }} className="mt-2 flex items-center gap-1 opacity-70 hover:opacity-100"><LogOut className="h-3.5 w-3.5" />Sign out</button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 shrink-0 md:block" aria-label="Sidebar"><div className="sticky top-0 h-screen">{sidebar}</div></aside>
      {open && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 shadow-xl">{sidebar}</div>
        </div>
      )}
      <main className="min-w-0 flex-1">
        <header className="no-print flex items-center justify-between bg-sidebar px-4 py-3 text-sidebar-foreground md:hidden">
          <button aria-label={open ? 'Close menu' : 'Open menu'} onClick={() => setOpen((o) => !o)}>{open ? <X /> : <Menu />}</button>
          <span className="font-display text-lg">IDAS Lab</span>
          <NavLink to="/notifications" aria-label="Notifications" className="relative"><Bell className="h-5 w-5" /></NavLink>
        </header>
        <div className="mx-auto max-w-7xl p-4 md:p-8"><Outlet /></div>
      </main>
    </div>
  );
}
