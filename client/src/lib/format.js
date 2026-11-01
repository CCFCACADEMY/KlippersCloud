import { format, formatDistanceToNow, parseISO } from 'date-fns';

export const money = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n || 0));
export const compactMoney = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(Number(n || 0));
const d = (v) => (typeof v === 'string' ? parseISO(v) : v);
/**
 * Shift an instant to the "wall clock" of an IANA timezone so date-fns can
 * format it. Appointment times are shown in the SHOP's timezone (appt.timezone),
 * not the viewer's, so everyone sees the same time the barber sees.
 */
export const SHOP_TZ = 'America/New_York';
export const inTz = (v, tz = SHOP_TZ) => new Date(d(v).toLocaleString('en-US', { timeZone: tz }));
export const fmtDate = (v, f = 'EEE, MMM d', tz) => format(tz === null ? d(v) : inTz(v, tz), f);
export const fmtTime = (v, tz) => format(inTz(v, tz), 'h:mm a');
export const fmtDateTime = (v, tz) => format(inTz(v, tz), "EEE, MMM d '·' h:mm a");
export const hourIn = (v, tz) => inTz(v, tz).getHours();
export const ago = (v) => formatDistanceToNow(d(v), { addSuffix: true });
export const initials = (name = '') => name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const STATUS_STYLES = {
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  confirmed: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  checked_in: 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300',
  in_progress: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-500/15 dark:text-indigo-300',
  completed: 'bg-brass-100 text-brass-700 dark:bg-brass-400/15 dark:text-brass-300',
  cancelled: 'bg-zinc-200 text-zinc-700 dark:bg-white/10 dark:text-white/60',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
  no_show: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
  paid: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  refunded: 'bg-zinc-200 text-zinc-700 dark:bg-white/10 dark:text-white/60',
  partially_refunded: 'bg-zinc-200 text-zinc-700 dark:bg-white/10 dark:text-white/60',
  failed: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
  waiting: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  serving: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
};
