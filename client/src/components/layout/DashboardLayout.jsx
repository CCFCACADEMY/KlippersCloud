/**
 * Dashboard shell: collapsible sidebar on desktop, bottom tab bar on mobile.
 * Menu items are role-specific.
 */
import { Suspense, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, CalendarDays, Heart, Gift, User, Clock, Scissors, Users, Star, Ticket, BarChart3,
  Settings, LogOut, ListOrdered, CreditCard, Sparkles, Menu, X, Store,
} from 'lucide-react';
import Logo from './Logo';
import ThemeToggle from './ThemeToggle';
import NotificationBell from './NotificationBell';
import { useAuth } from '../../context/AuthContext';
import { Avatar, PageLoader, cn } from '../ui';

const MENUS = {
  customer: [
    ['/dashboard', 'Overview', LayoutDashboard], ['/dashboard/appointments', 'Appointments', CalendarDays],
    ['/dashboard/favorites', 'Favorites', Heart], ['/dashboard/rewards', 'Rewards', Gift],
    ['/style-advisor', 'Style Advisor', Sparkles], ['/dashboard/profile', 'Profile', User],
  ],
  barber: [
    ['/barber', 'Today', LayoutDashboard], ['/barber/calendar', 'Calendar', CalendarDays],
    ['/barber/schedule', 'Hours & Time off', Clock], ['/barber/services', 'My Services', Scissors],
    ['/barber/customers', 'Customers', Users], ['/barber/queue', 'Walk-ins & Queue', ListOrdered],
    ['/barber/reviews', 'Reviews', Star], ['/barber/profile', 'Profile', User],
  ],
  admin: [
    ['/admin', 'Dashboard', LayoutDashboard], ['/admin/appointments', 'Appointments', CalendarDays],
    ['/admin/customers', 'Users', Users], ['/admin/barbers', 'Barbers', Scissors],
    ['/admin/services', 'Services', Store], ['/admin/payments', 'Payments', CreditCard],
    ['/admin/reviews', 'Reviews', Star], ['/admin/coupons', 'Coupons', Ticket],
    ['/admin/queue', 'Queue', ListOrdered], ['/admin/reports', 'Reports', BarChart3], ['/admin/settings', 'Settings', Settings],
  ],
};

export default function DashboardLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const menu = MENUS[user.role] || [];
  const end = (to) => ['/dashboard', '/barber', '/admin'].includes(to);

  const nav = (
    <nav className="space-y-1">
      {menu.map(([to, label, Icon]) => (
        <NavLink key={to} to={to} end={end(to)} onClick={() => setOpen(false)}
          className={({ isActive }) => cn('flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition',
            isActive ? 'bg-brass-400 text-ink-900 shadow-glow' : 'muted hover:bg-black/5 hover:text-ink-900 dark:hover:bg-white/5 dark:hover:text-white')}>
          <Icon className="h-4.5 h-[18px] w-[18px]" /> {label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen lg:flex">
      {/* Sidebar (desktop) */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-black/5 bg-white/60 p-4 dark:border-white/5 dark:bg-ink-900 lg:flex">
        <div className="mb-8 px-2 pt-2"><Logo /></div>
        <div className="flex-1 overflow-y-auto">{nav}</div>
        <div className="mt-4 flex items-center gap-3 rounded-xl bg-black/5 p-3 dark:bg-white/5">
          <Avatar name={user.name} src={user.avatar_url} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{user.name}</p>
            <p className="text-xs capitalize muted">{user.role}</p>
          </div>
          <button onClick={async () => { await logout(); navigate('/'); }} className="btn-ghost p-2" aria-label="Sign out"><LogOut className="h-4 w-4" /></button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-black/5 bg-cream/80 px-4 backdrop-blur-xl dark:border-white/5 dark:bg-ink-950/80 sm:px-6">
          <div className="flex items-center gap-2 lg:hidden">
            <button className="btn-ghost p-2" onClick={() => setOpen(true)} aria-label="Open menu"><Menu className="h-5 w-5" /></button>
            <Logo />
          </div>
          <NavLink to="/" className="hidden text-sm muted hover:text-brass-500 lg:block">← Back to site</NavLink>
          <div className="flex items-center gap-1">
            {user.role === 'customer' && <NavLink to="/book" className="btn-primary mr-1 hidden sm:inline-flex">Book now</NavLink>}
            <ThemeToggle />
            <NotificationBell />
          </div>
        </header>
        <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
          <Suspense fallback={<PageLoader />}><Outlet /></Suspense>
        </main>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 lg:hidden" onClick={() => setOpen(false)}>
          <aside className="h-full w-72 bg-cream p-4 dark:bg-ink-900" onClick={(e) => e.stopPropagation()}>
            <div className="mb-6 flex items-center justify-between"><Logo /><button className="btn-ghost p-2" onClick={() => setOpen(false)} aria-label="Close menu"><X className="h-5 w-5" /></button></div>
            {nav}
            <button onClick={async () => { await logout(); navigate('/'); }} className="btn-secondary mt-6 w-full"><LogOut className="h-4 w-4" /> Sign out</button>
          </aside>
        </div>
      )}
    </div>
  );
}
