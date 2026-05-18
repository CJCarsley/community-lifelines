import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useButton } from '@react-aria/button';
import { FocusRing } from '@react-aria/focus';
import type { Lifeline, LifelineId, LifelineStatus } from '@types';
import styles from './MobileHome.module.css';

const LIFELINE_ORDER: LifelineId[] = [
  'safety-security',
  'food-hydration-shelter',
  'health-medical',
  'energy',
  'communications',
  'transportation',
  'hazardous-material',
  'water-systems',
];

const GRAPHIC_STEM: Record<LifelineId, string> = {
  'safety-security':        'SafetySecurity',
  'food-hydration-shelter': 'food-hydration-shelter',
  'health-medical':         'HealthMedical',
  'water-systems':          'Water-Systems',
  energy:                   'Energy',
  communications:           'Communications',
  transportation:           'Transportation',
  'hazardous-material':     'HazMat',
};

const STATUS_HALO: Record<LifelineStatus, string> = {
  unknown:  'GRAY',
  stable:   'GREEN',
  minor:    'YELLOW',
  moderate: 'ORANGE',
  major:    'RED',
  extreme:  'PURPLE',
};

function graphicSrc(id: LifelineId, status: LifelineStatus | null): string {
  const suffix = status === null ? 'NONE' : STATUS_HALO[status];
  return `/graphics/${GRAPHIC_STEM[id]}-${suffix}.png`;
}

interface HomeTileProps {
  id: LifelineId;
  status: LifelineStatus | null;
  onSelect: (id: LifelineId) => void;
}

function HomeTile({ id, status, onSelect }: HomeTileProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLButtonElement>(null);
  const { buttonProps } = useButton({ onPress: () => onSelect(id) }, ref);

  const label = t(`lifeline.${id}.label`);
  const statusText = status === null ? null : t(`lifeline.status.${status}`);
  const ariaLabel =
    statusText !== null ? `${label}, status ${statusText}` : label;

  return (
    <FocusRing focusRingClass={styles.focusRing}>
      <button
        {...buttonProps}
        ref={ref}
        aria-label={ariaLabel}
        className={styles.tile}
      >
        <img
          src={graphicSrc(id, status)}
          alt=""
          className={styles.tileImg}
          draggable={false}
        />
        <span className={styles.tileLabel}>{label}</span>
        {statusText !== null && (
          <span className={styles.tileStatus}>{statusText}</span>
        )}
      </button>
    </FocusRing>
  );
}

export interface MobileHomeProps {
  lifelines: Record<LifelineId, Lifeline> | null;
  onSelect: (id: LifelineId) => void;
}

export default function MobileHome({ lifelines, onSelect }: MobileHomeProps) {
  const { t } = useTranslation();

  return (
    <div
      role="navigation"
      aria-label={t('lifelines.strip.ariaLabel')}
      className={styles.home}
    >
      <div className={styles.grid}>
        {LIFELINE_ORDER.map((id) => {
          const status = lifelines?.[id]?.status ?? null;
          return (
            <HomeTile key={id} id={id} status={status} onSelect={onSelect} />
          );
        })}
      </div>
    </div>
  );
}
