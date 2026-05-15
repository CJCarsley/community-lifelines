import { useTranslation } from 'react-i18next';
import { useButton } from '@react-aria/button';
import { FocusRing } from '@react-aria/focus';
import type { Lifeline, LifelineId, LifelineStatus } from '@types';
import styles from './LifelineStrip.module.css';

// ─── Constants ────────────────────────────────────────────────────────────────

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

// Filename stems used by the official PNG assets in /public/graphics/.
// Casing matches the source files exactly.
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

// Status → halo-color suffix on the graphic filename.
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

// ─── StripTile ────────────────────────────────────────────────────────────────

interface StripTileProps {
  id: LifelineId;
  status: LifelineStatus | null;
  isActive: boolean;
  onPress: () => void;
  buttonRef: React.RefObject<HTMLButtonElement>;
}

function StripTile({ id, status, isActive, onPress, buttonRef }: StripTileProps) {
  const { t } = useTranslation();
  const { buttonProps } = useButton({ onPress }, buttonRef);

  const label = t(`lifeline.${id}.label`);
  const statusText = status === null ? null : t(`lifeline.status.${status}`);

  // a11y: button gets full name+status via aria-label; image is decorative.
  const ariaLabel =
    statusText !== null ? `${label}, status ${statusText}` : label;

  return (
    <FocusRing focusRingClass={styles.focusRing}>
      <button
        {...buttonProps}
        ref={buttonRef}
        role="tab"
        aria-pressed={isActive}
        aria-label={ariaLabel}
        className={`${styles.tile}${isActive ? ` ${styles.tileActive}` : ''}`}
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

// ─── LifelineStrip ────────────────────────────────────────────────────────────

export interface LifelineStripProps {
  lifelines: Record<LifelineId, Lifeline> | null;
  activeView: 'map' | LifelineId;
  onSelect: (id: LifelineId) => void;
  buttonRefs: Record<LifelineId, React.RefObject<HTMLButtonElement>>;
  className?: string;
}

export default function LifelineStrip({
  lifelines,
  activeView,
  onSelect,
  buttonRefs,
  className,
}: LifelineStripProps) {
  const { t } = useTranslation();

  return (
    <nav
      role="tablist"
      aria-label={t('lifelines.strip.ariaLabel')}
      className={`${styles.strip}${className ? ` ${className}` : ''}`}
    >
      {LIFELINE_ORDER.map((id) => {
        // No event loaded → null status → "NONE" (haloless) graphic.
        const status = lifelines?.[id]?.status ?? null;
        return (
          <StripTile
            key={id}
            id={id}
            status={status}
            isActive={activeView === id}
            onPress={() => onSelect(id)}
            buttonRef={buttonRefs[id]}
          />
        );
      })}
    </nav>
  );
}
