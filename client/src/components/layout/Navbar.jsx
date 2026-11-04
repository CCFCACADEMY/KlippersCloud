import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Menu, X, LayoutDashboard, LogOut } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import Logo from './Logo';
import ThemeToggle from './ThemeToggle';
import NotificationBell from './NotificationBell';
import { useAuth, homeFor } from '../../context/AuthContext';
import { Avatar, cn } from '../ui';

const LINKS = [
  ['/availability', "See who's free"], ['/services', 'Services'], ['/barbers', 'Barbers'], ['/gallery', 'Gallery'],
  ['/style-advisor', 'Style Advisor'], ['/memberships', 'Memberships'], ['/gift-cards', 'Gift Cards'],
];

export default function Navbar() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-40 border-b border-black/5 bg-cream/80 backdrop-blur-xl dark:border-white/5 dark:bg-ink-950/80">
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Logo />
        <div className="hidden items-center gap-0.5 xl:flex">
          {LINKS.map(([to, label]) => (
            <NavLink key={to} to={to} className={({ isActive }) => cn('whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition hover:text-brass-500', isActive ? 'text-brass-500' : 'muted')}>
              {label}
            </NavLink>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          {user ? (
            <>
              <NotificationBell />
              <Link to={homeFor(user.role)} className="ml-1 hidden items-center gap-2 rounded-xl px-2 py-1 hover:bg-black/5 dark:hover:bg-white/5 sm:flex">
                <Avatar name={user.name} src={user.avatar_url} size="sm" />
                <span className="text-sm font-medium">{user.name.split(' ')[0]}</span>
              </Link>
            </>
          ) : (
            <Link to="/login" className="btn-ghost hidden sm:inline-flex">Sign in</Link>
          )}
          <Link to="/book" className="btn-primary ml-1 hidden sm:inline-flex">Book now</Link>
          <button className="btn-ghost p-2 xl:hidden" onClick={() => setOpen((o) => !o)} aria-label="Menu">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </nav>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden xl:hidden">
            <div className="space-y-1 px-4 pb-4">
              {LINKS.map(([to, label]) => (
                <NavLink key={to} to={to} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2.5 font-medium hover:bg-black/5 dark:hover:bg-white/5">{label}</NavLink>
              ))}
              <div className="flex gap-2 pt-2">
                <Link to="/book" onClick={() => setOpen(false)} className="btn-primary flex-1">Book now</Link>
                {user ? (
                  <>
                    <Link to={homeFor(user.role)} onClick={() => setOpen(false)} className="btn-secondary flex-1"><LayoutDashboard className="h-4 w-4" />Dashboard</Link>
                    <button className="btn-secondary" onClick={async () => { await logout(); setOpen(false); navigate('/'); }} aria-label="Sign out"><LogOut className="h-4 w-4" /></button>
                  </>
                ) : (
                  <Link to="/login" onClick={() => setOpen(false)} className="btn-secondary flex-1">Sign in</Link>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
