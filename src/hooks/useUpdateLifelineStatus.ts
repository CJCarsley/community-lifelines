import { useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAuthSession } from 'aws-amplify/auth';
import { useMapConfig } from '@contexts/MapConfigContext';
import { loadStatusTable, COMMUNITY_KEY } from '@features/map/statusTable';
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

// Records a COMMUNITY lifeline status change by INSERTING a new timestamped row
// into the WebMap-owned `lifeline_status` table under incidentid = COMMUNITY_KEY
// (append-only / snapshots — never updates in place, so history accumulates).
// Routed through the AGE proxy; the service account holds edit privileges.
// Current status is the latest community row per lifeline_id — see
// useLifelineStatuses. Invalidates the read + history queries on success.
export function useUpdateLifelineStatus() {
  const queryClient = useQueryClient();
  const { portalUrl, webMapId, statusTableId } = useMapConfig();

  return useMutation<UpdateLifelineResult, Error, UpdateLifelineVars>({
    mutationFn: async ({ lifelineId, status, notes }) => {
      if (!webMapId) throw new Error('Map not configured');

      const table = await loadStatusTable(portalUrl, webMapId, statusTableId);
      if (!table) throw new Error('lifeline_status table not found');

      const { default: Graphic } = await import('@arcgis/core/Graphic');
      const session = await fetchAuthSession();
      const email = session.tokens?.idToken?.payload.email;

      const attributes: Record<string, unknown> = {
        incidentid: COMMUNITY_KEY,
        lifeline_id: lifelineId,
        status,
        status_updated_at: Date.now(),
        ...(typeof email === 'string' ? { updated_by: email } : {}),
        ...(notes !== undefined ? { current_summary: notes } : {}),
      };

      const result = await table.applyEdits({
        addFeatures: [new Graphic({ attributes })],
      });
      const editResult = result.addFeatureResults?.[0];
      if (editResult?.error) throw new Error(editResult.error.message);

      return { lifelineId, status };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lifelineStatuses'] });
      queryClient.invalidateQueries({ queryKey: ['lifelineStatusHistory'] });
    },
  });
}
