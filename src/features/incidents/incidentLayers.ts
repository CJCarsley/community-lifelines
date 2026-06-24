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
// Date fields (epoch ms). reptime = Report Time (start); incidentended = end
// (non-null ⇒ the incident has ended). Present on all three geometry sublayers.
export const INCIDENT_START_FIELD = 'reptime';
export const INCIDENT_END_FIELD = 'incidentended';

// Accepts a loaded WebMap or a MapView's map (both expose `allLayers`).
type LayerContainer = Pick<WebMapType, 'allLayers'>;

export function findIncidentSublayers(map: LayerContainer): IncidentSublayers {
  const find = (title: string, id: string): FeatureLayerType | null => {
    const layer =
      map.allLayers.find((l) => l.title === title) ??
      map.allLayers.find((l) => l.id === id);
    return (layer as FeatureLayerType | undefined) ?? null;
  };

  return {
    point: find(SUBLAYERS.point.title, SUBLAYERS.point.id),
    line: find(SUBLAYERS.line.title, SUBLAYERS.line.id),
    area: find(SUBLAYERS.area.title, SUBLAYERS.area.id),
  };
}

// Next incident id = numeric max + 1, as a string. Falls back to "1" if no
// existing ids parse as numbers. (incidentid is a string field but holds
// numeric values in this deployment.)
export function nextIncidentId(existingIds: string[]): string {
  let max = 0;
  for (const id of existingIds) {
    const n = Number(id);
    if (Number.isFinite(n) && n > max) max = Math.floor(n);
  }
  return String(max + 1);
}

// SketchViewModel create tool + ArcGIS geometry type per incident geometry kind.
export const SKETCH_TOOL: Record<IncidentGeometryKind, 'point' | 'polyline' | 'polygon'> = {
  point: 'point',
  line: 'polyline',
  area: 'polygon',
};
