import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useMapView } from '@features/map/useMapView';
import { useMapConfig } from '@contexts/MapConfigContext';
import type FeatureLayerType from '@arcgis/core/layers/FeatureLayer';
import type GraphicType from '@arcgis/core/Graphic';
import type PointType from '@arcgis/core/geometry/Point';
import { toIsoOrNull, toStringOrNull } from '@utils/arcgisAttrs';
import type { LifelineId } from '@types';

const SUBMISSIONS_QUERY_LIMIT = 100;

export interface LifelineSubmission {
  objectId: number;
  lifelineId: string;
  severity: string | null;
  submittedAt: string | null;
  aiInterpretation: string | null;
  incidentName: string | null;
  coordinates: [number, number] | null;
}

function featureToSubmission(feature: GraphicType): LifelineSubmission {
  const attrs = (feature.attributes ?? {}) as Record<string, unknown>;
  const geom = feature.geometry as PointType | null | undefined;
  const lon = geom?.longitude;
  const lat = geom?.latitude;
  const coordinates: [number, number] | null =
    geom?.type === 'point' &&
    typeof lon === 'number' &&
    typeof lat === 'number' &&
    Number.isFinite(lon) &&
    Number.isFinite(lat)
      ? [lon, lat]
      : null;

  return {
    objectId: Number(attrs.OBJECTID ?? attrs.objectid ?? attrs.ObjectId ?? 0),
    lifelineId: String(attrs.lifeline_id ?? ''),
    severity: toStringOrNull(attrs.severity_official),
    submittedAt: toIsoOrNull(attrs.submitted_at),
    aiInterpretation: toStringOrNull(attrs.ai_interpretation),
    incidentName: toStringOrNull(attrs.incident_name),
    coordinates,
  };
}

export function useLifelineSubmissions(
  lifelineId: LifelineId | null,
  incidentId: string | null,
): UseQueryResult<LifelineSubmission[], Error> {
  const { ref: viewRef, isReady } = useMapView();
  const { submissionsLayerId, mapVersion } = useMapConfig();

  return useQuery<LifelineSubmission[], Error>({
    queryKey: ['lifelineSubmissions', mapVersion, submissionsLayerId, lifelineId, incidentId],
    enabled: isReady && lifelineId !== null && submissionsLayerId !== null,
    staleTime: 30_000,
    queryFn: async () => {
      const view = viewRef.current;
      if (!view?.map || !submissionsLayerId || !lifelineId) return [];

      const layer = view.map.allLayers.find(
        (l) => l.id === submissionsLayerId,
      ) as FeatureLayerType | undefined;
      if (!layer) return [];

      // Scope to the lifeline and (when an incident is selected) that incident —
      // an incident has many submissions; leaves room for the field-user app.
      const esc = (s: string) => s.replace(/'/g, "''");
      const where =
        incidentId !== null
          ? `lifeline_id = '${esc(lifelineId)}' AND incidentid = '${esc(incidentId)}'`
          : `lifeline_id = '${esc(lifelineId)}'`;

      const result = await layer.queryFeatures({
        where,
        outFields: ['*'],
        orderByFields: ['submitted_at DESC'],
        returnGeometry: true,
        num: SUBMISSIONS_QUERY_LIMIT,
      });

      return result.features.map(featureToSubmission);
    },
  });
}
