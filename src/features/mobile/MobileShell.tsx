import { useCallback, useMemo, useState } from 'react';
import { useCrisisEventContext } from '../../contexts/CrisisEventContext';
import { useLifelineStatuses } from '@hooks/useLifelineStatuses';
import { mergeLifelineStatuses } from '@utils/mergeLifelineStatuses';
import MobileHome from './MobileHome';
import MobileLifelinePage from './MobileLifelinePage';
import type { LifelineId } from '@types';
import styles from './MobileShell.module.css';

export default function MobileShell() {
  const { activeEvent } = useCrisisEventContext();
  const { data: liveStatuses } = useLifelineStatuses();
  const [activeLifeline, setActiveLifeline] = useState<LifelineId | null>(null);

  const lifelines = useMemo(
    () => mergeLifelineStatuses(activeEvent?.lifelines, liveStatuses),
    [activeEvent, liveStatuses],
  );

  const handleSelect = useCallback((id: LifelineId) => {
    setActiveLifeline(id);
  }, []);

  const handleBack = useCallback(() => {
    setActiveLifeline(null);
  }, []);

  return (
    <div className={styles.shell}>
      {activeLifeline === null || activeEvent === null || lifelines === null ? (
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
