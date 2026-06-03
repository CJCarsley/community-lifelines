import { CognitoJwtVerifier } from 'aws-jwt-verify';
// eslint-disable-next-line import/no-unresolved -- generated at build by Amplify
import { env } from '$amplify/env/age-proxy';
import { createAgeTokenProvider } from '../shared/ageToken';

// Minimal shape of the Lambda Function URL event/response (avoids @types/aws-lambda).
interface FunctionUrlEvent {
  rawQueryString: string;
  headers: Record<string, string | undefined>;
  body?: string;
  isBase64Encoded?: boolean;
  requestContext: { http: { method: string } };
}
interface FunctionUrlResult {
  statusCode: number;
  headers?: Record<string, string>;
  body?: string;
  isBase64Encoded?: boolean;
}

// CORS is configured on the Lambda Function URL (see backend.ts); AWS adds the
// Access-Control-* headers to every response automatically. Setting them here
// too would duplicate Access-Control-Allow-Origin and break the browser check.

// Verifier caches the pool's public keys (JWKS) across warm invocations.
const verifier = CognitoJwtVerifier.create({
  userPoolId: env.USER_POOL_ID,
  tokenUse: 'id',
  clientId: env.USER_POOL_CLIENT_ID,
});

const tokenProvider = createAgeTokenProvider(
  env.AGE_TOKEN_FUNCTION_NAME,
  env.AGE_TOKEN_REGION || undefined,
);

function deny(statusCode: number, message: string): FunctionUrlResult {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: message }),
  };
}

/** Pull the bearer value from the caller's Cognito Authorization header. */
function bearer(headers: Record<string, string | undefined>): string | null {
  const raw = headers.authorization ?? headers.Authorization;
  if (!raw) return null;
  const [scheme, value] = raw.split(' ');
  return scheme?.toLowerCase() === 'bearer' && value ? value : null;
}

export const handler = async (event: FunctionUrlEvent): Promise<FunctionUrlResult> => {
  const method = event.requestContext.http.method.toUpperCase();
  // OPTIONS preflight is handled by the Function URL's CORS config, not here.

  // 1. Caller must be a signed-in site user.
  const callerToken = bearer(event.headers);
  if (!callerToken) return deny(401, 'Missing Authorization');
  try {
    await verifier.verify(callerToken);
  } catch {
    return deny(401, 'Invalid session');
  }

  // 2. Target = the ArcGIS URL, passed by the frontend interceptor as a single
  //    URL-encoded `target` query param (NOT Esri's raw-append convention, which
  //    a Lambda Function URL rejects with InvalidQueryStringException).
  //    Parse with a regex + decodeURIComponent (not URLSearchParams, which would
  //    turn a literal '+' in the target into a space).
  const match = /(?:^|&)target=([^&]*)/.exec(event.rawQueryString);
  if (!match) return deny(400, 'Missing target URL');
  let targetUrl: URL;
  try {
    targetUrl = new URL(decodeURIComponent(match[1]));
  } catch {
    return deny(400, 'Malformed target URL');
  }

  // 3. SSRF guard: only the portal host, and only then do we attach the token.
  if (targetUrl.protocol !== 'https:' || targetUrl.host !== env.ALLOWED_PORTAL_HOST) {
    return deny(403, 'Target host not allowed');
  }

  // 4. Service-account token (minted from client_id/secret in the broker).
  let serviceToken: string;
  try {
    serviceToken = await tokenProvider.getToken();
  } catch {
    return deny(502, 'Unable to obtain portal token');
  }

  // 5. Forward, attaching the portal token server-side via X-Esri-Authorization.
  const fwdHeaders: Record<string, string> = {
    'X-Esri-Authorization': `Bearer ${serviceToken}`,
  };
  const contentType = event.headers['content-type'] ?? event.headers['Content-Type'];
  if (contentType) fwdHeaders['Content-Type'] = contentType;

  const body =
    method === 'GET' || method === 'HEAD'
      ? undefined
      : event.isBase64Encoded && event.body
        ? Buffer.from(event.body, 'base64')
        : event.body;

  let upstream: Response;
  try {
    upstream = await fetch(targetUrl.toString(), { method, headers: fwdHeaders, body });
  } catch {
    return deny(502, 'Upstream request failed');
  }

  // 6. Relay response. Binary (tiles/images) -> base64; text -> utf-8.
  const respContentType = upstream.headers.get('content-type') ?? 'application/octet-stream';
  const isText = /json|text|xml|javascript/i.test(respContentType);
  const buf = Buffer.from(await upstream.arrayBuffer());

  return {
    statusCode: upstream.status,
    headers: { 'Content-Type': respContentType },
    body: isText ? buf.toString('utf-8') : buf.toString('base64'),
    isBase64Encoded: !isText,
  };
};
