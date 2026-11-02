import { Scissors, Droplets, Palette, Sparkles, Crown, Wand2, Smile, Tag } from 'lucide-react';
import { categoryLabel } from '../../lib/format';

const ICONS = { haircut: Scissors, beard: Smile, coloring: Palette, wash: Droplets, facial: Sparkles, package: Crown, custom: Wand2 };
export default function ServiceIcon({ category, className = 'h-5 w-5' }) {
  const Icon = ICONS[category] || Tag; // admin-defined types get a generic tag icon
  return <Icon className={className} />;
}
/** @deprecated use categoryLabel(); kept so existing imports resolve to the same labels */
export const CATEGORY_LABELS = new Proxy({}, { get: (_t, key) => categoryLabel(String(key)) });
export { categoryLabel };
