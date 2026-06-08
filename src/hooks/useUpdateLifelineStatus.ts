import { useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAuthSession } from 'aws-amplify/auth';
import { useMapConfig } from '@contexts/MapConfigContext';
import { loadStatusTable } from '@features/map/statusTable';
import type { LifelineId, LifelineStatus } from '@types';

interface UpdateLifelineVars {
  lifelineId: LifelineId;
  status: LifelineStatus;
  notes?: string;
}

interface UpdateLifelineResult {
  lifelineId: LifelineId;
  status: LifelineStatus;
}

// Writes a lifeline's status (and optionally notes) back to the WebMap-owned
// `lifeline_status` table via applyEdits, routed through the AGE proxy (the
// proxy forwards POST + body; the service account must hold edit privileges on
// the table). Updates the existing row matched by lifeline_id, or inserts one if
// the table is missing that lifeline. Invalidates the read query on success.
export function useUpdateLifelineStatus() {
  const queryClient = useQueryClient();
  const { portalUrl, webMapId, statusTableId } = useMapConfig();

  return useMutation<UpdateLifelineResult, Error, UpdateLifelineVars>({
    mutationFn: async ({ lifelineId, status, notes }) => {
      if (!webMapId) throw new Error('Map not configured');

      const table = await loadStatusTable(portalUrl, webMapId, statusTableId);
      if (!table) throw new Error('lifeline_status table not found');

      const { default: Graphic } = await import('@arcgis/core/Graphic');
      const oidField = table.objectIdField;

      // Locate the existing row's OBJECTID. lifelineId is from the closed
      // LifelineId union (injection-safe) but quote-escape defensively.
      const existing = await table.queryFeatures({
        where: `lifeline_id = '${lifelineId.replace(/'/g, "''")}'`,
        outFields: [oidField],
        returnGeometry: false,
        num: 1,
      });

      const session = await fetchAuthSession();
      const email = session.tokens?.idToken?.payload.email;
      const attributes: Record<string, unknown> = {
        status,
        status_updated_at: Date.now(),
        ...(typeof email === 'string' ? { updated_by: email } : {}),
        ...(notes !== undefined ? { current_summary: notes } : {}),
      };

      const row = existing.features[0];
      const edits = row
        ? {
            updateFeatures: [
              new Graphic({
                attributes: { ...attributes, [oidField]: row.attributes[oidField] },
              }),
            ],
          }
        : {
            addFeatures: [
              new Graphic({ attributes: { ...attributes, lifeline_id: lifelineId } }),
            ],
          };

      const result = await table.applyEdits(edits);
      const editResult =
        result.updateFeatureResults[0] ?? result.addFeatureResults[0];
      if (editResult?.error) throw new Error(editResult.error.message);

      return { lifelineId, status };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lifelineStatuses'] });
    },
  });
}
