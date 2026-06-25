import { useCallback, useState } from 'react';
import MobileHome from './MobileHome';
import MobileLifelinePage from './MobileLifelinePage';
import MobileMapTab from './MobileMapTab';
import MobileTabBar, { type MobileTab } from './MobileTabBar';
import IncidentChat from '@features/incidents/IncidentChat';
import IncidentTimeline from '@components/IncidentTimeline';
import AdminPage from '@features/admin/AdminPage';
import type { IncidentRecord, Lifeline, LifelineId } from '@types';
import styles from './MobileShell.module.css';

interface MobileShellProps {
  lifelines: Record<LifelineId, Lifeline> | null;
  activeIncident: IncidentRecord | null;
  isAdmin: boolean;
  userEmail: string | null;
  history: {
    open: boolean;
    asOfMs: number | null;
    viewingHistory: boolean;
    minMs: number;
    maxMs: number;
    liveDisabled: boolean;
    onChange: (ms: number | null) => void;
    onClose: () => void;
  };
}

export default function MobileShell({
  lifelines,
  activeIncident,
  isAdmin,
  userEmail,
  history,
}: MobileShellProps) {
  const [tab, setTab] = useState<MobileTab>('overview');
  const [activeLifeline, setActiveLifeline] = useState<LifelineId | null>(null);

  const effectiveTab: MobileTab = tab === 'admin' && !isAdmin ? 'overview' : tab;

  const changeTab = useCallback((next: MobileTab) => {
    setActiveLifeline(null);
    setTab(next);
  }, []);

  return (
    <div className={styles.shell}>
      {history.open && (
        <div className={styles.timelineRow}>
          <IncidentTimeline
            minMs={history.minMs}
            maxMs={history.maxMs}
            asOfMs={history.asOfMs}
            liveDisabled={history.liveDisabled}
            onChange={history.onChange}
            onClose={history.onClose}
          />
        </div>
      )}

      <div className={styles.content}>
        {effectiveTab === 'overview' &&
          (activeLifeline !== null && lifelines !== null ? (
            <MobileLifelinePage
              key={activeLifeline}
              lifelineId={activeLifeline}
              lifeline={lifelines[activeLifeline]}
              incidentId={activeIncident?.incidentId ?? null}
              readOnly={history.viewingHistory}
              onBack={() => setActiveLifeline(null)}
            />
          ) : (
            <div className={styles.overviewScroll}>
              <MobileHome lifelines={lifelines} onSelect={setActiveLifeline} />
            </div>
          ))}

        {effectiveTab === 'map' && (
          <MobileMapTab activeIncident={activeIncident} isAdmin={isAdmin} />
        )}

        {effectiveTab === 'chat' && activeIncident !== null && (
          <div className={styles.chatFill}>
            <IncidentChat
              incidentId={activeIncident.incidentId}
              asOfMs={history.viewingHistory ? history.asOfMs : null}
              currentUserEmail={userEmail}
              fullWindow
            />
          </div>
        )}

        {effectiveTab === 'admin' && isAdmin && (
          <AdminPage onReturnToMap={() => changeTab('map')} />
        )}
      </div>

      <MobileTabBar tab={effectiveTab} isAdmin={isAdmin} onChange={changeTab} />
    </div>
  );
}
