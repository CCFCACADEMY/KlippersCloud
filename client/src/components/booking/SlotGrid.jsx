import { motion } from 'framer-motion';
import { cn } from '../ui';
import { fmtTime, hourIn } from '../../lib/format';

/** Time slots grouped Morning / Afternoon / Evening. Booked slots are shown struck-through. */
export default function SlotGrid({ slots, value, onChange, timezone }) {
  const groups = { Morning: [], Afternoon: [], Evening: [] };
  slots.forEach((s) => {
    const h = hourIn(s.start, timezone);
    groups[h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : 'Evening'].push(s);
  });
  return (
    <div className="space-y-5">
      {Object.entries(groups).filter(([, list]) => list.length).map(([name, list]) => (
        <div key={name}>
          <p className="label">{name}</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {list.map((s, i) => (
              <motion.button key={s.start} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.015 }}
                disabled={!s.available} onClick={() => onChange(s.start)}
                className={cn('rounded-xl border px-2 py-2.5 text-sm font-semibold transition',
                  value === s.start ? 'border-brass-400 bg-brass-400 text-ink-900 shadow-glow'
                    : s.available ? 'border-black/10 hover:border-brass-400 hover:text-brass-500 dark:border-white/10'
                      : 'cursor-not-allowed border-transparent bg-black/5 text-black/25 line-through dark:bg-white/5 dark:text-white/20')}>
                {fmtTime(s.start, timezone)}
              </motion.button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
