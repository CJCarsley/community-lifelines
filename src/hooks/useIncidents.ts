import { useQuery } from '@tanstack/react-query';
import { useMapConfig } from '@contexts/MapConfigContext';
import { loadWebMap } from '@features/incidents/loadWebMap';
import {
  findIncidentSublayers,
  INCIDENT_ID_FIELD,
  INCIDENT_NAME_FIELD,
  type IncidentGeometryKind,
} from '@features/incidents/incidentLayers';
import { toStringOrNull } from '@utils/arcgisAttrs';
import type { IncidentRecord } from '@types';

const INCIDENTS_QUERY_LIMIT = 2000;

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

      const byId = new Map<string, IncidentRecord>();
      const kinds: IncidentGeometryKind[] = ['point', 'line', 'area'];

      for (const kind of kinds) {
        const layer = sublayers[kind];
        if (!layer) continue;
        await layer.load();

        const result = await layer.queryFeatures({
          where: '1=1',
          outFields: [INCIDENT_ID_FIELD, INCIDENT_NAME_FIELD],
          returnDistinctValues: true,
          returnGeometry: false,
          num: INCIDENTS_QUERY_LIMIT,
        });

        for (const feature of result.features) {
          const id = toStringOrNull(feature.attributes[INCIDENT_ID_FIELD]);
          if (id === null) continue;
          const name = toStringOrNull(feature.attributes[INCIDENT_NAME_FIELD]) ?? id;
          const rec = byId.get(id) ?? { incidentId: id, name, geometryTypes: [] };
          if (!rec.geometryTypes.includes(kind)) rec.geometryTypes.push(kind);
          byId.set(id, rec);
        }
      }

      return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
    },
  });

  return {
    incidents: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
  };
}
