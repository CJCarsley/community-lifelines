import type { Lifeline, LifelineId } from '@types';

// The 8 canonical lifeline slugs (shared: default base, status read validation,
// and per-incident seeding).
export const LIFELINE_IDS: LifelineId[] = [
  'safety-security',
  'food-hydration-shelter',
  'health-medical',
  'water-systems',
  'energy',
  'communications',
  'transportation',
  'hazardous-material',
];

// Base lifeline map (all `unknown`) overlaid by live lifeline_status rows in
// mergeLifelineStatuses. Replaces the per-event mock lifelines: incidents carry
// no lifeline data of their own — status comes entirely from the table.
export const DEFAULT_LIFELINES: Record<LifelineId, Lifeline> = Object.fromEntries(
  LIFELINE_IDS.map((id) => [
    id,
    {
      id,
      labelKey: `lifeline.${id}.label`,
      status: 'unknown' as const,
      lastUpdated: '',
    },
  ]),
) as Record<LifelineId, Lifeline>;
