import { useQuery } from '@tanstack/react-query';
import { useMapConfig } from '@contexts/MapConfigContext';
import { loadWebMap } from '@features/incidents/loadWebMap';
import {
  findIncidentSublayers,
  INCIDENT_ID_FIELD,
  INCIDENT_NAME_FIELD,
  INCIDENT_START_FIELD,
  INCIDENT_END_FIELD,
  type IncidentGeometryKind,
} from '@features/incidents/incidentLayers';
import { toStringOrNull } from '@utils/arcgisAttrs';
import type { IncidentRecord } from '@types';

const INCIDENTS_QUERY_LIMIT = 2000;

// ArcGIS date fields come back as epoch ms (number). Tolerate string/empty.
function toMsOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Accumulator carries epoch ms for min/max math; converted to ISO at the end.
type IncidentAccum = {
  incidentId: string;
  name: string;
  geometryTypes: IncidentGeometryKind[];
  startMs: number | null; // earliest reptime across features
  endMs: number | null;   // latest incidentended (null ⇒ still active)
};

// Reads the distinct incidents from the Incidents service's three geometry
// sublayers and merges them by incidentid (an incident can span layers).
// VIEWLESS (see loadWebMap): the selector renders outside any MapView.
export function useIncidents() {
  const { portalUrl, webMapId, mapVersion } = useMapConfig();

  const query = useQuery<IncidentRecord[], Error>({
    queryKey: ['incidents', mapVersion, webMapId],
    enabled: webMapId !== '',
    staleTime: 30_000,
    queryFn: async () => {
      const webmap = await loadWebMap(portalUrl, webMapId);
      const sublayers = findIncidentSublayers(webmap);

      const byId = new Map<string, IncidentAccum>();
      const kinds: IncidentGeometryKind[] = ['point', 'line', 'area'];

      for (const kind of kinds) {
        const layer = sublayers[kind];
        if (!layer) continue;
        await layer.load();

        // Need date fields per feature, so no returnDistinctValues — we merge by
        // incidentid below (one incident spans features/layers).
        const result = await layer.queryFeatures({
          where: '1=1',
          outFields: [
            INCIDENT_ID_FIELD,
            INCIDENT_NAME_FIELD,
            INCIDENT_START_FIELD,
            INCIDENT_END_FIELD,
          ],
          returnGeometry: false,
          num: INCIDENTS_QUERY_LIMIT,
        });

        for (const feature of result.features) {
          const id = toStringOrNull(feature.attributes[INCIDENT_ID_FIELD]);
          if (id === null) continue;
          const name = toStringOrNull(feature.attributes[INCIDENT_NAME_FIELD]) ?? id;
          const startMs = toMsOrNull(feature.attributes[INCIDENT_START_FIELD]);
          const endMs = toMsOrNull(feature.attributes[INCIDENT_END_FIELD]);

          const rec =
            byId.get(id) ??
            { incidentId: id, name, geometryTypes: [], startMs: null, endMs: null };
          if (!rec.geometryTypes.includes(kind)) rec.geometryTypes.push(kind);
          // Start = earliest report time; end = latest recorded end.
          if (startMs !== null) rec.startMs = rec.startMs === null ? startMs : Math.min(rec.startMs, startMs);
          if (endMs !== null) rec.endMs = rec.endMs === null ? endMs : Math.max(rec.endMs, endMs);
          byId.set(id, rec);
        }
      }

      return [...byId.values()]
        .map<IncidentRecord>((r) => ({
          incidentId: r.incidentId,
          name: r.name,
          geometryTypes: r.geometryTypes,
          startDate: r.startMs === null ? null : new Date(r.startMs).toISOString(),
          endDate: r.endMs === null ? null : new Date(r.endMs).toISOString(),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
  });

  return {
    incidents: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
  };
}
