import { type ClientSchema, a, defineData } from '@aws-amplify/backend';

/**
 * App-wide configuration, persisted server-side so it is shared across every
 * browser and user. There is exactly ONE record (see SINGLETON_ID on the
 * client); admins overwrite it and everyone else reads it.
 *
 * Authorization (enforced by AppSync, not just the UI):
 *   - any signed-in user may READ  -> the whole org sees the same map
 *   - only the Admin group may WRITE -> "persists until another admin changes it"
 */
const schema = a.schema({
  AppConfig: a
    .model({
      portalUrl: a.string().required(),
      webMapId: a.string().required(),
      submissionsLayerId: a.string(),
      statusTableId: a.string(),
      updatedBy: a.string(), // email of the admin who last saved
    })
    .authorization((allow) => [
      allow.authenticated().to(['read']),
      allow.group('Admin').to(['create', 'read', 'update', 'delete']),
    ]),

  /**
   * Incident chat — free-form comments, separate from the official
   * lifeline_submissions. Realtime via AppSync subscriptions.
   *
   * Authorization:
   *   - any signed-in user may READ + CREATE (post a comment)
   *   - the author (owner) may additionally UPDATE/DELETE their own message
   * `createdAt` (system field) drives ordering, the History-slider filter, and export.
   */
  ChatMessage: a
    .model({
      incidentId: a.string().required(),
      body: a.string().required(),
      author: a.string(), // email, for display/export (owner field drives authz)
    })
    .authorization((allow) => [
      // Everyone signed in can read all messages…
      allow.authenticated().to(['read']),
      // …and any signed-in user can post (create), becoming the owner so they
      // can edit/delete their own. (create MUST be on the owner rule, else the
      // owner field is left null and update/delete return Unauthorized.)
      allow.owner().to(['create', 'read', 'update', 'delete']),
    ]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    // Cognito user-pool tokens authorize every request. No public API key.
    defaultAuthorizationMode: 'userPool',
  },
});
