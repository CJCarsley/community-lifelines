import { useTranslation } from 'react-i18next';
import styles from './IncidentTimeline.module.css';

interface IncidentTimelineProps {
  timestamps: number[];
  // null = Live (current); otherwise the as-of timestamp being viewed.
  asOfMs: number | null;
  onChange: (ms: number | null) => void;
  onClose: () => void;
}

function fmt(ms: number): string {
  return new Date(ms).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function IncidentTimeline({
  timestamps,
  asOfMs,
  onChange,
  onClose,
}: IncidentTimelineProps) {
  const { t } = useTranslation();
  const n = timestamps.length;
  const isLive = asOfMs === null;

  if (n === 0) {
    return (
      <div className={styles.bar}>
        <span className={styles.empty}>{t('timeline.empty')}</span>
        <button type="button" className={styles.close} aria-label={t('common.close')} onClick={onClose}>
          ✕
        </button>
      </div>
    );
  }

  const maxIdx = n - 1;
  // Far-right of the slider == Live (and the latest snapshot).
  const value = isLive ? maxIdx : Math.max(0, timestamps.indexOf(asOfMs));

  const onSlide = (idx: number) => {
    if (idx >= maxIdx) onChange(null);
    else onChange(timestamps[idx]);
  };

  return (
    <div className={styles.bar} role="group" aria-label={t('timeline.label')}>
      <span className={styles.label}>{t('timeline.label')}</span>
      <span className={`${styles.stamp}${isLive ? ` ${styles.stampLive}` : ''}`}>
        {isLive ? t('timeline.live') : fmt(timestamps[value])}
      </span>
      <input
        type="range"
        min={0}
        max={maxIdx}
        step={1}
        value={value}
        onChange={(e) => onSlide(Number(e.target.value))}
        className={styles.slider}
        aria-label={t('timeline.label')}
        aria-valuetext={isLive ? t('timeline.live') : fmt(timestamps[value])}
      />
      <button
        type="button"
        className={`${styles.liveBtn}${isLive ? ` ${styles.liveActive}` : ''}`}
        onClick={() => onChange(null)}
      >
        {t('timeline.live')}
      </button>
      <button type="button" className={styles.close} aria-label={t('common.close')} onClick={onClose}>
        ✕
      </button>
    </div>
  );
}
