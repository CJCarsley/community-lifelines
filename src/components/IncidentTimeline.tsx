import { useTranslation } from 'react-i18next';
import styles from './IncidentTimeline.module.css';

interface IncidentTimelineProps {
  minMs: number; // earliest event (slider start)
  maxMs: number; // "now" (slider end == Live)
  markers: number[]; // event timestamps for the ‹ › step buttons (sorted asc)
  // null = Live (current); otherwise the as-of timestamp being viewed.
  asOfMs: number | null;
  onChange: (ms: number | null) => void;
  onClose: () => void;
}

const pad = (n: number) => String(n).padStart(2, '0');

// Epoch ms -> "YYYY-MM-DDTHH:mm:ss" in local time (datetime-local format).
function toLocalInput(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
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
  minMs,
  maxMs,
  markers,
  asOfMs,
  onChange,
  onClose,
}: IncidentTimelineProps) {
  const { t } = useTranslation();
  const isLive = asOfMs === null;

  if (!Number.isFinite(minMs) || maxMs <= minMs) {
    return (
      <div className={styles.bar}>
        <span className={styles.empty}>{t('timeline.empty')}</span>
        <button type="button" className={styles.close} aria-label={t('common.close')} onClick={onClose}>
          ✕
        </button>
      </div>
    );
  }

  // Live sits at the far-right (== now).
  const current = isLive ? maxMs : Math.min(Math.max(asOfMs, minMs), maxMs);

  const set = (ms: number) => {
    if (ms >= maxMs) onChange(null);
    else onChange(Math.max(minMs, ms));
  };

  // ‹ / › step to the previous / next event marker (a moment something changed).
  const stepPrev = () => {
    const prev = markers.filter((m) => m < current).pop();
    onChange(prev ?? minMs);
  };
  const stepNext = () => {
    const next = markers.find((m) => m > current);
    onChange(next ?? null); // past the last marker → Live
  };

  return (
    <div className={styles.bar} role="group" aria-label={t('timeline.label')}>
      <span className={styles.label}>{t('timeline.label')}</span>

      <input
        type="datetime-local"
        className={styles.picker}
        value={toLocalInput(current)}
        min={toLocalInput(minMs)}
        max={toLocalInput(maxMs)}
        step={1}
        onChange={(e) => {
          const ms = new Date(e.target.value).getTime();
          if (Number.isFinite(ms)) set(ms);
        }}
        aria-label={t('timeline.jumpLabel')}
      />

      <button type="button" className={styles.step} onClick={stepPrev} aria-label={t('timeline.prev')}>
        ‹
      </button>
      <input
        type="range"
        min={minMs}
        max={maxMs}
        step={1000}
        value={current}
        onChange={(e) => set(Number(e.target.value))}
        className={styles.slider}
        aria-label={t('timeline.label')}
      />
      <button type="button" className={styles.step} onClick={stepNext} aria-label={t('timeline.next')}>
        ›
      </button>

      <span className={`${styles.stampLive}${isLive ? '' : ` ${styles.stampPast}`}`}>
        {isLive ? t('timeline.live') : fmt(current)}
      </span>
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
