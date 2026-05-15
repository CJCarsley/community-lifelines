import React, { createContext, useContext, useEffect, useState } from 'react';
import { useCrisisEvents } from '@hooks/useCrisisEvents';
import type { CrisisEvent } from '@types';

interface CrisisEventContextValue {
  events: CrisisEvent[];
  activeEvent: CrisisEvent | null;
  activeEventId: string | null;
  setActiveEventId: (id: string) => void;
  isLoading: boolean;
}

const CrisisEventContext = createContext<CrisisEventContextValue | null>(null);

export function CrisisEventProvider({ children }: { children: React.ReactNode }) {
  const { events, isLoading } = useCrisisEvents();
  const [activeEventId, setActiveEventId] = useState<string | null>(null);

  useEffect(() => {
    if (events.length > 0 && activeEventId === null) {
      setActiveEventId(events[0].id);
    }
  }, [events, activeEventId]);

  const activeEvent = events.find((e) => e.id === activeEventId) ?? null;

  return (
    <CrisisEventContext.Provider
      value={{ events, activeEvent, activeEventId, setActiveEventId, isLoading }}
    >
      {children}
    </CrisisEventContext.Provider>
  );
}

export function useCrisisEventContext(): CrisisEventContextValue {
  const ctx = useContext(CrisisEventContext);
  if (!ctx) throw new Error('useCrisisEventContext must be used within CrisisEventProvider');
  return ctx;
}
