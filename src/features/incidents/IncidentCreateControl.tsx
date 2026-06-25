import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { useMapView } from '@features/map/useMapView';
import { useIncidentContext } from '@contexts/IncidentContext';
import {
  findIncidentSublayers,
  nextIncidentId,
  INCIDENT_START_FIELD,
  type IncidentGeometryKind,
} from './incidentLayers';
import { startIncidentSketch, type SketchSession } from './incidentSketch';
import { useIncidentTypes, INCIDENT_TYPE_FIELD } from './useIncidentTypes';
import IncidentTypePreview from './IncidentTypePreview';
import type GeometryType from '@arcgis/core/geometry/Geometry';
import styles from './IncidentCreateControl.module.css';

type Mode = 'form' | 'sketching' | 'saving';

const KINDS: IncidentGeometryKind[] = ['point', 'line', 'area'];

export default function IncidentCreateControl() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { ref: viewRef, isReady } = useMapView();
  const { incidents, setActiveIncidentId, isCreating, setIsCreating } = useIncidentContext();
  const { types } = useIncidentTypes();

  const [mode, setMode] = useState<Mode>('form');
  const [name, setName] = useState('');
  const [kind, setKind] = useState<IncidentGeometryKind>('area');
  const [typeCode, setTypeCode] = useState<string | number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Default the incident type to the first domain value once loaded.
  useEffect(() => {
    if (typeCode === null && types.length > 0) setTypeCode(types[0].code);
  }, [types, typeCode]);

  const sketchRef = useRef<SketchSession | null>(null);

  const cleanupSketch = useCallback(() => {
    sketchRef.current?.cancel();
    sketchRef.current = null;
  }, []);

  // Tear down any in-progress sketch if the control unmounts (e.g. nav away).
  useEffect(() => cleanupSketch, [cleanupSketch]);

  // React to the selector flipping the workflow on/off.
  useEffect(() => {
    if (isCreating) {
      setMode('form');
      setError(null);
    } else {
      cleanupSketch();
      setName('');
    }
  }, [isCreating, cleanupSketch]);

  const reset = useCallback(() => {
    cleanupSketch();
    setIsCreating(false);
    setName('');
    setError(null);
    setMode('form');
  }, [cleanupSketch, setIsCreating]);

  const save = useCallback(
    async (geometry: GeometryType | null) => {
      setMode('saving');
      try {
        const view = viewRef.current;
        if (!view?.map) throw new Error('Map not ready');
        if (!geometry) throw new Error('No geometry drawn');

        const layer = findIncidentSublayers(view.map)[kind];
        if (!layer) throw new Error(`Incident ${kind} layer not found`);

        const id = nextIncidentId(incidents.map((i) => i.incidentId));
        const { default: Graphic } = await import('@arcgis/core/Graphic');

        const attributes: Record<string, unknown> = {
          incidentid: id,
          incidentnm: name.trim(),
        };
        // Report Time = incident start (drives the history slider's lower bound).
        const hasStartField = layer.fields?.some(
          (f) => f.name.toLowerCase() === INCIDENT_START_FIELD,
        );
        if (hasStartField) attributes[INCIDENT_START_FIELD] = Date.now();
        // Only set incidenttp on a layer that actually has the field.
        const hasTypeField = layer.fields?.some(
          (f) => f.name.toLowerCase() === INCIDENT_TYPE_FIELD,
        );
        if (hasTypeField && typeCode !== null) attributes[INCIDENT_TYPE_FIELD] = typeCode;

        const result = await layer.applyEdits({
          addFeatures: [new Graphic({ geometry, attributes })],
        });
        const added = result.addFeatureResults?.[0];
        if (added?.error) throw new Error(added.error.message);

        // Lifeline status is community-wide now — creating an incident does NOT
        // seed or touch it. Incidents only window the history view.
        await queryClient.invalidateQueries({ queryKey: ['incidents'] });

        cleanupSketch();
        setActiveIncidentId(id);
        setIsCreating(false);
        setName('');
        setMode('form');
      } catch (e) {
        cleanupSketch();
        setError(e instanceof Error ? e.message : t('incident.create.error'));
        setMode('form');
      }
    },
    [viewRef, kind, typeCode, incidents, name, queryClient, setActiveIncidentId, setIsCreating, cleanupSketch, t],
  );

  const startDraw = useCallback(async () => {
    const view = viewRef.current;
    if (!view?.map || name.trim() === '') {
      setError(t('incident.create.nameRequired'));
      return;
    }
    setError(null);
    setMode('sketching');
    sketchRef.current = await startIncidentSketch(view, kind, (geometry) => void save(geometry));
  }, [viewRef, name, kind, save, t]);

  if (!isReady || !isCreating) return null;

  // ── Sketching: hint banner ──
  if (mode === 'sketching') {
    return (
      <div className={styles.banner} role="status">
        <span>{t('incident.create.drawHint', { type: t(`incident.create.type.${kind}`) })}</span>
        <button type="button" className={styles.cancelBtn} onClick={reset}>
          {t('incident.create.cancel')}
        </button>
      </div>
    );
  }

  // ── Form / saving ──
  const saving = mode === 'saving';
  return (
    <div className={styles.panel} role="dialog" aria-label={t('incident.create.title')}>
      <h2 className={styles.title}>{t('incident.create.title')}</h2>

      <label className={styles.label} htmlFor="incident-name">
        {t('incident.create.nameLabel')}
      </label>
      <input
        id="incident-name"
        className={styles.input}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t('incident.create.namePlaceholder')}
        disabled={saving}
        autoFocus
      />

      <span className={styles.label}>{t('incident.create.typeLabel')}</span>
      <div className={styles.segmented}>
        {KINDS.map((k) => (
          <button
            key={k}
            type="button"
            className={`${styles.segment}${kind === k ? ` ${styles.segmentActive}` : ''}`}
            aria-pressed={kind === k}
            disabled={saving}
            onClick={() => setKind(k)}
          >
            {t(`incident.create.type.${k}`)}
          </button>
        ))}
      </div>

      {types.length > 0 && (
        <>
          <span className={styles.label}>{t('incident.create.incidentTypeLabel')}</span>
          <div className={styles.typeList}>
            {types.map((it) => (
              <button
                key={String(it.code)}
                type="button"
                className={`${styles.typeOption}${typeCode === it.code ? ` ${styles.typeOptionActive}` : ''}`}
                aria-pressed={typeCode === it.code}
                disabled={saving}
                onClick={() => setTypeCode(it.code)}
              >
                <IncidentTypePreview symbol={it.symbol} />
                <span className={styles.typeOptionLabel}>{it.label}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.actions}>
        <button type="button" className={styles.cancelBtn} onClick={reset} disabled={saving}>
          {t('incident.create.cancel')}
        </button>
        <button type="button" className={styles.primaryBtn} onClick={startDraw} disabled={saving}>
          {saving ? t('incident.create.saving') : t('incident.create.start')}
        </button>
      </div>
    </div>
  );
}
