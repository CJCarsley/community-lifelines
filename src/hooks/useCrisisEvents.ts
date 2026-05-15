import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@utils/apiClient';
import { USE_MOCK_DATA, MOCK_EVENTS } from '@utils/mockData';
import type { CrisisEvent, ApiResponse } from '@types';

export const CRISIS_EVENTS_QUERY_KEY = ['crisis-events'] as const;

export function useCrisisEvents() {
  const { data, isLoading, error } = useQuery<ApiResponse<CrisisEvent[]>>({
    queryKey: CRISIS_EVENTS_QUERY_KEY,
    queryFn: () => {
      if (USE_MOCK_DATA) {
        return Promise.resolve({
          data: MOCK_EVENTS,
          lastRefreshed: new Date().toISOString(),
        });
      }
      return apiGet<CrisisEvent[]>('/api/events');
    },
    refetchInterval: 60_000,
  });

  return {
    events: data?.data ?? [],
    isLoading,
    error,
  };
}
