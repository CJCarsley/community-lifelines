import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';
// eslint-disable-next-line import/no-unresolved -- generated at build by Amplify
import { env } from '$amplify/env/age-token';
import type { AgeTokenResult } from '../shared/ageToken';

const EXPIRY_BUFFER_MS = 5 * 60 * 1000; // refresh when <5 min of life remains

interface Credentials {
  clientId: string;
  clientSecret: string;
}

// Single shared module-level cache (req 3). Survives across warm invocations.
let cachedToken: { token: string; expiresAt: number } | null = null;
let cachedCreds: Credentials | null = null;

const secrets = new SecretsManagerClient({ region: env.AGE_SECRET_REGION });

async function loadCredentials(): Promise<Credentials> {
  if (cachedCreds) return cachedCreds;

  const res = await secrets.send(
    new GetSecretValueCommand({ SecretId: env.AGE_SECRET_ARN }),
  );
  if (!res.SecretString) throw new Error('secret has no SecretString');

  const parsed = JSON.parse(res.SecretString) as {
    clientId?: string;
    clientSecret?: string;
    client_id?: string;
    client_secret?: string;
  };
  const clientId = parsed.clientId ?? parsed.client_id;
  const clientSecret = parsed.clientSecret ?? parsed.client_secret;
  if (!clientId || !clientSecret) {
    throw new Error('secret missing clientId/clientSecret');
  }

  cachedCreds = { clientId, clientSecret };
  return cachedCreds;
}

async function requestToken(): Promise<{ token: string; expiresAt: number }> {
  const { clientId, clientSecret } = await loadCredentials();

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    f: 'json',
  });

  const resp = await fetch(env.AGE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const data = (await resp.json()) as {
    access_token?: string;
    expires_in?: number; // seconds
    error?: unknown;
    error_description?: unknown;
  };

  if (!resp.ok || !data.access_token || typeof data.expires_in !== 'number') {
    throw new Error(`AGE token endpoint returned status ${resp.status}`);
  }

  return {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

export const handler = async (): Promise<AgeTokenResult> => {
  try {
    const now = Date.now();
    if (cachedToken && cachedToken.expiresAt - now > EXPIRY_BUFFER_MS) {
      return { ok: true, token: cachedToken.token, expiresAt: cachedToken.expiresAt };
    }

    cachedToken = await requestToken();
    return { ok: true, token: cachedToken.token, expiresAt: cachedToken.expiresAt };
  } catch (err) {
    // Log message only — never the token, secret, or full stack.
    console.error(
      '[age-token] token acquisition failed:',
      err instanceof Error ? err.message : String(err),
    );
    return { ok: false, statusCode: 502, message: 'Unable to acquire AGE service token' };
  }
};
