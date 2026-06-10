import React, { useCallback, useEffect, useMemo, useState } from 'react';
import MapView from '@features/map/MapView';
import IncidentsLayer from '@features/incidents/IncidentsLayer';
import IncidentCreateControl from '@features/incidents/IncidentCreateControl';
import IncidentFeatureToolbar from '@features/incidents/IncidentFeatureToolbar';
import IncidentChat from '@features/incidents/IncidentChat';
import MapToolbar from '@features/map/MapToolbar';
import LifelineDrawer from '@features/lifelines/LifelineDrawer';
import LifelineStrip from '@features/lifelines/LifelineStrip';
import AdminPage from '@features/admin/AdminPage';
import IncidentSelector from '@components/IncidentSelector';
import IncidentTimeline from '@components/IncidentTimeline';
import MobileShell from '@features/mobile/MobileShell';
import { MapViewProvider } from '@features/map/useMapView';
import { useIsMobile } from '@hooks/useIsMobile';
import { useAuth } from '@hooks/useAuth';
import { useMapConfig } from '@contexts/MapConfigContext';
import { useLifelineStatuses } from '@hooks/useLifelineStatuses';
import { useIncidentHistory, statusesAsOf } from '@hooks/useIncidentHistory';
import { mergeLifelineStatuses } from '@utils/mergeLifelineStatuses';
import { DEFAULT_LIFELINES } from '@utils/defaultLifelines';
import { useIncidentContext } from '@contexts/IncidentContext';
import { useTranslation } from 'react-i18next';
import type { LifelineId, LifelineStatus } from '@types';
import styles from './App.module.css';

type ActiveView = 'map' | 'admin' | LifelineId;

const LIFELINE_IDS: LifelineId[] = [
  'safety-security',
  'food-hydration-shelter',
  'health-medical',
  'energy',
  'communications',
  'transportation',
  'hazardous-material',
  'water-systems',
];

const SEVERITY_COLORS = {
  low:          '#4caf50',
  moderate:     '#EF9F27',
  high:         '#E24B4A',
  catastrophic: '#7B0000',
} as const;

type EventSeverity = keyof typeof SEVERITY_COLORS;

// Worst-of mapping: roll up the most severe individual lifeline status into
// an event-level severity badge.
function deriveEventSeverity(statuses: LifelineStatus[]): EventSeverity {
  if (statuses.some((s) => s === 'extreme')) return 'catastrophic';
  if (statuses.some((s) => s === 'major'))   return 'high';
  if (statuses.some((s) => s === 'moderate')) return 'moderate';
  return 'low';
}

export default function App({ signOut }: { signOut?: () => void }) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const { mapVersion } = useMapConfig();

  const isAdmin = user !== null && user.roles.includes('Admin');

  const [activeView, setActiveView] = useState<ActiveView>('map');
  const [incidentsVisible, setIncidentsVisible] = useState(true);

  const { activeIncident } = useIncidentContext();
  const incidentId = activeIncident?.incidentId ?? null;
  const { data: liveStatuses } = useLifelineStatuses(incidentId);

  // Snapshot timeline: hidden by default; asOfMs null = Live (current).
  const [historyOpen, setHistoryOpen] = useState(false);
  const [asOfMs, setAsOfMs] = useState<number | null>(null);
  const { rows: historyRows, timestamps: historyTimestamps } = useIncidentHistory(
    incidentId,
    historyOpen,
  );
  const viewingHistory = historyOpen && asOfMs !== null;

  // Reset the timeline whenever the active incident changes.
  useEffect(() => {
    setHistoryOpen(false);
    setAsOfMs(null);
  }, [incidentId]);

  // Live rows (or the as-of snapshot when scrubbing) overlay the default
  // all-unknown base. Drives the strip tiles, drawer, and severity badge.
  const effectiveStatuses = useMemo(
    () => (viewingHistory ? statusesAsOf(historyRows, asOfMs as number) : liveStatuses),
    [viewingHistory, historyRows, asOfMs, liveStatuses],
  );
  const lifelines = useMemo(
    () => mergeLifelineStatuses(DEFAULT_LIFELINES, effectiveStatuses),
    [effectiveStatuses],
  );

  const handleToggleHistory = useCallback(() => {
    setHistoryOpen((open) => {
      if (open) setAsOfMs(null);
      return !open;
    });
  }, []);

  const eventSeverity = useMemo<EventSeverity | null>(() => {
    if (!lifelines) return null;
    return deriveEventSeverity(Object.values(lifelines).map((l) => l.status));
  }, [lifelines]);

  // Per-lifeline tile refs — used to return focus when drawer closes (desktop)
  const lifelineButtonRefs = useMemo(
    () =>
      Object.fromEntries(
        LIFELINE_IDS.map((id) => [id, React.createRef<HTMLButtonElement>()])
      ) as Record<LifelineId, React.RefObject<HTMLButtonElement>>,
    [],
  );

  const handleSelectLifeline = useCallback((id: LifelineId) => {
    setActiveView((prev) => (prev === id ? 'map' : id));
  }, []);

  const handleDrawerClose = useCallback(() => {
    const id = activeView as LifelineId;
    setActiveView('map');
    requestAnimationFrame(() => lifelineButtonRefs[id]?.current?.focus());
  }, [activeView, lifelineButtonRefs]);

  const handleToggleAdmin = useCallback(() => {
    setActiveView((prev) => (prev === 'admin' ? 'map' : 'admin'));
  }, []);

  const showAdminNav = isAdmin && !isMobile;
  const isAdminActive = activeView === 'admin';
  const mapActiveView: 'map' | LifelineId =
    activeView === 'admin' ? 'map' : activeView;
  const isLifelineActive = mapActiveView !== 'map';

  return (
    <div className={isMobile ? styles.mobileShell : styles.shell}>
      {/* ── Top bar ── */}
      <header className={styles.topBar}>
        <span className={styles.topBarLeft}>{t('app.title')}</span>

        <div className={styles.topBarCenter}>
          <IncidentSelector />
          {activeIncident !== null && eventSeverity !== null && (
            <span
              className={styles.severityBadge}
              style={{ backgroundColor: SEVERITY_COLORS[eventSeverity] }}
            >
              {t(`event.severity.${eventSeverity}`)}
            </span>
          )}
        </div>

        <div className={styles.topBarRight}>
          {!isMobile && activeIncident && (
            <button
              type="button"
              className={`${styles.adminBtn}${historyOpen ? ` ${styles.adminBtnActive}` : ''}`}
              aria-pressed={historyOpen}
              onClick={handleToggleHistory}
            >
              {t('topBar.history')}
            </button>
          )}
          {showAdminNav && (
            <button
              type="button"
              className={`${styles.adminBtn}${isAdminActive ? ` ${styles.adminBtnActive}` : ''}`}
              aria-pressed={isAdminActive}
              onClick={handleToggleAdmin}
            >
              {t('admin.navButton')}
            </button>
          )}
          <button className={styles.signOutBtn} onClick={signOut}>
            {t('auth.signOut')}
          </button>
        </div>
      </header>

      {isMobile ? (
        /* ── Mobile: home grid → lifeline detail page ── */
        <MobileShell />
      ) : (
        <>
          {/* ── Lifeline graphic strip ── */}
          <LifelineStrip
            className={styles.stripRow}
            lifelines={lifelines}
            activeView={mapActiveView}
            onSelect={handleSelectLifeline}
            buttonRefs={lifelineButtonRefs}
          />

          {historyOpen && (
            <IncidentTimeline
              timestamps={historyTimestamps}
              asOfMs={asOfMs}
              onChange={setAsOfMs}
              onClose={() => {
                setHistoryOpen(false);
                setAsOfMs(null);
              }}
            />
          )}

          {/* ── Content area ── */}
          <main className={styles.content} role="tabpanel">
            {isAdminActive ? (
              <AdminPage />
            ) : (
              <MapViewProvider key={mapVersion}>
                <MapView>
                  {activeIncident && (
                    <IncidentsLayer
                      activeView={mapActiveView}
                      incidentId={activeIncident.incidentId}
                      visible={incidentsVisible}
                    />
                  )}
                  <MapToolbar
                    incidentsVisible={incidentsVisible}
                    onToggleIncidents={() => setIncidentsVisible((v) => !v)}
                  />
                  {isAdmin && <IncidentCreateControl />}
                  {isAdmin && <IncidentFeatureToolbar />}
                  {activeIncident && (
                    <IncidentChat
                      incidentId={activeIncident.incidentId}
                      asOfMs={viewingHistory ? asOfMs : null}
                      currentUserEmail={user?.email ?? null}
                    />
                  )}
                </MapView>

                {isLifelineActive && activeIncident && lifelines && (
                  <LifelineDrawer
                    key={mapActiveView}
                    lifelineId={mapActiveView}
                    lifeline={lifelines[mapActiveView]}
                    incidentId={activeIncident.incidentId}
                    readOnly={viewingHistory}
                    onClose={handleDrawerClose}
                  />
                )}
              </MapViewProvider>
            )}
          </main>
        </>
      )}
    </div>
  );
}
