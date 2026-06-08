import type { LifelineStatusMap } from '@hooks/useLifelineStatuses';
import type { Lifeline, LifelineId } from '@types';

// Overlays live lifeline_status rows onto the (currently mock) event lifelines.
// Only status/notes/lastUpdated are owned by the table; event + incident
// metadata stays on the base record until the event-selector workstream lands.
// Falls back to the base value field-by-field when a live row omits it, and to
// the whole base map when there's no live data yet (graceful pre-load / error).
export function mergeLifelineStatuses(
  base: Record<LifelineId, Lifeline> | null | undefined,
  live: LifelineStatusMap | undefined,
): Record<LifelineId, Lifeline> | null {
  if (!base) return null;
  if (!live) return base;

  const out = {} as Record<LifelineId, Lifeline>;
  for (const id of Object.keys(base) as LifelineId[]) {
    const b = base[id];
    const l = live[id];
    out[id] = l
      ? {
          ...b,
          status: l.status,
          notes: l.notes ?? b.notes,
          lastUpdated: l.lastUpdated ?? b.lastUpdated,
        }
      : b;
  }
  return out;
}
