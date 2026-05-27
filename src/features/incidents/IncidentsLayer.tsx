import { useEffect } from 'react';
import { useMapView } from '@features/map/useMapView';
import { useMapConfig } from '@contexts/MapConfigContext';
import type FeatureLayerType from '@arcgis/core/layers/FeatureLayer';
import type { Incident, Lifeline, LifelineId } from '@types';

type ActiveView = 'map' | LifelineId;

export interface IncidentsLayerProps {
  incidents?: Incident[];
  activeView: ActiveView;
  lifelines?: Record<LifelineId, Lifeline>;
  visible?: boolean;
}

function buildDefinitionExpression(activeView: ActiveView): string {
  return activeView === 'map' ? '1=1' : `lifeline_id = '${activeView}'`;
}

export default function IncidentsLayer({ activeView, visible = true }: IncidentsLayerProps) {
  const viewRef = useMapView();
  const { submissionsLayerId } = useMapConfig();

  useEffect(() => {
    const view = viewRef.current;
    if (!view?.map) return;
    if (!submissionsLayerId) return;

    const layer = view.map.allLayers.find(
      (l) => l.id === submissionsLayerId,
    ) as FeatureLayerType | undefined;
    if (!layer) return;

    layer.definitionExpression = buildDefinitionExpression(activeView);
    layer.visible = visible;
  }, [viewRef, submissionsLayerId, activeView, visible]);

  return null;
}
