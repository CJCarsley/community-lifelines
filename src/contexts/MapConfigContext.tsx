import React, { createContext, useCallback, useContext, useState } from 'react';

const INITIAL_WEB_MAP_ID = 'PLACEHOLDER_ID';
const INITIAL_FEATURE_SERVICE_URL = 'PLACEHOLDER_URL';

interface MapConfigContextValue {
  webMapId: string;
  featureServiceUrl: string;
  mapVersion: number;
  setMapConfig: (webMapId: string, featureServiceUrl: string) => void;
}

const MapConfigContext = createContext<MapConfigContextValue | null>(null);

export function MapConfigProvider({ children }: { children: React.ReactNode }) {
  const [webMapId, setWebMapId] = useState(INITIAL_WEB_MAP_ID);
  const [featureServiceUrl, setFeatureServiceUrl] = useState(INITIAL_FEATURE_SERVICE_URL);
  const [mapVersion, setMapVersion] = useState(0);

  const setMapConfig = useCallback((nextWebMapId: string, nextFeatureUrl: string) => {
    setWebMapId(nextWebMapId);
    setFeatureServiceUrl(nextFeatureUrl);
    setMapVersion((v) => v + 1);
  }, []);

  return (
    <MapConfigContext.Provider value={{ webMapId, featureServiceUrl, mapVersion, setMapConfig }}>
      {children}
    </MapConfigContext.Provider>
  );
}

export function useMapConfig(): MapConfigContextValue {
  const ctx = useContext(MapConfigContext);
  if (!ctx) throw new Error('useMapConfig must be used within MapConfigProvider');
  return ctx;
}
