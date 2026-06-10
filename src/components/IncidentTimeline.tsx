import { useTranslation } from 'react-i18next';
import styles from './IncidentTimeline.module.css';

interface IncidentTimelineProps {
  timestamps: number[];
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
  const first = timestamps[0];
  const last = timestamps[maxIdx];
  const currentMs = isLive ? last : asOfMs;
  // Far-right of the slider == Live (and the latest snapshot).
  const value = isLive ? maxIdx : Math.max(0, timestamps.indexOf(asOfMs));

  // Map an arbitrary picked time to the snapshot in effect then (latest <= pick).
  const snapTo = (pickedMs: number) => {
    if (!Number.isFinite(pickedMs)) return;
    if (pickedMs >= last) {
      onChange(null);
      return;
    }
    let snap = first;
    for (const ts of timestamps) {
      if (ts <= pickedMs) snap = ts;
      else break;
    }
    onChange(snap);
  };

  const onSlide = (idx: number) => {
    if (idx >= maxIdx) onChange(null);
    else onChange(timestamps[idx]);
  };

  return (
    <div className={styles.bar} role="group" aria-label={t('timeline.label')}>
      <span className={styles.label}>{t('timeline.label')}</span>
      <input
        type="datetime-local"
        className={styles.picker}
        value={toLocalInput(currentMs)}
        min={toLocalInput(first)}
        max={toLocalInput(last)}
        step={1}
        onChange={(e) => snapTo(new Date(e.target.value).getTime())}
        aria-label={t('timeline.jumpLabel')}
      />
      {isLive && <span className={styles.stampLive}>{t('timeline.live')}</span>}
      <input
        type="range"
        min={0}
        max={maxIdx}
        step={1}
        value={value}
        onChange={(e) => onSlide(Number(e.target.value))}
        className={styles.slider}
        aria-label={t('timeline.label')}
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
