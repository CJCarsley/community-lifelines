import { useEffect, useState } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';
import type { AuthUser, UserRole } from '@types';

const VALID_ROLES: UserRole[] = ['Admin', 'Editor', 'LifelineManager', 'Viewer'];

// Reads the live Cognito session. Roles come from the `cognito:groups` claim —
// identical shape whether the user signed in natively or (later) via Okta, so
// nothing downstream needs to know which path was used.
async function loadUser(): Promise<AuthUser | null> {
  try {
    const session = await fetchAuthSession();
    const idToken = session.tokens?.idToken;
    if (!idToken) return null;
    const payload = idToken.payload;

    const email = typeof payload.email === 'string' ? payload.email : '';
    const rawGroups = payload['cognito:groups'];
    const groups = Array.isArray(rawGroups) ? (rawGroups as string[]) : [];
    const roles = groups.filter((g): g is UserRole =>
      (VALID_ROLES as string[]).includes(g),
    );
    const username =
      typeof payload['cognito:username'] === 'string'
        ? (payload['cognito:username'] as string)
        : email;

    return {
      username,
      email,
      roles,
      authMethod: payload.identities ? 'federated' : 'cognito',
    };
  } catch {
    return null;
  }
}

export function useAuth(): { user: AuthUser | null } {
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      void loadUser().then((u) => {
        if (active) setUser(u);
      });
    };
    refresh();
    const stop = Hub.listen('auth', refresh); // sign-in / sign-out / token refresh
    return () => {
      active = false;
      stop();
    };
  }, []);

  return { user };
}

export const EDIT_ROLES: UserRole[] = ['Admin', 'Editor', 'LifelineManager'];
