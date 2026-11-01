import { Scissors, Droplets, Palette, Sparkles, Crown, Wand2, Smile } from 'lucide-react';

const ICONS = { haircut: Scissors, beard: Smile, coloring: Palette, wash: Droplets, facial: Sparkles, package: Crown, custom: Wand2 };
export default function ServiceIcon({ category, className = 'h-5 w-5' }) {
  const Icon = ICONS[category] || Scissors;
  return <Icon className={className} />;
}
export const CATEGORY_LABELS = { haircut: 'Haircuts', beard: 'Beard & Shave', coloring: 'Coloring', wash: 'Wash', facial: 'Facials', package: 'Packages', custom: 'Custom' };
