import { useState } from 'react';

/** Drag-to-compare before/after slider (pointer + keyboard accessible). */
export default function BeforeAfter({ item }) {
  const [pos, setPos] = useState(50);
  return (
    <figure className="overflow-hidden rounded-2xl">
      <div className="relative aspect-square select-none bg-ink-800">
        <img src={item.after_url} alt={`${item.title} — after`} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 overflow-hidden" style={{ width: `${pos}%` }}>
          <img src={item.before_url} alt={`${item.title} — before`} loading="lazy" className="h-full max-w-none object-cover" style={{ width: `${10000 / pos}%` }} />
        </div>
        <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-brass-400" style={{ left: `${pos}%` }}>
          <span className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brass-400 px-2 py-1 text-xs font-bold text-ink-900">⇆</span>
        </div>
        <span className="absolute left-3 top-3 rounded bg-black/60 px-2 py-0.5 text-xs text-white">Before</span>
        <span className="absolute right-3 top-3 rounded bg-brass-400 px-2 py-0.5 text-xs font-semibold text-ink-900">After</span>
        <input type="range" min={5} max={95} value={pos} onChange={(e) => setPos(+e.target.value)} aria-label="Compare before and after"
          className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0" />
      </div>
      <figcaption className="mt-2 text-sm font-semibold">{item.title}{item.barber_name && <span className="font-normal muted"> · by {item.barber_name}</span>}</figcaption>
    </figure>
  );
}
