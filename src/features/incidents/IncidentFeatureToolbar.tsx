import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { useMapView } from '@features/map/useMapView';
import { useIncidentContext } from '@contexts/IncidentContext';
import { findIncidentSublayers, type IncidentGeometryKind } from './incidentLayers';
import { startIncidentSketch, type SketchSession } from './incidentSketch';
import { INCIDENT_TYPE_FIELD } from './useIncidentTypes';
import type GeometryType from '@arcgis/core/geometry/Geometry';
import type { IncidentSublayers } from './incidentLayers';
import styles from './IncidentFeatureToolbar.module.css';

type Mode = 'idle' | 'sketching' | 'saving';

const KINDS: IncidentGeometryKind[] = ['point', 'line', 'area'];

const esc = (s: string) => s.replace(/'/g, "''");

// Looks up the incident's incidenttp from whichever sublayer has both the field
// and a feature for it, so an appended geometry inherits the type symbol.
async function fetchIncidentType(
  sublayers: IncidentSublayers,
  incidentId: string,
): Promise<string | number | null> {
  for (const kind of KINDS) {
    const layer = sublayers[kind];
    if (!layer) continue;
    if (!layer.fields?.some((f) => f.name.toLowerCase() === INCIDENT_TYPE_FIELD)) continue;
    const res = await layer.queryFeatures({
      where: `incidentid = '${esc(incidentId)}'`,
      outFields: [INCIDENT_TYPE_FIELD],
      returnGeometry: false,
      num: 1,
    });
    const v = res.features[0]?.attributes?.[INCIDENT_TYPE_FIELD];
    if (v != null) return v as string | number;
  }
  return null;
}

export default function IncidentFeatureToolbar() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { ref: viewRef, isReady } = useMapView();
  const { activeIncident, isCreating } = useIncidentContext();

  const [mode, setMode] = useState<Mode>('idle');
  const [activeKind, setActiveKind] = useState<IncidentGeometryKind>('point');
  const [error, setError] = useState<string | null>(null);

  const sketchRef = useRef<SketchSession | null>(null);

  const cleanupSketch = useCallback(() => {
    sketchRef.current?.cancel();
    sketchRef.current = null;
  }, []);

  useEffect(() => cleanupSketch, [cleanupSketch]);

  // Abort any in-progress sketch if the incident changes or create mode opens.
  const incidentId = activeIncident?.incidentId ?? null;
  useEffect(() => {
    cleanupSketch();
    setMode('idle');
    setError(null);
  }, [incidentId, isCreating, cleanupSketch]);

  const save = useCallback(
    async (geometry: GeometryType | null, kind: IncidentGeometryKind) => {
      setMode('saving');
      try {
        const view = viewRef.current;
        if (!view?.map || !activeIncident) throw new Error('Map not ready');
        if (!geometry) throw new Error('No geometry drawn');

        const sublayers = findIncidentSublayers(view.map);
        const layer = sublayers[kind];
        if (!layer) throw new Error(`Incident ${kind} layer not found`);

        const attributes: Record<string, unknown> = {
          incidentid: activeIncident.incidentId,
          incidentnm: activeIncident.name,
        };
        const hasType = layer.fields?.some(
          (f) => f.name.toLowerCase() === INCIDENT_TYPE_FIELD,
        );
        if (hasType) {
          const type = await fetchIncidentType(sublayers, activeIncident.incidentId);
          if (type !== null) attributes[INCIDENT_TYPE_FIELD] = type;
        }

        const { default: Graphic } = await import('@arcgis/core/Graphic');
        const result = await layer.applyEdits({
          addFeatures: [new Graphic({ geometry, attributes })],
        });
        const added = result.addFeatureResults?.[0];
        if (added?.error) throw new Error(added.error.message);

        // Geometry kinds for this incident may have changed → refresh the list.
        void queryClient.invalidateQueries({ queryKey: ['incidents'] });

        cleanupSketch();
        setMode('idle');
      } catch (e) {
        cleanupSketch();
        setError(e instanceof Error ? e.message : t('incident.add.error'));
        setMode('idle');
      }
    },
    [viewRef, activeIncident, queryClient, cleanupSketch, t],
  );

  const startAdd = useCallback(
    async (kind: IncidentGeometryKind) => {
      const view = viewRef.current;
      if (!view?.map) return;
      setError(null);
      setActiveKind(kind);
      setMode('sketching');
      sketchRef.current = await startIncidentSketch(view, kind, (geometry) =>
        void save(geometry, kind),
      );
    },
    [viewRef, save],
  );

  const cancel = useCallback(() => {
    cleanupSketch();
    setMode('idle');
  }, [cleanupSketch]);

  if (!isReady || !activeIncident || isCreating) return null;

  if (mode === 'sketching') {
    return (
      <div className={styles.banner} role="status">
        <span>
          {t('incident.add.hint', {
            type: t(`incident.create.type.${activeKind}`),
            name: activeIncident.name,
          })}
        </span>
        <button type="button" className={styles.cancelBtn} onClick={cancel}>
          {t('incident.add.cancel')}
        </button>
      </div>
    );
  }

  const saving = mode === 'saving';
  return (
    <div className={styles.toolbar} role="toolbar" aria-label={t('incident.add.label')}>
      <span className={styles.label}>{t('incident.add.label')}</span>
      {KINDS.map((k) => (
        <button
          key={k}
          type="button"
          className={styles.addBtn}
          disabled={saving}
          onClick={() => void startAdd(k)}
        >
          + {t(`incident.create.type.${k}`)}
        </button>
      ))}
      {error && <span className={styles.error}>{error}</span>}
    </div>
  );
}
