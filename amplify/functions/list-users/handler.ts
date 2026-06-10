import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider';
// eslint-disable-next-line import/no-unresolved -- generated at build by Amplify
import { env } from '$amplify/env/list-users';
import type { Schema } from '../../data/resource';

const client = new CognitoIdentityProviderClient();

// Returns every user in the pool (paginated). Authorization (Admin-only) is
// enforced by the custom query's auth rule, not here.
export const handler: Schema['listAppUsers']['functionHandler'] = async () => {
  const out: Array<{ sub: string; email: string; username: string; status: string }> = [];
  let token: string | undefined;

  do {
    const res = await client.send(
      new ListUsersCommand({
        UserPoolId: env.USER_POOL_ID,
        Limit: 60,
        PaginationToken: token,
      }),
    );
    for (const u of res.Users ?? []) {
      const attrs = Object.fromEntries(
        (u.Attributes ?? []).map((a) => [a.Name, a.Value ?? '']),
      );
      out.push({
        sub: attrs.sub ?? '',
        email: attrs.email ?? '',
        username: u.Username ?? '',
        status: u.UserStatus ?? '',
      });
    }
    token = res.PaginationToken;
  } while (token);

  return out;
};
