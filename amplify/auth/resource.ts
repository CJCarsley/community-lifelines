import { defineAuth, secret } from '@aws-amplify/backend';

/**
 * Cognito user pool.
 *
 * Phase A (now): native email/password logins via the Amplify <Authenticator>.
 * Phase B (later): Okta federation. Everything below is shaped so Okta drops in
 * as configuration only — no app-code changes:
 *
 *   1. Authorization is by GROUP, never by username. Native users get groups
 *      from the `cognito:groups` claim; Okta users will get the same groups via
 *      a Pre-Token Generation Lambda + attribute mapping. Downstream code
 *      (useAuth, Data model auth rules) only ever reads group names.
 *   2. `email` is the canonical identifier — both native and Okta users carry it.
 *   3. To add Okta: uncomment `externalProviders` below, supply the OIDC issuer +
 *      the CLIENT_ID/CLIENT_SECRET (store the secret with `defineSecret`, never
 *      inline), then point callback/logout URLs at the deployed app. The frontend
 *      switches from the in-app form to `signInWithRedirect({ provider })`.
 */
export const auth = defineAuth({
  loginWith: {
    // Native email/password stays on as break-glass alongside Okta SSO.
    email: true,

    // ── Okta OIDC (dotcomm.okta.com app "Emergency Management") ──
    // Cognito stays the broker: it federates to Okta, app keeps reading the
    // same Cognito token/groups. Amplify types clientId AND clientSecret as
    // BackendSecret, so both go through `ampx ... secret set` (the client id
    // 0oa246ahcmcAv5WS61d8 isn't sensitive, but the type requires a secret ref).
    externalProviders: {
      oidc: [
        {
          name: 'Okta', // referenced by signInWithRedirect({ provider: { custom: 'Okta' } })
          clientId: secret('OKTA_CLIENT_ID'),
          clientSecret: secret('OKTA_CLIENT_SECRET'),
          // Org auth server. If JWT validation fails, switch to the custom
          // auth server: 'https://dotcomm.okta.com/oauth2/default'.
          issuerUrl: 'https://dotcomm.okta.com',
          scopes: ['openid', 'email', 'profile'],
          attributeMapping: { email: 'email' },
        },
      ],
      // NOTE: the Hosted-UI domain prefix is NOT settable here — defineAuth
      // omits `domainPrefix` from its factory props. It's overridden on the
      // auto-created UserPoolDomain via the CDK escape hatch in backend.ts.

      // Same list every env (shared code). Each env's pool uses the one that
      // matches its app origin; extras are harmless.
      callbackUrls: [
        'http://localhost:5173/',
        'https://eoc.dogis.org/',
        'https://main.d3qicauq9rd01b.amplifyapp.com/',
      ],
      logoutUrls: [
        'http://localhost:5173/',
        'https://eoc.dogis.org/',
        'https://main.d3qicauq9rd01b.amplifyapp.com/',
      ],
    },
  },

  // Roles. Keep these names STABLE — Okta group/attribute mapping targets them.
  groups: ['Admin', 'Editor', 'LifelineManager', 'Viewer'],
});
