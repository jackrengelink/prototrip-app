import type { CategoryId } from './schemas';

export interface CategoryMeta {
  id: CategoryId;
  color: string;
  emoji: string;
  /** Lower-case keywords (EN + NL) used to guess a category from a title or an imported value. */
  keywords: string[];
}

export const CATEGORIES: CategoryMeta[] = [
  {
    id: 'travel',
    color: '#2563eb',
    emoji: '🚌',
    keywords: [
      'travel', 'reis', 'reizen', 'bus', 'coach', 'train', 'trein', 'flight', 'vlucht', 'fly', 'vliegen',
      'airport', 'vliegveld', 'luchthaven', 'transfer', 'departure', 'vertrek', 'arrival', 'aankomst',
      'metro', 'tram', 'ferry', 'boot', 'taxi', 'check-in airport', 'boarding',
    ],
  },
  {
    id: 'activity',
    color: '#16a34a',
    emoji: '🎯',
    keywords: [
      'activity', 'activiteit', 'tour', 'rondleiding', 'excursion', 'excursie', 'hike', 'wandeling', 'walk',
      'game', 'spel', 'bike', 'fiets', 'workshop', 'escape', 'karting', 'sport', 'kayak', 'boat tour',
    ],
  },
  {
    id: 'culture',
    color: '#9333ea',
    emoji: '🏛️',
    keywords: [
      'culture', 'cultuur', 'museum', 'gallery', 'galerie', 'expo', 'exhibition', 'tentoonstelling',
      'city tour', 'stadstour', 'monument', 'castle', 'kasteel', 'church', 'kerk', 'theatre', 'theater',
    ],
  },
  {
    id: 'company',
    color: '#0891b2',
    emoji: '🏢',
    keywords: [
      'company', 'bedrijf', 'bedrijfsbezoek', 'visit', 'bezoek', 'lecture', 'lezing', 'talk', 'presentation',
      'presentatie', 'university', 'universiteit', 'campus', 'lab', 'office', 'kantoor', 'studio', 'startup',
    ],
  },
  {
    id: 'meal',
    color: '#ea580c',
    emoji: '🍽️',
    keywords: [
      'meal', 'maaltijd', 'eten', 'food', 'breakfast', 'ontbijt', 'lunch', 'dinner', 'diner', 'avondeten',
      'restaurant', 'brunch', 'snack', 'bbq', 'barbecue', 'drinks', 'borrel', 'koffie', 'coffee',
    ],
  },
  {
    id: 'free',
    color: '#64748b',
    emoji: '🕶️',
    keywords: ['free', 'vrij', 'vrije tijd', 'free time', 'leisure', 'own time', 'eigen tijd', 'rest', 'rust', 'shopping', 'winkelen'],
  },
  {
    id: 'accommodation',
    color: '#0d9488',
    emoji: '🛏️',
    keywords: [
      'accommodation', 'accommodatie', 'hotel', 'hostel', 'check-in', 'check in', 'checkin', 'check-out',
      'check out', 'checkout', 'inchecken', 'uitchecken', 'room', 'kamer', 'sleep', 'slapen', 'overnachting',
    ],
  },
  {
    id: 'briefing',
    color: '#ca8a04',
    emoji: '📣',
    keywords: [
      'briefing', 'meeting', 'vergadering', 'overleg', 'gather', 'verzamelen', 'meet', 'appel', 'roll call',
      'announcement', 'mededeling', 'kick-off', 'kickoff', 'evaluation', 'evaluatie', 'debrief',
    ],
  },
  {
    id: 'party',
    color: '#db2777',
    emoji: '🎉',
    keywords: ['party', 'feest', 'club', 'bar', 'pub', 'kroeg', 'night', 'nacht', 'stappen', 'gala', 'karaoke', 'pubcrawl', 'pub crawl'],
  },
  { id: 'other', color: '#475569', emoji: '📌', keywords: ['other', 'overig', 'anders'] },
];

export const CATEGORY_MAP: Record<CategoryId, CategoryMeta> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c]),
) as Record<CategoryId, CategoryMeta>;

export function categoryMeta(id: string | undefined): CategoryMeta {
  return (id && CATEGORY_MAP[id as CategoryId]) || CATEGORY_MAP.other;
}

/** Map a free-form value (e.g. from a spreadsheet) to a category id. */
export function parseCategory(value: string | undefined): CategoryId | undefined {
  const v = (value || '').trim().toLowerCase();
  if (!v) return undefined;
  const exact = CATEGORIES.find((c) => c.id === v);
  if (exact) return exact.id;
  const byKeyword = CATEGORIES.find((c) => c.keywords.includes(v));
  if (byKeyword) return byKeyword.id;
  return guessCategory(v);
}

/**
 * Best-effort guess based on words in a title. The keyword that appears first wins
 * ("Lunch at the hostel" is a meal, "Check-in at the hostel" is accommodation);
 * on a tie the longer keyword wins.
 */
export function guessCategory(title: string): CategoryId | undefined {
  const t = ` ${title.toLowerCase()} `;
  let best: { id: CategoryId; index: number; len: number } | undefined;
  for (const c of CATEGORIES) {
    if (c.id === 'other') continue;
    for (const k of c.keywords) {
      const re = new RegExp(`(^|[^a-z0-9à-ÿ])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9à-ÿ]|$)`);
      const m = re.exec(t);
      if (!m) continue;
      const index = m.index + m[1].length;
      if (!best || index < best.index || (index === best.index && k.length > best.len)) best = { id: c.id, index, len: k.length };
    }
  }
  return best?.id;
}
