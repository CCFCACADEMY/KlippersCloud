import { useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { api } from '../../lib/api';
import { ago } from '../../lib/format';
import { cn } from '../ui';

/** In-app notification centre with live updates via Socket.IO. */
export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState({ notifications: [], unread: 0 });
  const ref = useRef();

  const load = () => api.get('/me/notifications').then((r) => setData(r.data)).catch(() => {});
  useEffect(() => {
    load();
    const onNew = () => load();
    window.addEventListener('klippers:notification', onNew);
    const onClick = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', onClick);
    return () => { window.removeEventListener('klippers:notification', onNew); document.removeEventListener('mousedown', onClick); };
  }, []);

  const markAll = async () => { await api.patch('/me/notifications/read-all'); load(); };

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="btn-ghost relative p-2" aria-label="Notifications">
        <Bell className="h-5 w-5" />
        {data.unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-pole-red px-1 text-[10px] font-bold text-white">
            {data.unread > 9 ? '9+' : data.unread}
          </span>
        )}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            className="card absolute right-0 z-50 mt-2 w-[min(92vw,360px)] overflow-hidden shadow-xl">
            <div className="flex items-center justify-between border-b border-black/5 px-4 py-3 dark:border-white/5">
              <p className="font-semibold">Notifications</p>
              <button onClick={markAll} className="flex items-center gap-1 text-xs text-brass-500 hover:underline"><CheckCheck className="h-3.5 w-3.5" /> Mark all read</button>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {data.notifications.length === 0 && <p className="p-6 text-center text-sm muted">You're all caught up ✂</p>}
              {data.notifications.map((n) => (
                <div key={n.id} className={cn('border-b border-black/5 px-4 py-3 text-sm last:border-0 dark:border-white/5', !n.is_read && 'bg-brass-400/5')}>
                  <div className="flex items-start gap-2">
                    {!n.is_read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brass-400" />}
                    <div>
                      <p className="font-semibold">{n.title}</p>
                      <p className="muted">{n.body}</p>
                      <p className="mt-1 text-xs muted">{ago(n.created_at)} · {n.channels.join(', ')}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
