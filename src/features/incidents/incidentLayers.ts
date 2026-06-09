import type WebMapType from '@arcgis/core/WebMap';
import type FeatureLayerType from '@arcgis/core/layers/FeatureLayer';

// The Incidents service (Emergency Information Manager) — a group layer with
// three geometry sublayers joined by `incidentid`. Discover by title; the
// documented web-map layer ids are fallbacks if a title is ever changed.
const SUBLAYERS = {
  point: { title: 'Points', id: '19e996b6623-layer-11' },
  line: { title: 'Lines', id: '19e996b6621-layer-10' },
  area: { title: 'Areas', id: '19e996b661f-layer-9' },
} as const;

export type IncidentGeometryKind = keyof typeof SUBLAYERS;

export type IncidentSublayers = Record<IncidentGeometryKind, FeatureLayerType | null>;

export const INCIDENT_ID_FIELD = 'incidentid';
export const INCIDENT_NAME_FIELD = 'incidentnm';

export function findIncidentSublayers(webmap: WebMapType): IncidentSublayers {
  const find = (title: string, id: string): FeatureLayerType | null => {
    const layer =
      webmap.allLayers.find((l) => l.title === title) ??
      webmap.allLayers.find((l) => l.id === id);
    return (layer as FeatureLayerType | undefined) ?? null;
  };

  return {
    point: find(SUBLAYERS.point.title, SUBLAYERS.point.id),
    line: find(SUBLAYERS.line.title, SUBLAYERS.line.id),
    area: find(SUBLAYERS.area.title, SUBLAYERS.area.id),
  };
}
