import { useAuth } from '@hooks/useAuth';
import IncidentChat from './IncidentChat';

// The popped-out chat view (own browser window). Subscribes to the same AppSync
// API as the docked box, so it stays in realtime sync automatically. Always Live
// (the History scrubber is a main-app concern).
export default function ChatWindow({ incidentId }: { incidentId: string }) {
  const { user } = useAuth();
  return (
    <IncidentChat
      incidentId={incidentId}
      asOfMs={null}
      currentUserEmail={user?.email ?? null}
      fullWindow
    />
  );
}
