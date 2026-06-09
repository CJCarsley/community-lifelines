import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useMapConfig } from '@contexts/MapConfigContext';
import { loadStatusTable } from '@features/map/statusTable';
import { seedLifelineStatus } from '@features/map/seedLifelineStatus';
import { LIFELINE_IDS } from '@utils/defaultLifelines';
import { toIsoOrNull, toStringOrNull } from '@utils/arcgisAttrs';
import type GraphicType from '@arcgis/core/Graphic';
import type { LifelineId, LifelineStatus } from '@types';

// Generous: 8 lifelines × snapshot history per incident. We only keep the
// latest per lifeline, but must fetch enough rows to find them.
const STATUS_QUERY_LIMIT = 2000;

const LIFELINE_ID_SET: ReadonlySet<string> = new Set<string>(LIFELINE_IDS);

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
  return LIFELINE_ID_SET.has(slug) ? (slug as LifelineId) : null;
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

// Live lifeline tile statuses for one incident, from the WebMap-owned
// `lifeline_status` table.
//
// Append-only/snapshots: a status change inserts a NEW timestamped row, so the
// current status is the LATEST row per lifeline_id (ordered by status_updated_at
// desc; first seen wins). If the incident has no rows yet, seed 8 `unknown` rows
// (a pre-existing incident's first selection) and return unknowns.
//
// VIEWLESS (see loadStatusTable): the strip + mobile home render outside any map.
export function useLifelineStatuses(
  incidentId: string | null,
): UseQueryResult<LifelineStatusMap, Error> {
  const { portalUrl, webMapId, statusTableId, mapVersion } = useMapConfig();

  return useQuery<LifelineStatusMap, Error>({
    queryKey: ['lifelineStatuses', mapVersion, webMapId, statusTableId, incidentId],
    enabled: webMapId !== '' && incidentId !== null,
    staleTime: 30_000,
    queryFn: async () => {
      const table = await loadStatusTable(portalUrl, webMapId, statusTableId);
      if (!table || !incidentId) return {};

      const result = await table.queryFeatures({
        where: `incidentid = '${incidentId.replace(/'/g, "''")}'`,
        outFields: ['*'],
        orderByFields: ['status_updated_at DESC'],
        returnGeometry: false,
        num: STATUS_QUERY_LIMIT,
      });

      // No rows for this incident yet → seed 8 unknowns, then return unknowns.
      if (result.features.length === 0) {
        await seedLifelineStatus(table, incidentId);
        return Object.fromEntries(
          LIFELINE_IDS.map((id) => [
            id,
            { status: 'unknown', notes: null, lastUpdated: null, updatedBy: null },
          ]),
        ) as LifelineStatusMap;
      }

      // Rows are ordered newest-first; keep the first (latest) per lifeline_id.
      const out: LifelineStatusMap = {};
      for (const feature of result.features) {
        const row = featureToStatus(feature);
        if (row && !(row.id in out)) out[row.id] = row.record;
      }
      return out;
    },
  });
}
