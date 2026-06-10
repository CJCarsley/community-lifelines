import { useEffect, useState } from 'react';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';

const client = generateClient<Schema>();

export interface AppUser {
  sub: string;
  email: string;
  username: string;
  status: string;
}

// Admin-only: the Cognito user list (via the listAppUsers custom query).
export function useAppUsers() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (!client.queries?.listAppUsers) throw new Error('not-deployed');
        const { data, errors } = await client.queries.listAppUsers();
        if (!active) return;
        if (errors?.length) throw new Error(errors[0].message);
        setUsers((data ?? []).filter((u): u is AppUser => u != null));
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'failed');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return { users, loading, error };
}
