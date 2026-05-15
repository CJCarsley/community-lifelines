import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRadioGroup, useRadio } from '@react-aria/radio';
import { useRadioGroupState } from '@react-stately/radio';
import { useMapView } from '@features/map/useMapView';
import { useUpdateLifelineStatus } from '@hooks/useUpdateLifelineStatus';
import { useAuth, EDIT_ROLES } from '@hooks/useAuth';
import type { Incident, Lifeline, LifelineId, LifelineStatus } from '@types';
import styles from './LifelineDrawer.module.css';

// ─── Constants ───────────────────────────────────────────────────────────────

// Nebraska enhanced status palette — must match the graphic halo colors
const STATUS_COLORS: Record<LifelineStatus, string> = {
  unknown:  '#888780',
  stable:   '#2E8B47',
  minor:    '#EAB308',
  moderate: '#EF7C1F',
  major:    '#E24B4A',
  extreme:  '#7B2D8E',
};

const STATUS_ORDER: LifelineStatus[] = ['unknown', 'stable', 'minor', 'moderate', 'major', 'extreme'];

const SEVERITY_COLORS: Record<Incident['severity'], string> = {
  low:          '#3B8BD4',
  moderate:     '#EF9F27',
  high:         '#E24B4A',
  catastrophic: '#A32D2D',
};

// ─── StatusRadioOption ────────────────────────────────────────────────────────

type RadioState = ReturnType<typeof useRadioGroupState>;

interface StatusRadioOptionProps {
  value: LifelineStatus;
  label: string;
  state: RadioState;
}

function StatusRadioOption({ value, label, state }: StatusRadioOptionProps) {
  const ref = useRef<HTMLInputElement>(null);
  const { inputProps } = useRadio({ value, children: label }, state, ref);
  const isSelected = state.selectedValue === value;
  const color = STATUS_COLORS[value];

  return (
    <span className={styles.segmentedOption}>
      <input {...inputProps} ref={ref} className={styles.srOnly} />
      <label
        htmlFor={inputProps.id}
        className={`${styles.segmentedLabel}${isSelected ? ` ${styles.segmentedLabelSelected}` : ''}`}
        style={isSelected ? { backgroundColor: color } : undefined}
      >
        {label}
      </label>
    </span>
  );
}

// ─── LifelineDrawer ───────────────────────────────────────────────────────────

export interface LifelineDrawerProps {
  lifelineId: LifelineId;
  lifeline: Lifeline;
  incidents: Incident[];
  eventId: string;
  onClose: () => void;
}

export default function LifelineDrawer({
  lifelineId,
  lifeline,
  incidents,
  eventId,
  onClose,
}: LifelineDrawerProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const viewRef = useMapView();
  const updateMutation = useUpdateLifelineStatus();

  const canEdit = user !== null && user.roles.some((r) => EDIT_ROLES.includes(r));

  // Optimistic local status
  const [localStatus, setLocalStatus] = useState<LifelineStatus>(lifeline.status);
  const localStatusRef = useRef(localStatus);
  localStatusRef.current = localStatus;

  // Notes with debounced autosave
  const [notes, setNotes] = useState(lifeline.notes ?? '');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Focus management ──────────────────────────────────────────────────────

  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleStatusChange = useCallback(
    (status: LifelineStatus) => {
      setLocalStatus(status);
      updateMutation.mutate({ eventId, lifelineId, status });
    },
    [eventId, lifelineId, updateMutation],
  );

  const handleNotesChange = (value: string) => {
    setNotes(value);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      updateMutation.mutate({
        eventId,
        lifelineId,
        status: localStatusRef.current,
        notes: value,
      });
    }, 800);
  };

  const locateIncident = useCallback(
    (incident: Incident) => {
      const view = viewRef.current;
      if (!view) return;
      void view.goTo({ center: incident.coordinates, zoom: 12 });
    },
    [viewRef],
  );

  // ── Status radio group ────────────────────────────────────────────────────

  const statusLabel = t('lifeline.drawer.statusControl');
  const radioState = useRadioGroupState({
    value: localStatus,
    onChange: (val) => handleStatusChange(val as LifelineStatus),
    label: statusLabel,
    isDisabled: !canEdit,
  });
  const { radioGroupProps } = useRadioGroup(
    { label: statusLabel, orientation: 'horizontal', isDisabled: !canEdit },
    radioState,
  );

  // ── Timestamps ────────────────────────────────────────────────────────────

  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });

  const lifelineName = t(`lifeline.${lifelineId}.label`);

  return (
    <aside
      role="complementary"
      aria-label={t('lifeline.drawer.ariaLabel', { name: lifelineName })}
      className={styles.drawer}
    >
      {/* ── Header ── */}
      <div className={styles.header}>
        <h2 ref={headingRef} tabIndex={-1} className={styles.heading}>
          {lifelineName}
        </h2>
        <div className={styles.headerMeta}>
          <span
            className={styles.statusBadge}
            style={{ backgroundColor: STATUS_COLORS[localStatus] }}
          >
            {t(`lifeline.status.${localStatus}`)}
          </span>
          <span className={styles.lastUpdated}>
            {t('lifeline.drawer.lastUpdated', { time: fmtTime(lifeline.lastUpdated) })}
          </span>
        </div>
      </div>

      {/* ── Body ── */}
      <div className={styles.body}>

        {/* Status change control */}
        {canEdit && (
          <div className={styles.section}>
            <span className={styles.sectionLabel}>
              {t('lifeline.drawer.statusControl')}
            </span>
            <div {...radioGroupProps} className={styles.segmented}>
              {STATUS_ORDER.map((val) => (
                <StatusRadioOption
                  key={val}
                  value={val}
                  label={t(`lifeline.status.${val}`)}
                  state={radioState}
                />
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        <div className={styles.section}>
          <label className={styles.sectionLabel} htmlFor={canEdit ? 'lifeline-notes' : undefined}>
            {t('lifeline.drawer.notes')}
          </label>
          {canEdit ? (
            <textarea
              id="lifeline-notes"
              className={styles.notesTextarea}
              value={notes}
              onChange={(e) => handleNotesChange(e.target.value)}
              placeholder={t('lifeline.drawer.notesPlaceholder')}
              rows={3}
            />
          ) : (
            <div className={styles.notesReadonly}>
              {notes || <em>{t('lifeline.drawer.notesEmpty')}</em>}
            </div>
          )}
        </div>

        {/* Affected incidents */}
        <div className={styles.section}>
          <span className={styles.sectionLabel}>
            {t('lifeline.drawer.incidents')} ({incidents.length})
          </span>
          {incidents.length === 0 ? (
            <p className={styles.emptyHint}>{t('lifeline.drawer.noIncidents')}</p>
          ) : (
            <div className={styles.incidentList}>
              {incidents.map((incident) => (
                <div key={incident.id} className={styles.incidentCard}>
                  <p className={styles.incidentTitle}>{incident.title}</p>
                  <div className={styles.incidentMeta}>
                    <span
                      className={styles.severityChip}
                      style={{ backgroundColor: SEVERITY_COLORS[incident.severity] }}
                    >
                      {incident.severity}
                    </span>
                    <span className={styles.incidentTs}>{fmtTime(incident.timestamp)}</span>
                  </div>
                  <button
                    type="button"
                    className={styles.locateBtn}
                    onClick={() => locateIncident(incident)}
                  >
                    {t('lifeline.drawer.locateOnMap')}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </aside>
  );
}
