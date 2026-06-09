import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { useMapView } from '@features/map/useMapView';
import { useMapConfig } from '@contexts/MapConfigContext';
import { useIncidentContext } from '@contexts/IncidentContext';
import { loadStatusTable } from '@features/map/statusTable';
import { seedLifelineStatus } from '@features/map/seedLifelineStatus';
import {
  findIncidentSublayers,
  nextIncidentId,
  SKETCH_TOOL,
  type IncidentGeometryKind,
} from './incidentLayers';
import type GeometryType from '@arcgis/core/geometry/Geometry';
import type SketchViewModelType from '@arcgis/core/widgets/Sketch/SketchViewModel';
import type GraphicsLayerType from '@arcgis/core/layers/GraphicsLayer';
import styles from './IncidentCreateControl.module.css';

type Mode = 'form' | 'sketching' | 'saving';

const KINDS: IncidentGeometryKind[] = ['point', 'line', 'area'];

export default function IncidentCreateControl() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { ref: viewRef, isReady } = useMapView();
  const { portalUrl, webMapId, statusTableId } = useMapConfig();
  const { incidents, setActiveIncidentId, isCreating, setIsCreating } = useIncidentContext();

  const [mode, setMode] = useState<Mode>('form');
  const [name, setName] = useState('');
  const [kind, setKind] = useState<IncidentGeometryKind>('area');
  const [error, setError] = useState<string | null>(null);

  const sketchRef = useRef<{ vm: SketchViewModelType; layer: GraphicsLayerType } | null>(null);

  const cleanupSketch = useCallback(() => {
    const s = sketchRef.current;
    if (!s) return;
    try {
      s.vm.cancel();
      s.vm.destroy();
    } catch {
      /* ignore teardown races */
    }
    viewRef.current?.map?.remove(s.layer);
    sketchRef.current = null;
  }, [viewRef]);

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

        const result = await layer.applyEdits({
          addFeatures: [
            new Graphic({ geometry, attributes: { incidentid: id, incidentnm: name.trim() } }),
          ],
        });
        const added = result.addFeatureResults?.[0];
        if (added?.error) throw new Error(added.error.message);

        // Seed the 8 unknown lifeline_status rows for the new incident.
        const table = await loadStatusTable(portalUrl, webMapId, statusTableId);
        if (table) await seedLifelineStatus(table, id);

        await queryClient.invalidateQueries({ queryKey: ['incidents'] });
        void queryClient.invalidateQueries({ queryKey: ['lifelineStatuses'] });

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
    [viewRef, kind, incidents, name, portalUrl, webMapId, statusTableId, queryClient, setActiveIncidentId, setIsCreating, cleanupSketch, t],
  );

  const startDraw = useCallback(async () => {
    const view = viewRef.current;
    if (!view?.map || name.trim() === '') {
      setError(t('incident.create.nameRequired'));
      return;
    }
    setError(null);
    setMode('sketching');

    const [{ default: SketchViewModel }, { default: GraphicsLayer }] = await Promise.all([
      import('@arcgis/core/widgets/Sketch/SketchViewModel'),
      import('@arcgis/core/layers/GraphicsLayer'),
    ]);

    const layer = new GraphicsLayer({ listMode: 'hide' });
    view.map.add(layer);
    const vm = new SketchViewModel({ view, layer });
    sketchRef.current = { vm, layer };

    vm.on('create', (event) => {
      if (event.state === 'complete') void save(event.graphic.geometry ?? null);
      // 'cancel' leaves the control in 'sketching'; the user can re-finish or
      // press Cancel in the banner.
    });
    vm.create(SKETCH_TOOL[kind]);
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
