import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type MapViewType from '@arcgis/core/views/MapView';
import { MapViewContext } from './useMapView';
import styles from './MapView.module.css';

const WEB_MAP_ID = 'PLACEHOLDER_ID';

export default function MapView({ children }: { children?: ReactNode }) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<MapViewType | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!containerRef.current) return;

    let cancelled = false;

    void Promise.all([
      import('@arcgis/core/WebMap'),
      import('@arcgis/core/views/MapView'),
      import('@arcgis/core/widgets/ScaleBar'),
    ]).then(([
      { default: WebMap },
      { default: ArcGISMapView },
      { default: ScaleBar },
    ]) => {
      if (cancelled || !containerRef.current) return;

      const map = new WebMap({ portalItem: { id: WEB_MAP_ID } });

      const view = new ArcGISMapView({
        container: containerRef.current,
        map,
        center: [-98.5795, 39.8283],
        zoom: 4,
        ui: { components: ['zoom', 'attribution'] },
      });

      view.ui.add(new ScaleBar({ view }), 'bottom-left');
      viewRef.current = view;

      void view.when(() => {
        if (!cancelled) setIsLoading(false);
      });
    });

    return () => {
      cancelled = true;
      viewRef.current?.destroy();
      viewRef.current = null;
    };
  }, []);

  return (
    <MapViewContext.Provider value={viewRef}>
      <div className={styles.wrapper}>
        {isLoading && <div className={styles.skeleton} aria-hidden="true" />}
        <div
          ref={containerRef}
          className={styles.container}
          role="application"
          aria-label={t('map.ariaLabel')}
        />
        {!isLoading && children}
      </div>
    </MapViewContext.Provider>
  );
}
