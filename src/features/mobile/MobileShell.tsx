import { useCallback, useState } from 'react';
import { useCrisisEventContext } from '../../contexts/CrisisEventContext';
import MobileHome from './MobileHome';
import MobileLifelinePage from './MobileLifelinePage';
import type { LifelineId } from '@types';
import styles from './MobileShell.module.css';

export default function MobileShell() {
  const { activeEvent } = useCrisisEventContext();
  const [activeLifeline, setActiveLifeline] = useState<LifelineId | null>(null);

  const handleSelect = useCallback((id: LifelineId) => {
    setActiveLifeline(id);
  }, []);

  const handleBack = useCallback(() => {
    setActiveLifeline(null);
  }, []);

  return (
    <div className={styles.shell}>
      {activeLifeline === null || activeEvent === null ? (
        <MobileHome
          lifelines={activeEvent?.lifelines ?? null}
          onSelect={handleSelect}
        />
      ) : (
        <MobileLifelinePage
          key={activeLifeline}
          lifelineId={activeLifeline}
          lifeline={activeEvent.lifelines[activeLifeline]}
          event={activeEvent}
          onBack={handleBack}
        />
      )}
    </div>
  );
}
