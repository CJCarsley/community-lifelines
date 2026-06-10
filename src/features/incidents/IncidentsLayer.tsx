import { useEffect } from 'react';
import { useMapView } from '@features/map/useMapView';
import { useMapConfig } from '@contexts/MapConfigContext';
import { findIncidentSublayers } from '@features/incidents/incidentLayers';
import type FeatureLayerType from '@arcgis/core/layers/FeatureLayer';
import type { LifelineId } from '@types';

type ActiveView = 'map' | LifelineId;

export interface IncidentsLayerProps {
  activeView: ActiveView;
  incidentId: string | null;
  visible?: boolean;
}

const esc = (s: string) => s.replace(/'/g, "''");

// Submissions filter: scope to the selected incident, and (when a lifeline tile
// is open) to that lifeline.
function submissionsExpr(incidentId: string | null, activeView: ActiveView): string {
  const clauses: string[] = [];
  if (incidentId) clauses.push(`incidentid = '${esc(incidentId)}'`);
  if (activeView !== 'map') clauses.push(`lifeline_id = '${esc(activeView)}'`);
  return clauses.length > 0 ? clauses.join(' AND ') : '1=1';
}

// Filters the map to the selected incident: the Incidents service geometry
// (Points/Lines/Areas) by incidentid, and lifeline_submissions by incidentid
// (+ lifeline). Sets definitionExpression imperatively on the web map layers.
export default function IncidentsLayer({ activeView, incidentId, visible = true }: IncidentsLayerProps) {
  const { ref: viewRef, isReady } = useMapView();
  const { submissionsLayerId } = useMapConfig();

  useEffect(() => {
    const view = viewRef.current;
    if (!view?.map || !isReady) return;

    // Incidents service geometry → only the selected incident.
    const incidentExpr = incidentId ? `incidentid = '${esc(incidentId)}'` : '1=1';
    const subs = findIncidentSublayers(view.map);
    for (const layer of [subs.point, subs.line, subs.area]) {
      if (layer) layer.definitionExpression = incidentExpr;
    }

    // Field submissions → incident (+ lifeline), plus the visibility toggle.
    if (submissionsLayerId) {
      const layer = view.map.allLayers.find(
        (l) => l.id === submissionsLayerId,
      ) as FeatureLayerType | undefined;
      if (layer) {
        layer.definitionExpression = submissionsExpr(incidentId, activeView);
        layer.visible = visible;
      }
    }
  }, [viewRef, isReady, submissionsLayerId, activeView, incidentId, visible]);

  return null;
}
