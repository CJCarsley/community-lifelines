import { LIFELINE_IDS } from '@utils/defaultLifelines';
import type FeatureLayerType from '@arcgis/core/layers/FeatureLayer';

// Seeds the 8 lifeline_status rows for an incident, all `unknown` and
// timestamped. Used when a row-less incident is first selected and when a new
// incident is created (Phase 3). Append-only: callers must ensure the incident
// has no rows yet (seeding twice would duplicate).
export async function seedLifelineStatus(
  table: FeatureLayerType,
  incidentId: string,
): Promise<void> {
  const { default: Graphic } = await import('@arcgis/core/Graphic');
  const now = Date.now();

  const addFeatures = LIFELINE_IDS.map(
    (id) =>
      new Graphic({
        attributes: {
          incidentid: incidentId,
          lifeline_id: id,
          status: 'unknown',
          status_updated_at: now,
        },
      }),
  );

  const result = await table.applyEdits({ addFeatures });
  const failed = result.addFeatureResults?.find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);
}
