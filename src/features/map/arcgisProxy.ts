import esriConfig from '@arcgis/core/config';
import { fetchAuthSession } from 'aws-amplify/auth';
import { AGE_PROXY_URL } from '../../amplifyConfig';

// Routes ArcGIS JS API traffic for the configured portal host through the AGE
// proxy. The proxy attaches the service-account portal token server-side, so
// users never log in to the portal.
//
// We can't use esriConfig.request.proxyRules: it appends the raw target URL as
// the query string (Esri resource-proxy convention), which a Lambda Function
// URL rejects with InvalidQueryStringException (the embedded ://, ?, = aren't
// valid key=value pairs). Instead we use a request interceptor that rewrites
// each portal request to `${PROXY}?target=<URL-encoded full target>` — a single
// valid query param — and attach the caller's Cognito id token so the proxy can
// verify the request came from a signed-in site user.
const wiredHosts = new Set<string>();

export function installArcgisProxy(portalUrl: string): void {
  if (!AGE_PROXY_URL) return;

  let host: string;
  try {
    host = new URL(portalUrl).host;
  } catch {
    return;
  }
  if (wiredHosts.has(host)) return;
  wiredHosts.add(host);

  const hostPrefix = `https://${host}/`;

  esriConfig.request.interceptors?.push({
    urls: new RegExp(`^https://${host.replace(/[.]/g, '\\.')}/`),
    before: async (params) => {
      // Guard: never double-proxy (e.g. if the proxy URL ever shared a host).
      if (typeof params.url !== 'string' || !params.url.startsWith(hostPrefix)) {
        return;
      }

      // Fold the JS API's own query params into the target URL, then clear them
      // so the API doesn't append them to the proxy URL and corrupt ?target=.
      const target = new URL(params.url);
      const query = params.requestOptions?.query as Record<string, unknown> | undefined;
      if (query) {
        for (const [k, v] of Object.entries(query)) {
          if (v != null) target.searchParams.set(k, String(v));
        }
        params.requestOptions.query = {};
      }

      params.url = `${AGE_PROXY_URL}?target=${encodeURIComponent(target.toString())}`;

      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();
      params.requestOptions = params.requestOptions ?? {};
      params.requestOptions.headers = {
        ...(params.requestOptions.headers ?? {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };
    },
  });
}
