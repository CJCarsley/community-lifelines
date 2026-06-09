import React, { createContext, useContext, useEffect, useState } from 'react';
import { useIncidents } from '@hooks/useIncidents';
import type { IncidentRecord } from '@types';

interface IncidentContextValue {
  incidents: IncidentRecord[];
  activeIncident: IncidentRecord | null;
  activeIncidentId: string | null;
  setActiveIncidentId: (id: string) => void;
  isLoading: boolean;
}

const IncidentContext = createContext<IncidentContextValue | null>(null);

export function IncidentProvider({ children }: { children: React.ReactNode }) {
  const { incidents, isLoading } = useIncidents();
  const [activeIncidentId, setActiveIncidentId] = useState<string | null>(null);

  useEffect(() => {
    if (incidents.length > 0 && activeIncidentId === null) {
      setActiveIncidentId(incidents[0].incidentId);
    }
  }, [incidents, activeIncidentId]);

  const activeIncident =
    incidents.find((i) => i.incidentId === activeIncidentId) ?? null;

  return (
    <IncidentContext.Provider
      value={{ incidents, activeIncident, activeIncidentId, setActiveIncidentId, isLoading }}
    >
      {children}
    </IncidentContext.Provider>
  );
}

export function useIncidentContext(): IncidentContextValue {
  const ctx = useContext(IncidentContext);
  if (!ctx) throw new Error('useIncidentContext must be used within IncidentProvider');
  return ctx;
}
