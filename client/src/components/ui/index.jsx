/**
 * Klippers UI kit — small, composable, theme-aware primitives.
 */
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, Star, X, Inbox } from 'lucide-react';
import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { STATUS_STYLES, initials } from '../../lib/format';

export const cn = clsx;

export function Spinner({ className }) {
  return <Loader2 className={cn('h-5 w-5 animate-spin text-brass-400', className)} aria-label="Loading" />;
}

export function PageLoader() {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4">
      <div className="h-14 w-4 overflow-hidden rounded-full ring-2 ring-brass-400/60">
        <div className="pole-stripes h-full w-full animate-pole" />
      </div>
      <p className="text-sm muted">Loading…</p>
    </div>
  );
}

export function Button({ variant = 'primary', loading, className, children, ...props }) {
  return (
    <button className={cn(`btn-${variant}`, className)} disabled={loading || props.disabled} {...props}>
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

export function Card({ className, children, ...props }) {
  return <div className={cn('card', className)} {...props}>{children}</div>;
}

export function Badge({ status, children, className }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize',
      STATUS_STYLES[status] || 'bg-black/5 text-ink-700 dark:bg-white/10 dark:text-white/70', className)}>
      {children || String(status).replace(/_/g, ' ')}
    </span>
  );
}

export function Field({ label, error, hint, children, className }) {
  return (
    <label className={cn('block', className)}>
      {label && <span className="label">{label}</span>}
      {children}
      {hint && !error && <span className="mt-1 block text-xs muted">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-red-500">{error}</span>}
    </label>
  );
}

export const Input = (props) => <input className="input" {...props} />;
export const Textarea = (props) => <textarea className="input min-h-[90px]" {...props} />;
export function Select({ children, ...props }) {
  return <select className="input pr-8" {...props}>{children}</select>;
}

export function Toggle({ checked, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      className="flex items-center gap-3 text-sm">
      <span className={cn('relative h-6 w-11 rounded-full transition', checked ? 'bg-brass-400' : 'bg-black/15 dark:bg-white/15')}>
        <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', checked ? 'left-[22px]' : 'left-0.5')} />
      </span>
      {label}
    </button>
  );
}

export function Avatar({ src, name, size = 'md', className }) {
  const sizes = { sm: 'h-8 w-8 text-xs', md: 'h-11 w-11 text-sm', lg: 'h-16 w-16 text-lg', xl: 'h-28 w-28 text-3xl' };
  const [broken, setBroken] = useState(false);
  return src && !broken ? (
    <img src={src} alt={name} loading="lazy" onError={() => setBroken(true)} className={cn('rounded-full object-cover ring-2 ring-brass-400/40', sizes[size], className)} />
  ) : (
    <div className={cn('flex items-center justify-center rounded-full bg-brass-400/20 font-bold text-brass-500 dark:text-brass-300', sizes[size], className)}>
      {initials(name)}
    </div>
  );
}

export function Stars({ value = 0, size = 14, onChange }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => {
        const icon = <Star style={{ width: size, height: size }} className={i <= Math.round(value) ? 'fill-brass-400 text-brass-400' : 'text-black/20 dark:text-white/20'} />;
        // Read-only stars render as spans so they can live inside clickable cards
        return onChange
          ? <button key={i} type="button" aria-label={`${i} star${i > 1 ? 's' : ''}`} onClick={() => onChange(i)} className="p-0.5 transition hover:scale-110">{icon}</button>
          : <span key={i}>{icon}</span>;
      })}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div role="dialog" aria-modal="true" aria-label={title}
            className={cn('card max-h-[92vh] w-full overflow-y-auto rounded-b-none p-6 sm:rounded-2xl', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}
            initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', damping: 26, stiffness: 300 }} onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between gap-4">
              <h3 className="text-xl font-bold">{title}</h3>
              <button onClick={onClose} className="btn-ghost p-2" aria-label="Close"><X className="h-5 w-5" /></button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function EmptyState({ icon: Icon = Inbox, title, text, action }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-black/10 px-6 py-12 text-center dark:border-white/10">
      <Icon className="mb-3 h-10 w-10 text-brass-400" />
      <p className="font-semibold">{title}</p>
      {text && <p className="mt-1 max-w-sm text-sm muted">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function StatCard({ label, value, icon: Icon, sub, trend }) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider muted">{label}</p>
        {Icon && <span className="rounded-lg bg-brass-400/15 p-2 text-brass-500 dark:text-brass-300"><Icon className="h-4 w-4" /></span>}
      </div>
      <p className="mt-2 font-display text-3xl font-bold">{value}</p>
      {(sub || trend !== undefined) && (
        <p className="mt-1 text-xs muted">
          {trend !== undefined && trend !== null && (
            <span className={cn('mr-1 font-semibold', trend >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500')}>
              {trend >= 0 ? '▲' : '▼'} {Math.abs(trend)}%
            </span>
          )}
          {sub}
        </p>
      )}
    </Card>
  );
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="scrollbar-none flex gap-1 overflow-x-auto rounded-xl bg-black/5 p-1 dark:bg-white/5">
      {tabs.map((t) => (
        <button key={t.value} onClick={() => onChange(t.value)}
          className={cn('relative whitespace-nowrap rounded-lg px-3.5 py-1.5 text-sm font-medium transition',
            value === t.value ? 'text-ink-900' : 'muted hover:text-ink-900 dark:hover:text-white')}>
          {value === t.value && <motion.span layoutId={`tab-${tabs.map((x) => x.value).join()}`} className="absolute inset-0 rounded-lg bg-brass-400" transition={{ type: 'spring', duration: 0.4 }} />}
          <span className="relative">{t.label}</span>
        </button>
      ))}
    </div>
  );
}

/** Simple responsive table. columns: [{ key, label, render?, className? }] */
export function Table({ columns, rows, empty = 'No records', onRowClick }) {
  if (!rows?.length) return <EmptyState title={empty} />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-black/5 text-xs uppercase tracking-wider muted dark:border-white/5">
            {columns.map((c) => <th key={c.key} className={cn('px-4 py-3 font-semibold', c.className)}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id || i} onClick={() => onRowClick?.(r)}
              className={cn('border-b border-black/5 last:border-0 dark:border-white/5', onRowClick && 'cursor-pointer hover:bg-black/[.02] dark:hover:bg-white/[.03]')}>
              {columns.map((c) => <td key={c.key} className={cn('px-4 py-3', c.className)}>{c.render ? c.render(r) : r[c.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
