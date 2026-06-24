import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useButton } from '@react-aria/button';
import { useRadioGroup, useRadio } from '@react-aria/radio';
import { useRadioGroupState } from '@react-stately/radio';
import MapView from '@features/map/MapView';
import IncidentsLayer from '@features/incidents/IncidentsLayer';
import { MapViewProvider, useMapView } from '@features/map/useMapView';
import { useUpdateLifelineStatus } from '@hooks/useUpdateLifelineStatus';
import { useLifelineSubmissions, type LifelineSubmission } from '@hooks/useLifelineSubmissions';
import { useAuth } from '@hooks/useAuth';
import { useMyAssignedLifelines } from '@hooks/useLifelineAssignments';
import type { Lifeline, LifelineId, LifelineStatus } from '@types';
import styles from './MobileLifelinePage.module.css';

// ─── Shared palettes (kept in sync with LifelineDrawer) ──────────────────────

const STATUS_COLORS: Record<LifelineStatus, string> = {
  unknown:  '#888780',
  stable:   '#2E8B47',
  minor:    '#EAB308',
  moderate: '#EF7C1F',
  major:    '#E24B4A',
  extreme:  '#7B2D8E',
};

const STATUS_ORDER: LifelineStatus[] = [
  'unknown', 'stable', 'minor', 'moderate', 'major', 'extreme',
];

const KNOWN_SEVERITY_COLORS: Record<string, string> = {
  low:          '#3B8BD4',
  moderate:     '#EF9F27',
  high:         '#E24B4A',
  catastrophic: '#A32D2D',
};

const FALLBACK_SEVERITY_COLOR = '#6b7280';

// ─── ZoomToSubmissions ───────────────────────────────────────────────────────

// Auto-frames the map on the relevant submission(s) whenever the focus target
// changes. Centered + zoom heuristic (no Extent module — keeps bundle small).
function ZoomToSubmissions({
  submissions,
  focused,
}: {
  submissions: LifelineSubmission[];
  focused: LifelineSubmission | null;
}) {
  const { ref: viewRef, isReady } = useMapView();
  const lastTargetRef = useRef<string>('');

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !isReady) return;

    if (focused && focused.coordinates) {
      const key = `focus:${focused.objectId}`;
      if (lastTargetRef.current === key) return;
      lastTargetRef.current = key;
      void view.goTo({ center: focused.coordinates, zoom: 12 });
      return;
    }

    const withCoords = submissions.filter((s) => s.coordinates !== null);

    if (withCoords.length === 0) {
      const key = 'empty';
      if (lastTargetRef.current === key) return;
      lastTargetRef.current = key;
      void view.goTo({ center: [-98.5795, 39.8283], zoom: 5 });
      return;
    }

    if (withCoords.length === 1) {
      const key = `single:${withCoords[0].objectId}`;
      if (lastTargetRef.current === key) return;
      lastTargetRef.current = key;
      void view.goTo({ center: withCoords[0].coordinates!, zoom: 11 });
      return;
    }

    const lons = withCoords.map((s) => s.coordinates![0]);
    const lats = withCoords.map((s) => s.coordinates![1]);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const centerLon = (minLon + maxLon) / 2;
    const centerLat = (minLat + maxLat) / 2;
    const span = Math.max(maxLon - minLon, maxLat - minLat);

    let zoom = 11;
    if (span > 0.3) zoom = 9;
    if (span > 1.5) zoom = 7;
    if (span > 5)   zoom = 6;
    if (span > 12)  zoom = 5;

    const key = `multi:${centerLon.toFixed(3)},${centerLat.toFixed(3)},${zoom}`;
    if (lastTargetRef.current === key) return;
    lastTargetRef.current = key;
    void view.goTo({ center: [centerLon, centerLat], zoom });
  }, [submissions, focused, viewRef, isReady]);

  return null;
}

// ─── Status segmented radio ──────────────────────────────────────────────────

type RadioState = ReturnType<typeof useRadioGroupState>;

function StatusRadioOption({
  value,
  label,
  state,
}: {
  value: LifelineStatus;
  label: string;
  state: RadioState;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const { inputProps } = useRadio({ value, children: label }, state, ref);
  const isSelected = state.selectedValue === value;
  const color = STATUS_COLORS[value];

  return (
    <span className={styles.segmentedOption}>
      <label
        className={`${styles.segmentedLabel}${isSelected ? ` ${styles.segmentedLabelSelected}` : ''}`}
        style={isSelected ? { backgroundColor: color } : undefined}
      >
        <input {...inputProps} ref={ref} className={styles.srOnly} />
        {label}
      </label>
    </span>
  );
}

// ─── BackButton ──────────────────────────────────────────────────────────────

function BackButton({ onPress, label }: { onPress: () => void; label: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  const { buttonProps } = useButton({ onPress }, ref);
  return (
    <button
      {...buttonProps}
      ref={ref}
      aria-label={label}
      className={styles.backBtn}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="15 18 9 12 15 6" />
      </svg>
    </button>
  );
}

// ─── MobileLifelinePage ──────────────────────────────────────────────────────

export interface MobileLifelinePageProps {
  lifelineId: LifelineId;
  lifeline: Lifeline;
  // Used ONLY to scope the submissions list (community status is incident-free).
  incidentId: string | null;
  // Viewing an ended incident / past snapshot ⇒ read-only.
  readOnly?: boolean;
  onBack: () => void;
}

export default function MobileLifelinePage(props: MobileLifelinePageProps) {
  return (
    <MapViewProvider>
      <MobileLifelinePageBody {...props} />
    </MapViewProvider>
  );
}

function MobileLifelinePageBody({
  lifelineId,
  lifeline,
  incidentId,
  readOnly = false,
  onBack,
}: MobileLifelinePageProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const updateMutation = useUpdateLifelineStatus();

  const { assigned } = useMyAssignedLifelines();
  const isAdmin = user !== null && user.roles.includes('Admin');
  const canEdit = (isAdmin || assigned.has(lifelineId)) && !readOnly;

  const [localStatus, setLocalStatus] = useState<LifelineStatus>(lifeline.status);
  const localStatusRef = useRef(localStatus);
  localStatusRef.current = localStatus;

  const [notes, setNotes] = useState(lifeline.notes ?? '');
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // While viewing an ended incident / past snapshot (read-only), sync displayed
  // values from props as the as-of status changes.
  useEffect(() => {
    if (readOnly) {
      setLocalStatus(lifeline.status);
      setNotes(lifeline.notes ?? '');
    }
  }, [readOnly, lifeline.status, lifeline.notes]);

  const [focusedSubmission, setFocusedSubmission] = useState<LifelineSubmission | null>(null);

  const submissionsQuery = useLifelineSubmissions(lifelineId, incidentId);
  const submissions = submissionsQuery.data ?? [];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onBack();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onBack]);

  const handleStatusChange = useCallback(
    (status: LifelineStatus) => {
      setLocalStatus(status);
      updateMutation.mutate({ lifelineId, status, notes: notesRef.current });
    },
    [lifelineId, updateMutation],
  );

  const handleNotesChange = (value: string) => {
    setNotes(value);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      updateMutation.mutate({
        lifelineId,
        status: localStatusRef.current,
        notes: value,
      });
    }, 800);
  };

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

  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });

  const lifelineName = t(`lifeline.${lifelineId}.label`);

  return (
    <div className={styles.page}>
      {/* ── Header ── */}
      <header className={styles.header}>
        <BackButton onPress={onBack} label={t('common.back', 'Back')} />
        <div className={styles.headerText}>
          <h1 className={styles.heading}>{lifelineName}</h1>
          <div className={styles.headerMeta}>
            <span
              className={styles.statusBadge}
              style={{ backgroundColor: STATUS_COLORS[localStatus] }}
            >
              {t(`lifeline.status.${localStatus}`)}
            </span>
            <span className={styles.lastUpdated}>
              {fmtTime(lifeline.lastUpdated)}
            </span>
          </div>
        </div>
      </header>

      {/* ── Map slot (small, fixed) ── */}
      <div className={styles.mapSlot}>
        <MapView>
          <IncidentsLayer activeView={lifelineId} incidentId={incidentId} visible />
          <ZoomToSubmissions submissions={submissions} focused={focusedSubmission} />
        </MapView>
      </div>

      {/* ── Scrollable content ── */}
      <div className={styles.content}>
        {canEdit && (
          <section className={styles.section}>
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
          </section>
        )}

        <section className={styles.section}>
          <label
            className={styles.sectionLabel}
            htmlFor={canEdit ? 'mobile-lifeline-notes' : undefined}
          >
            {t('lifeline.drawer.notes')}
          </label>
          {canEdit ? (
            <textarea
              id="mobile-lifeline-notes"
              className={styles.notesTextarea}
              value={notes}
              onChange={(e) => handleNotesChange(e.target.value)}
              placeholder={t('lifeline.drawer.notesPlaceholder')}
              rows={4}
            />
          ) : (
            <div className={styles.notesReadonly}>
              {notes || <em>{t('lifeline.drawer.notesEmpty')}</em>}
            </div>
          )}
        </section>

        <section className={styles.section}>
          <span className={styles.sectionLabel}>
            {t('lifeline.drawer.incidents')}
            {submissionsQuery.isSuccess ? ` (${submissions.length})` : ''}
          </span>
          {submissionsQuery.isLoading ? (
            <p className={styles.emptyHint}>{t('lifeline.drawer.loadingIncidents')}</p>
          ) : submissionsQuery.isError ? (
            <p className={styles.emptyHint}>{t('lifeline.drawer.loadIncidentsError')}</p>
          ) : submissions.length === 0 ? (
            <p className={styles.emptyHint}>{t('lifeline.drawer.noIncidents')}</p>
          ) : (
            <ul className={styles.incidentList}>
              {submissions.map((sub) => {
                const isFocused = focusedSubmission?.objectId === sub.objectId;
                const sevKey = sub.severity?.toLowerCase() ?? '';
                const sevColor = KNOWN_SEVERITY_COLORS[sevKey] ?? FALLBACK_SEVERITY_COLOR;
                const canLocate = sub.coordinates !== null;
                return (
                  <li key={sub.objectId}>
                    <button
                      type="button"
                      className={`${styles.incidentCard}${isFocused ? ` ${styles.incidentCardFocused}` : ''}`}
                      onClick={() =>
                        canLocate &&
                        setFocusedSubmission(isFocused ? null : sub)
                      }
                      aria-pressed={isFocused}
                      disabled={!canLocate}
                    >
                      {sub.aiInterpretation && (
                        <p className={styles.incidentTitle}>{sub.aiInterpretation}</p>
                      )}
                      <div className={styles.incidentMeta}>
                        {sub.severity && (
                          <span
                            className={styles.severityChip}
                            style={{ backgroundColor: sevColor }}
                          >
                            {sub.severity}
                          </span>
                        )}
                        {sub.submittedAt && (
                          <span className={styles.incidentTs}>
                            {fmtTime(sub.submittedAt)}
                          </span>
                        )}
                      </div>
                      {canLocate && (
                        <span className={styles.incidentLocate}>
                          {isFocused
                            ? t('lifeline.drawer.showAll', 'Show all')
                            : t('lifeline.drawer.locateOnMap')}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
