import { defineFunction } from '@aws-amplify/backend';

// AGE portal proxy. Sits between the browser's ArcGIS JS API and the ArcGIS
// Enterprise portal. Verifies the caller's Cognito token, then forwards the
// request with the service-account token attached server-side — so the portal
// secret/token never reach the browser and end users never see a portal login.
//
// Exposed via a Lambda Function URL (see backend.ts). The dynamic env values
// (token broker name, user-pool ids, proxy not knowing them at definition time)
// are injected in backend.ts via addEnvironment; declared here with empty
// defaults so `$amplify/env/age-proxy` types them.
export const ageProxy = defineFunction({
  name: 'age-proxy',
  entry: './handler.ts',
  timeoutSeconds: 30,
  memoryMB: 512,
  runtime: 20,
  environment: {
    // Only requests to this host get the service token (SSRF guard).
    ALLOWED_PORTAL_HOST: 'secure.dcgis.org',
    // Injected in backend.ts:
    AGE_TOKEN_FUNCTION_NAME: '',
    AGE_TOKEN_REGION: '',
    USER_POOL_ID: '',
    USER_POOL_CLIENT_ID: '',
  },
});
