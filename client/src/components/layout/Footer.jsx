import { Link } from 'react-router-dom';
import { MapPin, Phone, Mail } from 'lucide-react';
import Logo from './Logo';

export default function Footer() {
  return (
    <footer className="mt-24 border-t border-black/5 bg-white/50 dark:border-white/5 dark:bg-ink-900/50">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-4">
        <div className="md:col-span-2">
          <Logo />
          <p className="mt-3 max-w-sm text-sm muted">Sharp cuts, hot towels and zero waiting. Book online, earn rewards and look your best — every time.</p>
          <div className="mt-4 flex flex-wrap gap-4 text-sm muted">
            <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4" />14 Hill Road, Bandra West, Mumbai</span>
            <span className="flex items-center gap-1.5"><Phone className="h-4 w-4" />+91 22 4000 1234</span>
            <span className="flex items-center gap-1.5"><Mail className="h-4 w-4" />hello@klippers.app</span>
          </div>
        </div>
        <div>
          <p className="label">Explore</p>
          <ul className="space-y-2 text-sm">
            {[['/availability', "See who's free today"], ['/services', 'Services & pricing'], ['/barbers', 'Our barbers'], ['/gallery', 'Before & after'], ['/queue', 'Live walk-in queue']].map(([to, l]) => (
              <li key={to}><Link to={to} className="hover:text-brass-500">{l}</Link></li>
            ))}
          </ul>
        </div>
        <div>
          <p className="label">Account</p>
          <ul className="space-y-2 text-sm">
            {[['/guest-booking', 'Manage guest booking'], ['/checkin', 'QR check-in'], ['/register?role=barber', 'Join as a barber'], ['/gift-cards', 'Gift cards']].map(([to, l]) => (
              <li key={to}><Link to={to} className="hover:text-brass-500">{l}</Link></li>
            ))}
          </ul>
        </div>
      </div>
      <div className="border-t border-black/5 py-5 text-center text-xs muted dark:border-white/5">
        © {new Date().getFullYear()} Klippers. All rights reserved.
      </div>
    </footer>
  );
}
