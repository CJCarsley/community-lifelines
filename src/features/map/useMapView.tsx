import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import type MapViewType from '@arcgis/core/views/MapView';

type MapViewRef = React.MutableRefObject<MapViewType | null>;

interface MapViewContextValue {
  ref: MapViewRef;
  isReady: boolean;
  setIsReady: (ready: boolean) => void;
}

const defaultRef: MapViewRef = { current: null };

export const MapViewContext = createContext<MapViewContextValue>({
  ref: defaultRef,
  isReady: false,
  setIsReady: () => {},
});

export function MapViewProvider({ children }: { children: ReactNode }) {
  const ref = useRef<MapViewType | null>(null);
  const [isReady, setIsReady] = useState(false);
  const value = useMemo(() => ({ ref, isReady, setIsReady }), [isReady]);
  return <MapViewContext.Provider value={value}>{children}</MapViewContext.Provider>;
}

export function useMapView(): MapViewContextValue {
  return useContext(MapViewContext);
}
