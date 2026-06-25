import { LIFELINE_IDS } from '@utils/defaultLifelines';
import { COMMUNITY_KEY } from '@features/map/statusTable';
import type FeatureLayerType from '@arcgis/core/layers/FeatureLayer';

// Seeds the 8 community lifeline_status rows, all `unknown` and timestamped.
// Used ONCE when the community table has no rows yet. Append-only: callers must
// ensure no community rows exist (seeding twice would duplicate).
export async function seedLifelineStatus(
  table: FeatureLayerType,
  key: string = COMMUNITY_KEY,
): Promise<void> {
  const { default: Graphic } = await import('@arcgis/core/Graphic');
  const now = Date.now();

  const addFeatures = LIFELINE_IDS.map(
    (id) =>
      new Graphic({
        attributes: {
          incidentid: key,
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
