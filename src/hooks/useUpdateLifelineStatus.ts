import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiPatch } from '@utils/apiClient';
import { USE_MOCK_DATA } from '@utils/mockData';
import { crisisEventQueryKey } from './useCrisisEvent';
import type { LifelineId, LifelineStatus, ApiResponse } from '@types';

interface UpdateLifelineVars {
  eventId: string;
  lifelineId: LifelineId;
  status: LifelineStatus;
  notes?: string;
}

interface UpdateLifelineResult {
  lifelineId: LifelineId;
  status: LifelineStatus;
}

export function useUpdateLifelineStatus() {
  const queryClient = useQueryClient();

  return useMutation<ApiResponse<UpdateLifelineResult>, Error, UpdateLifelineVars>({
    mutationFn: ({ eventId, lifelineId, status, notes }) => {
      if (USE_MOCK_DATA) {
        return Promise.resolve({
          data: { lifelineId, status },
          lastRefreshed: new Date().toISOString(),
        });
      }
      return apiPatch<UpdateLifelineResult>(
        `/api/events/${eventId}/lifelines/${lifelineId}`,
        { status, ...(notes !== undefined && { notes }) },
      );
    },
    onSuccess: (_data, { eventId }) => {
      queryClient.invalidateQueries({ queryKey: crisisEventQueryKey(eventId) });
    },
  });
}
