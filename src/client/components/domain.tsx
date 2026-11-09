import {
  BedDouble,
  Building2,
  Bus,
  Flag,
  Landmark,
  Megaphone,
  PartyPopper,
  Pin,
  TreePalm,
  UtensilsCrossed,
  type LucideProps,
} from 'lucide-react';
import { type ComponentType, useEffect, useState } from 'react';
import { categoryMeta } from '../../shared/categories';
import type { CategoryId, Group } from '../../shared/schemas';

const CATEGORY_ICONS: Record<CategoryId, ComponentType<LucideProps>> = {
  travel: Bus,
  activity: Flag,
  culture: Landmark,
  company: Building2,
  meal: UtensilsCrossed,
  free: TreePalm,
  accommodation: BedDouble,
  briefing: Megaphone,
  party: PartyPopper,
  other: Pin,
};

export function CategoryIcon({ category, size = 18, ...rest }: { category: CategoryId } & LucideProps) {
  const Icon = CATEGORY_ICONS[category] ?? Pin;
  return <Icon size={size} aria-hidden {...rest} />;
}

export function CategoryBubble({ category, size = 36 }: { category: CategoryId; size?: number }) {
  const meta = categoryMeta(category);
  return (
    <span className="cat-bubble" style={{ '--cat': meta.color, width: size, height: size } as React.CSSProperties}>
      <CategoryIcon category={category} size={Math.round(size * 0.5)} />
    </span>
  );
}

export function GroupChips({ ids, groups }: { ids: string[]; groups: Group[] }) {
  if (!ids.length) return null;
  return (
    <>
      {ids.map((id) => {
        const g = groups.find((x) => x.id === id);
        if (!g) return null;
        return (
          <span key={id} className="group-chip" style={{ '--chip-color': g.color } as React.CSSProperties}>
            <span className="chip-dot" />
            {g.name}
          </span>
        );
      })}
    </>
  );
}

/** Re-render every `intervalMs` so relative times and "now" markers stay fresh. */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    const onVisible = () => document.visibilityState === 'visible' && setNow(Date.now());
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [intervalMs]);
  return now;
}
