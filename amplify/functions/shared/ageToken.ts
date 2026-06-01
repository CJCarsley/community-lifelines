import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

// Shared contract between the age-token broker and its callers (the AGE proxy).
// Kept dependency-light so any backend function can import it.

export interface AgeTokenSuccess {
  ok: true;
  token: string;
  /** Epoch ms when the token expires. */
  expiresAt: number;
}

export interface AgeTokenFailure {
  ok: false;
  /** Mapped to the HTTP status the proxy should return (502 for AGE auth failures). */
  statusCode: number;
  message: string;
}

export type AgeTokenResult = AgeTokenSuccess | AgeTokenFailure;

export class AgeTokenAuthError extends Error {
  readonly statusCode: number;
  constructor(message: string, statusCode = 502) {
    super(message);
    this.name = 'AgeTokenAuthError';
    this.statusCode = statusCode;
  }
}

/** Provides a valid AGE bearer token to other Lambda functions. */
export interface TokenProvider {
  getToken(): Promise<string>;
}

/**
 * Wraps the age-token function: invokes it (RequestResponse) and returns the
 * bearer token. On any failure throws AgeTokenAuthError so the caller can map
 * to 502. The clientId/clientSecret never cross this boundary — only the token.
 *
 * @param functionName resolved age-token Lambda name (inject via env from backend.ts)
 */
export function createAgeTokenProvider(
  functionName: string,
  region?: string,
): TokenProvider {
  const lambda = new LambdaClient(region ? { region } : {});

  return {
    async getToken(): Promise<string> {
      const res = await lambda.send(
        new InvokeCommand({
          FunctionName: functionName,
          InvocationType: 'RequestResponse',
        }),
      );

      if (res.FunctionError || !res.Payload) {
        throw new AgeTokenAuthError('AGE token broker invocation failed');
      }

      const parsed = JSON.parse(
        Buffer.from(res.Payload).toString('utf-8'),
      ) as AgeTokenResult;

      if (!parsed.ok) {
        throw new AgeTokenAuthError(parsed.message, parsed.statusCode);
      }
      return parsed.token;
    },
  };
}
