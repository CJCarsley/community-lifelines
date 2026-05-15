import { createContext, useContext } from 'react';
import type MapViewType from '@arcgis/core/views/MapView';

type MapViewRef = React.MutableRefObject<MapViewType | null>;

// Default ref used when no MapViewContext.Provider is in the tree
const defaultRef: MapViewRef = { current: null };

export const MapViewContext = createContext<MapViewRef>(defaultRef);

export function useMapView(): MapViewRef {
  return useContext(MapViewContext);
}
