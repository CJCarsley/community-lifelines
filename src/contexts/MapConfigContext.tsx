import React, { createContext, useCallback, useContext, useState } from 'react';

const INITIAL_PORTAL_URL = 'https://www.arcgis.com';
const INITIAL_WEB_MAP_ID = '';

export interface ResolvedLayerIds {
  submissionsLayerId: string;
  statusTableId: string;
}

interface MapConfigContextValue {
  portalUrl: string;
  webMapId: string;
  submissionsLayerId: string | null;
  statusTableId: string | null;
  mapVersion: number;
  setMapConfig: (portalUrl: string, webMapId: string, resolved?: ResolvedLayerIds | null) => void;
  setResolvedLayerIds: (submissionsLayerId: string, statusTableId: string) => void;
}

const MapConfigContext = createContext<MapConfigContextValue | null>(null);

export function MapConfigProvider({ children }: { children: React.ReactNode }) {
  const [portalUrl, setPortalUrl] = useState(INITIAL_PORTAL_URL);
  const [webMapId, setWebMapId] = useState(INITIAL_WEB_MAP_ID);
  const [submissionsLayerId, setSubmissionsLayerId] = useState<string | null>(null);
  const [statusTableId, setStatusTableId] = useState<string | null>(null);
  const [mapVersion, setMapVersion] = useState(0);

  const setMapConfig = useCallback(
    (nextPortalUrl: string, nextWebMapId: string, resolved?: ResolvedLayerIds | null) => {
      setPortalUrl(nextPortalUrl);
      setWebMapId(nextWebMapId);
      setSubmissionsLayerId(resolved?.submissionsLayerId ?? null);
      setStatusTableId(resolved?.statusTableId ?? null);
      setMapVersion((v) => v + 1);
    },
    [],
  );

  const setResolvedLayerIds = useCallback((subId: string, tableId: string) => {
    setSubmissionsLayerId(subId);
    setStatusTableId(tableId);
  }, []);

  return (
    <MapConfigContext.Provider
      value={{
        portalUrl,
        webMapId,
        submissionsLayerId,
        statusTableId,
        mapVersion,
        setMapConfig,
        setResolvedLayerIds,
      }}
    >
      {children}
    </MapConfigContext.Provider>
  );
}

export function useMapConfig(): MapConfigContextValue {
  const ctx = useContext(MapConfigContext);
  if (!ctx) throw new Error('useMapConfig must be used within MapConfigProvider');
  return ctx;
}
