import { useEffect, useRef } from 'react';
import { useMapView } from '@features/map/useMapView';
import type FeatureLayerType from '@arcgis/core/layers/FeatureLayer';
import type { Incident, Lifeline, LifelineId } from '@types';

const FEATURE_SERVICE_URL = 'PLACEHOLDER_URL';

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
  const layerRef = useRef<FeatureLayerType | null>(null);

  useEffect(() => {
    if (layerRef.current) layerRef.current.visible = visible;
  }, [visible]);

  useEffect(() => {
    if (layerRef.current) {
      layerRef.current.definitionExpression = buildDefinitionExpression(activeView);
    }
  }, [activeView]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view?.map) return;

    let destroyed = false;

    void import('@arcgis/core/layers/FeatureLayer').then(({ default: FeatureLayer }) => {
      if (destroyed || !view.map) return;

      const layer = new FeatureLayer({
        url: FEATURE_SERVICE_URL,
        definitionExpression: buildDefinitionExpression(activeView),
        visible,
      });

      view.map.add(layer);
      layerRef.current = layer;
    });

    return () => {
      destroyed = true;
      const current = layerRef.current;
      if (current) {
        view.map?.remove(current);
        current.destroy();
        layerRef.current = null;
      }
    };
  }, [viewRef]);

  return null;
}
