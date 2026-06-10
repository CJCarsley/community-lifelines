import { useCallback, useEffect, useState } from 'react';
import { generateClient } from 'aws-amplify/data';
import { fetchAuthSession } from 'aws-amplify/auth';
import type { Schema } from '../../amplify/data/resource';

const client = generateClient<Schema>();

export type ChatMessage = Schema['ChatMessage']['type'];

// Realtime incident chat backed by Amplify Data (AppSync subscriptions).
// observeQuery keeps `messages` live as anyone posts/edits/deletes — including
// across pop-out windows, since they subscribe to the same API.
export function useIncidentChat(incidentId: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!incidentId) {
      setMessages([]);
      return;
    }
    // The model is absent until the ChatMessage backend is deployed — degrade
    // gracefully instead of throwing (which would white-screen the app).
    const model = client.models?.ChatMessage;
    if (!model) {
      setError('chat-unavailable');
      return;
    }
    const sub = model
      .observeQuery({ filter: { incidentId: { eq: incidentId } } })
      .subscribe({
        next: ({ items }) => {
          const sorted = [...items].sort((a, b) =>
            (a.createdAt ?? '').localeCompare(b.createdAt ?? ''),
          );
          setMessages(sorted);
          setError(null);
        },
        error: (e: unknown) => setError(e instanceof Error ? e.message : 'chat error'),
      });
    return () => sub.unsubscribe();
  }, [incidentId]);

  const post = useCallback(
    async (body: string) => {
      const text = body.trim();
      if (!incidentId || text === '' || !client.models?.ChatMessage) return;
      const session = await fetchAuthSession();
      const email = session.tokens?.idToken?.payload.email;
      await client.models.ChatMessage.create({
        incidentId,
        body: text,
        author: typeof email === 'string' ? email : undefined,
      });
    },
    [incidentId],
  );

  const fmtErrors = (errs: { errorType?: string; message?: string }[]) =>
    errs.map((e) => e.errorType ?? e.message ?? JSON.stringify(e)).join('; ');

  const edit = useCallback(async (id: string, body: string) => {
    const text = body.trim();
    if (text === '' || !client.models?.ChatMessage) return;
    const { errors } = await client.models.ChatMessage.update({ id, body: text });
    if (errors?.length) console.error('[chat] edit failed:', fmtErrors(errors));
  }, []);

  const remove = useCallback(async (id: string) => {
    if (!client.models?.ChatMessage) return;
    try {
      const { errors } = await client.models.ChatMessage.delete({ id });
      if (errors?.length) console.error('[chat] delete failed:', fmtErrors(errors));
    } catch (e) {
      console.error('[chat] delete threw:', e);
    }
  }, []);

  return { messages, error, post, edit, remove };
}
