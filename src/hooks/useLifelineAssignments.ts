import { useCallback, useEffect, useState } from 'react';
import { generateClient } from 'aws-amplify/data';
import { useAuth } from '@hooks/useAuth';
import type { Schema } from '../../amplify/data/resource';
import type { LifelineId } from '@types';

const client = generateClient<Schema>();

export type Assignment = Schema['LifelineAssignment']['type'];

// All per-user lifeline assignments, live (admin view). Keyed by Cognito sub.
export function useLifelineAssignments() {
  const [byUser, setByUser] = useState<Map<string, Assignment>>(new Map());

  useEffect(() => {
    const model = client.models?.LifelineAssignment;
    if (!model) return;
    const sub = model.observeQuery().subscribe({
      next: ({ items }) => setByUser(new Map(items.map((i) => [i.userSub, i]))),
      error: () => {},
    });
    return () => sub.unsubscribe();
  }, []);

  // Upsert (create or update) a user's assignment by sub.
  const setAssignment = useCallback(
    async (userSub: string, email: string, lifelines: string[]) => {
      const model = client.models?.LifelineAssignment;
      if (!model) return;
      const input = { userSub, email, lifelines };
      const { errors } = byUser.has(userSub)
        ? await model.update(input)
        : await model.create(input);
      if (errors?.length) {
        console.error('[assignments] save failed:', errors.map((e) => e.message).join('; '));
        throw new Error(errors[0].message);
      }
    },
    [byUser],
  );

  return { byUser, setAssignment };
}

// The current user's assigned lifelines, live — drives the edit gate.
export function useMyAssignedLifelines(): { assigned: Set<LifelineId>; ready: boolean } {
  const { user } = useAuth();
  const sub = user?.sub ?? null;
  const [assigned, setAssigned] = useState<Set<LifelineId>>(new Set());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const model = client.models?.LifelineAssignment;
    if (!sub || !model) {
      setReady(true);
      return;
    }
    const subscription = model
      .observeQuery({ filter: { userSub: { eq: sub } } })
      .subscribe({
        next: ({ items }) => {
          const lifelines = (items[0]?.lifelines ?? []).filter(Boolean) as LifelineId[];
          setAssigned(new Set(lifelines));
          setReady(true);
        },
        error: () => setReady(true),
      });
    return () => subscription.unsubscribe();
  }, [sub]);

  return { assigned, ready };
}
