import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { generateClient } from 'aws-amplify/data';
import { fetchAuthSession } from 'aws-amplify/auth';
import type { Schema } from '../../amplify/data/resource';

const INITIAL_PORTAL_URL = 'https://www.arcgis.com';
const INITIAL_WEB_MAP_ID = '';

// Single shared config record. Every client reads this id; admins overwrite it.
const SINGLETON_ID = 'global';

const client = generateClient<Schema>();

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
  /** Persists to the shared AppConfig record. Rejects if the user isn't an Admin. */
  setMapConfig: (
    portalUrl: string,
    webMapId: string,
    resolved?: ResolvedLayerIds | null,
  ) => Promise<void>;
  setResolvedLayerIds: (submissionsLayerId: string, statusTableId: string) => void;
}

const MapConfigContext = createContext<MapConfigContextValue | null>(null);

export function MapConfigProvider({ children }: { children: React.ReactNode }) {
  const [portalUrl, setPortalUrl] = useState(INITIAL_PORTAL_URL);
  const [webMapId, setWebMapId] = useState(INITIAL_WEB_MAP_ID);
  const [submissionsLayerId, setSubmissionsLayerId] = useState<string | null>(null);
  const [statusTableId, setStatusTableId] = useState<string | null>(null);
  const [mapVersion, setMapVersion] = useState(0);

  // Hydrate the shared config on mount (any signed-in user may read it).
  useEffect(() => {
    let active = true;
    void client.models.AppConfig.get({ id: SINGLETON_ID })
      .then(({ data }) => {
        if (!active || !data) return;
        setPortalUrl(data.portalUrl);
        setWebMapId(data.webMapId);
        setSubmissionsLayerId(data.submissionsLayerId ?? null);
        setStatusTableId(data.statusTableId ?? null);
        setMapVersion((v) => v + 1);
      })
      .catch(() => {
        /* leave defaults if unreadable */
      });
    return () => {
      active = false;
    };
  }, []);

  const setMapConfig = useCallback(
    async (
      nextPortalUrl: string,
      nextWebMapId: string,
      resolved?: ResolvedLayerIds | null,
    ) => {
      const session = await fetchAuthSession();
      const email = session.tokens?.idToken?.payload.email;
      const input = {
        id: SINGLETON_ID,
        portalUrl: nextPortalUrl,
        webMapId: nextWebMapId,
        submissionsLayerId: resolved?.submissionsLayerId ?? null,
        statusTableId: resolved?.statusTableId ?? null,
        updatedBy: typeof email === 'string' ? email : null,
      };

      // Upsert the singleton. AppSync rejects this for non-Admins.
      const { data: existing } = await client.models.AppConfig.get({ id: SINGLETON_ID });
      const { errors } = existing
        ? await client.models.AppConfig.update(input)
        : await client.models.AppConfig.create(input);
      if (errors?.length) throw new Error(errors[0].message);

      // Apply locally only after the write succeeds.
      setPortalUrl(nextPortalUrl);
      setWebMapId(nextWebMapId);
      setSubmissionsLayerId(resolved?.submissionsLayerId ?? null);
      setStatusTableId(resolved?.statusTableId ?? null);
      setMapVersion((v) => v + 1);
    },
    [],
  );

  // Layer ids discovered at map-load time — session-local, not persisted
  // (writing requires Admin; everyone can rediscover from the web map).
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
