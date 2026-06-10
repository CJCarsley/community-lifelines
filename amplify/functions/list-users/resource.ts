import { defineFunction } from '@aws-amplify/backend';

// Lists the Cognito user-pool users for the Admin assignment UI. USER_POOL_ID +
// cognito-idp:ListUsers IAM are injected in backend.ts. Exposed as the
// Admin-only `listAppUsers` custom query (see data/resource.ts).
export const listUsers = defineFunction({
  name: 'list-users',
  entry: './handler.ts',
  timeoutSeconds: 20,
  runtime: 20,
});
