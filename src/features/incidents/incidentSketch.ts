import { SKETCH_TOOL, type IncidentGeometryKind } from './incidentLayers';
import type MapViewType from '@arcgis/core/views/MapView';
import type GeometryType from '@arcgis/core/geometry/Geometry';

export interface SketchSession {
  /** Abort an in-progress sketch and tear down its temporary layer (idempotent). */
  cancel: () => void;
}

// Starts a one-shot geometry sketch on the view using a throwaway GraphicsLayer.
// Calls onComplete with the drawn geometry, then tears everything down. Shared by
// the incident create flow and the per-incident "add geometry" toolbar.
export async function startIncidentSketch(
  view: MapViewType,
  kind: IncidentGeometryKind,
  onComplete: (geometry: GeometryType | null) => void,
): Promise<SketchSession> {
  const [{ default: SketchViewModel }, { default: GraphicsLayer }] = await Promise.all([
    import('@arcgis/core/widgets/Sketch/SketchViewModel'),
    import('@arcgis/core/layers/GraphicsLayer'),
  ]);

  const layer = new GraphicsLayer({ listMode: 'hide' });
  view.map?.add(layer);
  const vm = new SketchViewModel({ view, layer });

  let torn = false;
  const teardown = () => {
    if (torn) return;
    torn = true;
    try {
      vm.cancel();
      vm.destroy();
    } catch {
      /* ignore teardown races */
    }
    view.map?.remove(layer);
  };

  vm.on('create', (event) => {
    if (event.state === 'complete') {
      const geometry = event.graphic.geometry ?? null;
      onComplete(geometry);
      // Defer teardown so we don't destroy the VM inside its own event handler.
      setTimeout(teardown, 0);
    }
  });

  vm.create(SKETCH_TOOL[kind]);
  return { cancel: teardown };
}
