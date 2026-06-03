import { defineAuth } from '@aws-amplify/backend';

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
    email: true,

    // ── Okta (Phase B) — uncomment and fill in when the IdP is ready ──
    // externalProviders: {
    //   oidc: [
    //     {
    //       name: 'Okta',
    //       clientId: secret('OKTA_CLIENT_ID'),
    //       clientSecret: secret('OKTA_CLIENT_SECRET'),
    //       issuerUrl: 'https://<your-org>.okta.com',
    //       scopes: ['openid', 'email', 'profile'],
    //       attributeMapping: { email: 'email' },
    //     },
    //   ],
    //   // Reuse these exact URLs for native + federated sign-in.
    //   callbackUrls: ['http://localhost:5173/', 'https://<deployed-app-url>/'],
    //   logoutUrls: ['http://localhost:5173/', 'https://<deployed-app-url>/'],
    // },
  },

  // Roles. Keep these names STABLE — Okta group/attribute mapping targets them.
  groups: ['Admin', 'Editor', 'LifelineManager', 'Viewer'],
});
