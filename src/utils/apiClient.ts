import { get, patch } from 'aws-amplify/api';
import { fetchAuthSession } from 'aws-amplify/auth';
import type { ApiResponse } from '@types';

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const session = await fetchAuthSession();
  // idToken contains email claim — use it rather than accessToken so email
  // is available server-side regardless of federated vs. direct auth path
  const token = session.tokens?.idToken?.toString();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function normalizeError(err: unknown): never {
  const anyErr = err as { response?: { status?: number }; message?: string };
  throw new ApiClientError(
    anyErr.response?.status ?? 0,
    anyErr.message ?? 'API error',
  );
}

export async function apiGet<T>(path: string): Promise<ApiResponse<T>> {
  try {
    const headers = await authHeaders();
    const { body } = await get({
      apiName: 'lifelines',
      path,
      options: { headers },
    }).response;
    return (await body.json()) as unknown as ApiResponse<T>;
  } catch (err) {
    normalizeError(err);
  }
}

export async function apiPatch<T>(
  path: string,
  data: Record<string, unknown>,
): Promise<ApiResponse<T>> {
  try {
    const headers = await authHeaders();
    const { body } = await patch({
      apiName: 'lifelines',
      path,
      options: { headers, body: data as any },
    }).response;
    return (await body.json()) as unknown as ApiResponse<T>;
  } catch (err) {
    normalizeError(err);
  }
}
