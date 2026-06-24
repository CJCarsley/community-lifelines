import { useQuery } from '@tanstack/react-query';
import { useMapConfig } from '@contexts/MapConfigContext';
import { loadStatusTable, COMMUNITY_KEY } from '@features/map/statusTable';
import { LIFELINE_IDS } from '@utils/defaultLifelines';
import { toIsoOrNull, toStringOrNull } from '@utils/arcgisAttrs';
import type { LifelineStatusMap } from '@hooks/useLifelineStatuses';
import type { LifelineId, LifelineStatus } from '@types';

const HISTORY_LIMIT = 5000;
const ID_SET = new Set<string>(LIFELINE_IDS);
const VALID_STATUSES = new Set<LifelineStatus>([
  'unknown', 'stable', 'minor', 'moderate', 'major', 'extreme',
]);

export interface StatusHistoryRow {
  lifelineId: LifelineId;
  status: LifelineStatus;
  timestampMs: number;
  lastUpdated: string | null;
  updatedBy: string | null;
  notes: string | null;
}

function toLifelineId(v: unknown): LifelineId | null {
  const s = toStringOrNull(v);
  if (s === null) return null;
  const slug = s.toLowerCase().replace(/_/g, '-');
  return ID_SET.has(slug) ? (slug as LifelineId) : null;
}

function toStatus(v: unknown): LifelineStatus {
  const s = toStringOrNull(v)?.toLowerCase();
  return s !== undefined && VALID_STATUSES.has(s as LifelineStatus)
    ? (s as LifelineStatus)
    : 'unknown';
}

// All COMMUNITY lifeline_status rows (the full append-only snapshot history),
// ascending by time. Gated by `enabled` so it only fetches when the timeline is
// open (or an ended incident forces history). Windowing to an incident's
// [start, end] is applied by the consumer (the timeline slider bounds).
export function useCommunityHistory(enabled: boolean) {
  const { portalUrl, webMapId, statusTableId, mapVersion } = useMapConfig();

  const query = useQuery<StatusHistoryRow[], Error>({
    queryKey: ['lifelineStatusHistory', mapVersion, webMapId, statusTableId],
    enabled: enabled && webMapId !== '',
    staleTime: 30_000,
    queryFn: async () => {
      const table = await loadStatusTable(portalUrl, webMapId, statusTableId);
      if (!table) return [];

      const result = await table.queryFeatures({
        where: `incidentid = '${COMMUNITY_KEY}'`,
        outFields: ['*'],
        orderByFields: ['status_updated_at ASC'],
        returnGeometry: false,
        num: HISTORY_LIMIT,
      });

      const rows: StatusHistoryRow[] = [];
      for (const feature of result.features) {
        const attrs = (feature.attributes ?? {}) as Record<string, unknown>;
        const id = toLifelineId(attrs.lifeline_id);
        const ts = Number(attrs.status_updated_at);
        if (id === null || !Number.isFinite(ts)) continue;
        rows.push({
          lifelineId: id,
          status: toStatus(attrs.status),
          timestampMs: ts,
          lastUpdated: toIsoOrNull(attrs.status_updated_at),
          updatedBy: toStringOrNull(attrs.updated_by),
          notes: toStringOrNull(attrs.current_summary),
        });
      }
      return rows;
    },
  });

  const rows = query.data ?? [];
  const timestamps = [...new Set(rows.map((r) => r.timestampMs))].sort((a, b) => a - b);
  return { rows, timestamps, isLoading: query.isLoading };
}

// Reconstructs the lifeline status map as of a point in time: the latest row
// per lifeline with timestamp <= asOfMs. Assumes `rows` ascending by time.
export function statusesAsOf(rows: StatusHistoryRow[], asOfMs: number): LifelineStatusMap {
  const out: LifelineStatusMap = {};
  for (const r of rows) {
    if (r.timestampMs > asOfMs) continue;
    out[r.lifelineId] = {
      status: r.status,
      notes: r.notes,
      lastUpdated: r.lastUpdated,
      updatedBy: r.updatedBy,
    };
  }
  return out;
}
