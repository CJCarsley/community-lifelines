import { useEffect, useRef } from 'react';
import { useMapView } from '@features/map/useMapView';
import type GraphicsLayerType from '@arcgis/core/layers/GraphicsLayer';
import type { Incident, Lifeline, LifelineId, LifelineStatus } from '@types';

type ActiveView = 'map' | LifelineId;

export interface IncidentsLayerProps {
  incidents: Incident[];
  activeView: ActiveView;
  lifelines: Record<LifelineId, Lifeline>;
  visible?: boolean;
}

const SEVERITY_COLORS: Record<Incident['severity'], string> = {
  low:          '#3B8BD4',
  moderate:     '#EF9F27',
  high:         '#E24B4A',
  catastrophic: '#A32D2D',
};

// Different marker shapes per severity — shape + color together ensure accessibility
const SEVERITY_MARKER_STYLES: Record<Incident['severity'], 'circle' | 'diamond' | 'square' | 'x'> = {
  low:          'circle',
  moderate:     'diamond',
  high:         'square',
  catastrophic: 'x',
};

const STATUS_COLORS: Record<LifelineStatus, string> = {
  unknown:  '#888780',
  stable:   '#2E8B47',
  minor:    '#EAB308',
  moderate: '#EF7C1F',
  major:    '#E24B4A',
  extreme:  '#7B2D8E',
};

const LIFELINE_LABELS: Record<LifelineId, string> = {
  'safety-security':        'Safety & Security',
  'food-hydration-shelter': 'Food, Water & Shelter',
  'health-medical':         'Health & Medical',
  'water-systems':          'Water Systems',
  energy:                   'Energy',
  communications:           'Communications',
  transportation:           'Transportation',
  'hazardous-material':     'Hazardous Materials',
};

function parseHex(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function buildPopupContent(incident: Incident, lifelines: Record<LifelineId, Lifeline>): string {
  const severityColor = SEVERITY_COLORS[incident.severity];
  const chips = incident.affectedLifelines
    .map((id) => {
      const color = STATUS_COLORS[lifelines[id]?.status ?? 'unknown'];
      return `<span style="background:${color};color:#fff;border-radius:3px;padding:2px 7px;font-size:11px;font-weight:600;display:inline-block;margin:2px 3px 2px 0">${LIFELINE_LABELS[id]}</span>`;
    })
    .join('');

  const ts = new Date(incident.timestamp).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });

  const desc = incident.description
    ? `<p style="font-size:13px;color:#222;margin:6px 0 0;line-height:1.5">${incident.description}</p>`
    : '';

  return (
    `<div style="font-family:system-ui,sans-serif;max-width:320px">` +
    `<div style="margin-bottom:8px">` +
    `<span style="background:${severityColor};color:#fff;border-radius:3px;padding:2px 8px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px">${incident.severity}</span>` +
    `</div>` +
    `<div style="margin-bottom:6px">${chips}</div>` +
    `<p style="color:#888;font-size:12px;margin:6px 0 4px">${ts}</p>` +
    desc +
    `</div>`
  );
}

export default function IncidentsLayer({ incidents, activeView, lifelines, visible = true }: IncidentsLayerProps) {
  const viewRef = useMapView();
  const layerRef = useRef<GraphicsLayerType | null>(null);

  // Visibility-only update — avoids destroying and re-creating graphics
  useEffect(() => {
    if (layerRef.current) layerRef.current.visible = visible;
  }, [visible]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view?.map) return;

    let destroyed = false;

    void Promise.all([
      import('@arcgis/core/layers/GraphicsLayer'),
      import('@arcgis/core/Graphic'),
      import('@arcgis/core/geometry/Point'),
      import('@arcgis/core/geometry/geometryEngine'),
      import('@arcgis/core/symbols/SimpleMarkerSymbol'),
      import('@arcgis/core/symbols/SimpleFillSymbol'),
      import('@arcgis/core/symbols/SimpleLineSymbol'),
      import('@arcgis/core/PopupTemplate'),
    ]).then(([
      { default: GraphicsLayer },
      { default: Graphic },
      { default: Point },
      geometryEngine,
      { default: SimpleMarkerSymbol },
      { default: SimpleFillSymbol },
      { default: SimpleLineSymbol },
      { default: PopupTemplate },
    ]) => {
      if (destroyed || !view.map) return;

      const graphics: InstanceType<typeof Graphic>[] = [];

      for (const incident of incidents) {
        const isActive =
          activeView === 'map' ||
          incident.affectedLifelines.includes(activeView as LifelineId);

        const [r, g, b] = parseHex(SEVERITY_COLORS[incident.severity]);
        const markerAlpha = isActive ? 255 : 77;

        const point = new Point({
          longitude: incident.coordinates[0],
          latitude: incident.coordinates[1],
        });

        // Impact zone — active incidents only
        if (isActive && incident.impactRadiusKm !== undefined) {
          const bufResult = geometryEngine.geodesicBuffer(
            point,
            incident.impactRadiusKm,
            'kilometers',
          );
          const polygon = Array.isArray(bufResult) ? bufResult[0] : bufResult;
          if (polygon) {
            graphics.push(
              new Graphic({
                geometry: polygon,
                symbol: new SimpleFillSymbol({
                  color: [r, g, b, 38],
                  outline: new SimpleLineSymbol({
                    color: [r, g, b, 153],
                    width: 1,
                    style: 'dash',
                  }),
                }),
              }),
            );
          }
        }

        // Point marker — ArcGIS popup handles focus trap and Escape natively
        graphics.push(
          new Graphic({
            geometry: point,
            symbol: new SimpleMarkerSymbol({
              style: SEVERITY_MARKER_STYLES[incident.severity],
              size: 12,
              color: [r, g, b, markerAlpha],
              outline: { color: [255, 255, 255, markerAlpha], width: 1.5 },
            }),
            popupTemplate: new PopupTemplate({
              title: incident.title,
              content: () => buildPopupContent(incident, lifelines),
            }),
          }),
        );
      }

      const gl = new GraphicsLayer({ graphics, visible });
      view.map.add(gl);
      layerRef.current = gl;
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
  }, [viewRef, incidents, activeView, lifelines]);

  return null;
}
