import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useButton } from '@react-aria/button';
import { FocusScope } from '@react-aria/focus';
import { useDialog } from '@react-aria/dialog';
import { DismissButton, useOverlay } from '@react-aria/overlays';
import { useMapView } from './useMapView';
import styles from './MapToolbar.module.css';

// ─── Basemap config ───────────────────────────────────────────────────────────

const BASEMAPS = ['gray-vector', 'satellite', 'streets'] as const;
type BasemapId = typeof BASEMAPS[number];

const BASEMAP_NAMES: Record<BasemapId, string> = {
  'gray-vector': 'Topographic',
  satellite:     'Satellite',
  streets:       'Streets',
};

// ─── Severity / status config for legend ─────────────────────────────────────

const SEVERITY_COLORS = {
  low:          '#3B8BD4',
  moderate:     '#EF9F27',
  high:         '#E24B4A',
  catastrophic: '#A32D2D',
} as const;

const STATUS_COLORS = {
  unknown:  '#888780',
  stable:   '#2E8B47',
  minor:    '#EAB308',
  moderate: '#EF7C1F',
  major:    '#E24B4A',
  extreme:  '#7B2D8E',
} as const;

// ─── Inline SVG icons ─────────────────────────────────────────────────────────

function LayersIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" fill="currentColor">
      <path d="M9 2 2 6l7 4 7-4-7-4z" opacity=".5"/>
      <path d="M9 8 2 12l7 4 7-4-7-4z"/>
    </svg>
  );
}

function EyeIcon({ visible }: { visible: boolean }) {
  return visible ? (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M1 9s3-6 8-6 8 6 8 6-3 6-8 6-8-6-8-6z"/>
      <circle cx="9" cy="9" r="2.5" fill="currentColor" stroke="none"/>
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M1 9s3-6 8-6 8 6 8 6-3 6-8 6-8-6-8-6z" opacity=".4"/>
      <line x1="3" y1="3" x2="15" y2="15"/>
    </svg>
  );
}

function LegendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" fill="currentColor">
      <rect x="2" y="4" width="4" height="4" rx="1"/>
      <rect x="8" y="5" width="8" height="2" rx="1" opacity=".7"/>
      <rect x="2" y="10" width="4" height="4" rx="1" opacity=".6"/>
      <rect x="8" y="11" width="8" height="2" rx="1" opacity=".5"/>
    </svg>
  );
}

// ─── Severity shape SVGs (match ArcGIS SimpleMarkerSymbol styles) ─────────────

function SeverityShape({ severity, color }: { severity: keyof typeof SEVERITY_COLORS; color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      {severity === 'low' && (
        <circle cx="8" cy="8" r="6" fill={color} stroke="#fff" strokeWidth="1.5"/>
      )}
      {severity === 'moderate' && (
        <polygon points="8,2 14,8 8,14 2,8" fill={color} stroke="#fff" strokeWidth="1.5"/>
      )}
      {severity === 'high' && (
        <rect x="2" y="2" width="12" height="12" fill={color} stroke="#fff" strokeWidth="1.5"/>
      )}
      {severity === 'catastrophic' && (
        <g stroke={color} strokeWidth="2.5" strokeLinecap="round">
          <line x1="3" y1="3" x2="13" y2="13"/>
          <line x1="13" y1="3" x2="3" y2="13"/>
        </g>
      )}
    </svg>
  );
}

// ─── Status swatch SVGs ───────────────────────────────────────────────────────

// Colorblind-safe glyph per status (paired with color in the halo ring).
function StatusSwatch({ status, color }: { status: keyof typeof STATUS_COLORS; color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="6" fill={color}/>
      {status === 'unknown' && (
        <text x="8" y="11.5" textAnchor="middle" fill="#fff" fontSize="9" fontWeight="bold" fontFamily="system-ui">?</text>
      )}
      {status === 'stable' && (
        <path d="M5 8l2 2 4-4" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      )}
      {status === 'minor' && (
        <circle cx="8" cy="8" r="1.6" fill="#fff"/>
      )}
      {status === 'moderate' && (
        <path d="M8 5v4M8 11v.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" fill="none"/>
      )}
      {status === 'major' && (
        <g stroke="#fff" strokeWidth="1.8" strokeLinecap="round">
          <line x1="5.5" y1="5.5" x2="10.5" y2="10.5"/>
          <line x1="10.5" y1="5.5" x2="5.5" y2="10.5"/>
        </g>
      )}
      {status === 'extreme' && (
        <g stroke="#fff" strokeWidth="1.6" strokeLinecap="round">
          <line x1="4.5" y1="4.5" x2="11.5" y2="11.5"/>
          <line x1="11.5" y1="4.5" x2="4.5" y2="11.5"/>
          <circle cx="8" cy="8" r="3.5" fill="none"/>
        </g>
      )}
    </svg>
  );
}

// ─── ToolbarButton ────────────────────────────────────────────────────────────

interface ToolbarButtonProps {
  onPress: () => void;
  'aria-label': string;
  'aria-pressed'?: boolean;
  tooltip?: string;
  children: React.ReactNode;
}

function ToolbarButton({
  onPress,
  'aria-label': ariaLabel,
  'aria-pressed': pressed,
  tooltip,
  children,
}: ToolbarButtonProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const { buttonProps } = useButton({ onPress, 'aria-label': ariaLabel }, ref);
  return (
    <button
      {...buttonProps}
      ref={ref}
      aria-pressed={pressed}
      data-tooltip={tooltip}
      className={`${styles.toolbarBtn}${pressed ? ` ${styles.toolbarBtnActive}` : ''}`}
    >
      {children}
    </button>
  );
}

// ─── LegendPanel ─────────────────────────────────────────────────────────────

const LEGEND_TITLE_ID = 'map-legend-title';

function LegendPanel({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const { overlayProps } = useOverlay(
    { isOpen: true, onClose, isDismissable: true },
    panelRef,
  );
  const { dialogProps } = useDialog({ 'aria-labelledby': LEGEND_TITLE_ID }, panelRef);
  const { buttonProps: closeBtnProps } = useButton({ onPress: onClose, 'aria-label': t('map.legend.close') }, closeRef);

  return (
    <FocusScope contain restoreFocus>
      <div
        {...overlayProps}
        {...dialogProps}
        ref={panelRef}
        className={styles.legendPanel}
      >
        <DismissButton onDismiss={onClose} />

        <div className={styles.legendHeader}>
          <h2 id={LEGEND_TITLE_ID} className={styles.legendTitle}>
            {t('map.legend.title')}
          </h2>
          <button {...closeBtnProps} ref={closeRef} className={styles.legendCloseBtn}>
            ✕
          </button>
        </div>

        <div className={styles.legendBody}>
          {/* ── Severity ── */}
          <section className={styles.legendSection}>
            <h3 className={styles.legendSectionTitle}>
              {t('map.legend.severity.title')}
            </h3>
            {(Object.keys(SEVERITY_COLORS) as (keyof typeof SEVERITY_COLORS)[]).map((sev) => (
              <div key={sev} className={styles.legendItem}>
                <SeverityShape severity={sev} color={SEVERITY_COLORS[sev]} />
                <span className={styles.legendLabel}>{t(`map.legend.severity.${sev}`)}</span>
              </div>
            ))}
          </section>

          <div className={styles.legendDivider} />

          {/* ── Lifeline status ── */}
          <section className={styles.legendSection}>
            <h3 className={styles.legendSectionTitle}>
              {t('map.legend.status.title')}
            </h3>
            {(Object.keys(STATUS_COLORS) as (keyof typeof STATUS_COLORS)[]).map((st) => (
              <div key={st} className={styles.legendItem}>
                <StatusSwatch status={st} color={STATUS_COLORS[st]} />
                <span className={styles.legendLabel}>{t(`map.legend.status.${st}`)}</span>
              </div>
            ))}
          </section>

          <div className={styles.legendDivider} />

          {/* ── Impact zones ── */}
          <section className={styles.legendSection}>
            <div className={styles.legendItem}>
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <circle cx="8" cy="8" r="5" fill="rgba(100,100,100,0.15)"
                  stroke="rgba(100,100,100,0.6)" strokeWidth="1.5" strokeDasharray="3,2"/>
              </svg>
              <span className={styles.legendLabel}>{t('incidents.impactZone')}</span>
            </div>
          </section>
        </div>

        <DismissButton onDismiss={onClose} />
      </div>
    </FocusScope>
  );
}

// ─── MapToolbar ───────────────────────────────────────────────────────────────

export interface MapToolbarProps {
  incidentsVisible: boolean;
  onToggleIncidents: () => void;
}

export default function MapToolbar({ incidentsVisible, onToggleIncidents }: MapToolbarProps) {
  const { t } = useTranslation();
  const viewRef = useMapView();
  const [basemapIndex, setBasemapIndex] = useState(0);
  const [isLegendOpen, setIsLegendOpen] = useState(false);

  const cycleBasemap = useCallback(() => {
    const next = (basemapIndex + 1) % BASEMAPS.length;
    setBasemapIndex(next);
    const view = viewRef.current;
    if (view?.map) {
      // ArcGIS Map.basemap accepts string portal IDs at runtime
      (view.map as unknown as { basemap: string }).basemap = BASEMAPS[next];
    }
  }, [basemapIndex, viewRef]);

  const currentBasemapName = BASEMAP_NAMES[BASEMAPS[basemapIndex]];

  return (
    <>
      <div className={styles.toolbar} role="toolbar" aria-label={t('map.toolbar.label')}>
        <ToolbarButton
          onPress={cycleBasemap}
          aria-label={`${t('map.toolbar.basemap')}: ${currentBasemapName}`}
          tooltip={currentBasemapName}
        >
          <LayersIcon />
        </ToolbarButton>

        <div className={styles.toolbarDivider} aria-hidden="true" />

        <ToolbarButton
          onPress={onToggleIncidents}
          aria-label={t('map.toolbar.incidents')}
          aria-pressed={!incidentsVisible}
          tooltip={t('map.toolbar.incidents')}
        >
          <EyeIcon visible={incidentsVisible} />
        </ToolbarButton>

        <ToolbarButton
          onPress={() => setIsLegendOpen((v) => !v)}
          aria-label={t('map.toolbar.legend')}
          aria-pressed={isLegendOpen}
          tooltip={t('map.toolbar.legend')}
        >
          <LegendIcon />
        </ToolbarButton>
      </div>

      {isLegendOpen && <LegendPanel onClose={() => setIsLegendOpen(false)} />}
    </>
  );
}
