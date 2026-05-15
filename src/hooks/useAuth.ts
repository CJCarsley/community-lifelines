import type { AuthUser } from '@types';

// Placeholder — replaced by Cognito/Amplify session in Phase 4.
// Roles in our system: 'Admin' | 'Editor' | 'LifelineManager' | 'Viewer'.
// The prompt's "esf-coordinator" maps to 'LifelineManager' in this type system.
const MOCK_USER: AuthUser = {
  username: 'Okta_mock-user',
  email: 'cjcarsley@douglascounty-ne.gov',
  roles: ['Admin'],
  authMethod: 'federated',
};

export function useAuth(): { user: AuthUser | null } {
  return { user: MOCK_USER };
}

export const EDIT_ROLES: AuthUser['roles'][number][] = ['Admin', 'Editor', 'LifelineManager'];
