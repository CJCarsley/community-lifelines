import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useMapConfig } from '@contexts/MapConfigContext';
import { loadStatusTable } from '@features/map/statusTable';
import { toIsoOrNull, toStringOrNull } from '@utils/arcgisAttrs';
import type GraphicType from '@arcgis/core/Graphic';
import type { LifelineId, LifelineStatus } from '@types';

const STATUS_QUERY_LIMIT = 100;

// The 8 canonical lifeline slugs — used to validate the table's lifeline_id join
// (a silent slug mismatch would blank every tile).
const LIFELINE_IDS: ReadonlySet<string> = new Set<LifelineId>([
  'safety-security',
  'food-hydration-shelter',
  'health-medical',
  'water-systems',
  'energy',
  'communications',
  'transportation',
  'hazardous-material',
]);

const VALID_STATUSES: ReadonlySet<string> = new Set<LifelineStatus>([
  'unknown',
  'stable',
  'minor',
  'moderate',
  'major',
  'extreme',
]);

export interface LifelineStatusRecord {
  status: LifelineStatus;
  notes: string | null;
  lastUpdated: string | null;
  updatedBy: string | null;
}

export type LifelineStatusMap = Partial<Record<LifelineId, LifelineStatusRecord>>;

// Normalize the stored lifeline_id to a canonical slug. Tolerates underscore
// form (safety_security) and casing; rejects anything not in the set.
function toLifelineId(v: unknown): LifelineId | null {
  const s = toStringOrNull(v);
  if (s === null) return null;
  const slug = s.toLowerCase().replace(/_/g, '-');
  return LIFELINE_IDS.has(slug) ? (slug as LifelineId) : null;
}

function toStatus(v: unknown): LifelineStatus {
  const s = toStringOrNull(v)?.toLowerCase();
  return s !== undefined && VALID_STATUSES.has(s) ? (s as LifelineStatus) : 'unknown';
}

function featureToStatus(
  feature: GraphicType,
): { id: LifelineId; record: LifelineStatusRecord } | null {
  const attrs = (feature.attributes ?? {}) as Record<string, unknown>;
  const id = toLifelineId(attrs.lifeline_id);
  if (id === null) return null;
  return {
    id,
    record: {
      status: toStatus(attrs.status),
      notes: toStringOrNull(attrs.current_summary),
      lastUpdated: toIsoOrNull(attrs.status_updated_at),
      updatedBy: toStringOrNull(attrs.updated_by),
    },
  };
}

// Live lifeline tile statuses from the WebMap-owned `lifeline_status` table.
//
// Unlike useLifelineSubmissions this is VIEWLESS (see loadStatusTable): the strip
// (desktop) and the mobile home grid render outside any MapView, and the mobile
// home never mounts a map at all.
export function useLifelineStatuses(): UseQueryResult<LifelineStatusMap, Error> {
  const { portalUrl, webMapId, statusTableId, mapVersion } = useMapConfig();

  return useQuery<LifelineStatusMap, Error>({
    queryKey: ['lifelineStatuses', mapVersion, webMapId, statusTableId],
    enabled: webMapId !== '',
    staleTime: 30_000,
    queryFn: async () => {
      const table = await loadStatusTable(portalUrl, webMapId, statusTableId);
      if (!table) return {};

      const result = await table.queryFeatures({
        where: '1=1',
        outFields: ['*'],
        returnGeometry: false,
        num: STATUS_QUERY_LIMIT,
      });

      const out: LifelineStatusMap = {};
      for (const feature of result.features) {
        const row = featureToStatus(feature);
        if (row) out[row.id] = row.record;
      }
      return out;
    },
  });
}
