import { useTranslation } from 'react-i18next';
import styles from './IncidentTimeline.module.css';

const STEP_MS = 60 * 60 * 1000; // ‹ › step = 1 hour

interface IncidentTimelineProps {
  minMs: number; // earliest event (slider start)
  maxMs: number; // slider end — "now" (== Live), or the incident end when ended
  // null = Live (current); otherwise the as-of timestamp being viewed.
  asOfMs: number | null;
  // Ended incident: no Live, read-only history clamped to [minMs, maxMs]. The
  // timeline can't be closed (it's the only view) and null asOf shows the end.
  liveDisabled?: boolean;
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
  asOfMs,
  liveDisabled = false,
  onChange,
  onClose,
}: IncidentTimelineProps) {
  const { t } = useTranslation();
  // When Live is disabled (ended incident), a null asOf means "the end time".
  const isLive = !liveDisabled && asOfMs === null;

  if (!Number.isFinite(minMs) || maxMs <= minMs) {
    return (
      <div className={styles.bar}>
        <span className={styles.empty}>{t('timeline.empty')}</span>
        {!liveDisabled && (
          <button type="button" className={styles.close} aria-label={t('common.close')} onClick={onClose}>
            ✕
          </button>
        )}
      </div>
    );
  }

  // Live sits at the far-right. Ended: default a null asOf to the end (maxMs).
  const current = isLive
    ? maxMs
    : Math.min(Math.max(asOfMs ?? maxMs, minMs), maxMs);

  const set = (ms: number) => {
    // Active timeline snaps to Live at the far right; ended clamps into window.
    if (!liveDisabled && ms >= maxMs) onChange(null);
    else onChange(Math.min(Math.max(minMs, ms), maxMs));
  };

  // ‹ / › step back / forward 1 hour (set() clamps to [minMs] and snaps to Live
  // once it reaches now).
  const stepPrev = () => set(current - STEP_MS);
  const stepNext = () => set(current + STEP_MS);

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
      {/* Ended incidents have no Live and can't be closed (it's the only view). */}
      {!liveDisabled && (
        <>
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
        </>
      )}
    </div>
  );
}
