import { useCallback, useMemo, useState } from 'react';
import { useIncidentContext } from '@contexts/IncidentContext';
import { useLifelineStatuses } from '@hooks/useLifelineStatuses';
import { mergeLifelineStatuses } from '@utils/mergeLifelineStatuses';
import { DEFAULT_LIFELINES } from '@utils/defaultLifelines';
import MobileHome from './MobileHome';
import MobileLifelinePage from './MobileLifelinePage';
import type { LifelineId } from '@types';
import styles from './MobileShell.module.css';

export default function MobileShell() {
  const { activeIncident } = useIncidentContext();
  const { data: liveStatuses } = useLifelineStatuses();
  const [activeLifeline, setActiveLifeline] = useState<LifelineId | null>(null);

  const lifelines = useMemo(
    () => mergeLifelineStatuses(DEFAULT_LIFELINES, liveStatuses),
    [liveStatuses],
  );

  const handleSelect = useCallback((id: LifelineId) => {
    setActiveLifeline(id);
  }, []);

  const handleBack = useCallback(() => {
    setActiveLifeline(null);
  }, []);

  return (
    <div className={styles.shell}>
      {activeLifeline === null || activeIncident === null || lifelines === null ? (
        <MobileHome lifelines={lifelines} onSelect={handleSelect} />
      ) : (
        <MobileLifelinePage
          key={activeLifeline}
          lifelineId={activeLifeline}
          lifeline={lifelines[activeLifeline]}
          onBack={handleBack}
        />
      )}
    </div>
  );
}
