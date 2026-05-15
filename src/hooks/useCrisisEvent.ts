import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@utils/apiClient';
import { USE_MOCK_DATA, getMockEvent } from '@utils/mockData';
import type { CrisisEvent, ApiResponse } from '@types';

export function crisisEventQueryKey(eventId: string) {
  return ['crisis-event', eventId] as const;
}

export function useCrisisEvent(eventId: string | null | undefined) {
  const { data, isLoading, error } = useQuery<ApiResponse<CrisisEvent>>({
    queryKey: crisisEventQueryKey(eventId ?? ''),
    queryFn: () => {
      if (USE_MOCK_DATA) {
        const event = getMockEvent(eventId!);
        if (!event) throw new Error(`No mock event found for id: ${eventId}`);
        return Promise.resolve({
          data: event,
          lastRefreshed: new Date().toISOString(),
        });
      }
      return apiGet<CrisisEvent>(`/api/events/${eventId}`);
    },
    enabled: !!eventId,
  });

  return { event: data?.data ?? null, isLoading, error };
}
