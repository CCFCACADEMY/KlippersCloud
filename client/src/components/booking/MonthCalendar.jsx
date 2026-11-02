/**
 * Mini month calendar used in the booking flow.
 * `availability` = { 'YYYY-MM-DD': openSlotCount } renders dots under days.
 */
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isBefore, isSameDay, isSameMonth, startOfDay, startOfMonth, startOfWeek } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../ui';

export default function MonthCalendar({ month, onMonthChange, selected, onSelect, availability = {}, maxDate }) {
  const days = eachDayOfInterval({ start: startOfWeek(startOfMonth(month)), end: endOfWeek(endOfMonth(month)) });
  const today = startOfDay(new Date());
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <button className="btn-ghost p-2" onClick={() => onMonthChange(addMonths(month, -1))} disabled={isSameMonth(month, today)} aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></button>
        <p className="font-display text-lg font-bold">{format(month, 'MMMM yyyy')}</p>
        <button className="btn-ghost p-2" onClick={() => onMonthChange(addMonths(month, 1))} aria-label="Next month"><ChevronRight className="h-4 w-4" /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold uppercase muted">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <div key={i} className="py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const key = format(day, 'yyyy-MM-dd');
          const open = availability[key];
          // Fully booked / day-off dates stay clickable so customers can join the waiting list
          const disabled = isBefore(day, today) || !isSameMonth(day, month) || (maxDate && day > maxDate);
          const full = open === 0;
          const isSel = selected && isSameDay(day, selected);
          return (
            <button key={key} disabled={disabled} onClick={() => onSelect(day)}
              className={cn('relative flex aspect-square flex-col items-center justify-center rounded-xl text-sm font-medium transition',
                !isSameMonth(day, month) && 'invisible',
                isSel ? 'bg-brass-400 text-ink-900 shadow-glow' : 'hover:bg-black/5 dark:hover:bg-white/10',
                disabled && !isSel && 'cursor-not-allowed opacity-30 hover:bg-transparent',
                full && !isSel && !disabled && 'text-black/30 line-through dark:text-white/30',
                isSameDay(day, today) && !isSel && 'ring-1 ring-brass-400/60')}
              aria-label={`${format(day, 'EEEE, MMMM d')}${full ? ' — fully booked' : open ? ` — ${open} open slots` : ''}`}>
              {format(day, 'd')}
              {open > 0 && !isSel && <span className="absolute bottom-1.5 h-1 w-1 rounded-full bg-emerald-500" />}
            </button>
          );
        })}
      </div>
      <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs muted"><span className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Has open slots</span><span><span className="line-through">12</span> Full or closed: tap to join the waiting list</span></p>
    </div>
  );
}
