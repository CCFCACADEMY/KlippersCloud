import { Link } from 'react-router-dom';
import { Scissors } from 'lucide-react';

export default function Logo({ to = '/' }) {
  return (
    <Link to={to} className="group flex items-center gap-2" aria-label="Klippers home">
      <span className="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl bg-ink-900 ring-1 ring-brass-400/40">
        <Scissors className="h-5 w-5 text-brass-400 transition group-hover:rotate-12" />
      </span>
      <span className="font-display text-xl font-extrabold tracking-wide">
        KLIPP<span className="text-brass-400">ERS</span>
      </span>
    </Link>
  );
}
