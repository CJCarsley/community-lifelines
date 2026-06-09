import { useQuery } from '@tanstack/react-query';
import { useMapConfig } from '@contexts/MapConfigContext';
import { loadWebMap } from './loadWebMap';
import { findIncidentSublayers } from './incidentLayers';

export const INCIDENT_TYPE_FIELD = 'incidenttp';

export interface IncidentType {
  code: string | number;
  label: string;
  // Opaque ArcGIS symbol (passed straight to symbolUtils for preview).
  symbol: unknown;
}

// Reads the incident-type choices from the Points layer's `incidenttp`
// coded-value domain, pairing each with the symbol the web map's
// UniqueValueRenderer draws for it. VIEWLESS (see loadWebMap).
export function useIncidentTypes() {
  const { portalUrl, webMapId, mapVersion } = useMapConfig();

  const query = useQuery<IncidentType[], Error>({
    queryKey: ['incidentTypes', mapVersion, webMapId],
    enabled: webMapId !== '',
    staleTime: Infinity, // a field domain effectively never changes at runtime
    queryFn: async () => {
      const webmap = await loadWebMap(portalUrl, webMapId);
      const points = findIncidentSublayers(webmap).point;
      if (!points) return [];
      await points.load();

      const field = points.fields?.find(
        (f) => f.name.toLowerCase() === INCIDENT_TYPE_FIELD,
      );
      const domain = field?.domain;
      const codedValues =
        domain && domain.type === 'coded-value' ? domain.codedValues : [];

      // Map each coded value to its rendered symbol.
      const symbolByValue = new Map<string, unknown>();
      const renderer = points.renderer;
      if (renderer && renderer.type === 'unique-value') {
        for (const info of renderer.uniqueValueInfos ?? []) {
          if (info.value != null) symbolByValue.set(String(info.value), info.symbol);
        }
      }

      return codedValues.map((cv) => ({
        code: cv.code,
        label: cv.name,
        symbol: symbolByValue.get(String(cv.code)) ?? null,
      }));
    },
  });

  return { types: query.data ?? [], isLoading: query.isLoading };
}
