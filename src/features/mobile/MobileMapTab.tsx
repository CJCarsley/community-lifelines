import { useState } from 'react';
import MapView from '@features/map/MapView';
import { MapViewProvider } from '@features/map/useMapView';
import IncidentsLayer from '@features/incidents/IncidentsLayer';
import MapToolbar from '@features/map/MapToolbar';
import IncidentCreateControl from '@features/incidents/IncidentCreateControl';
import IncidentFeatureToolbar from '@features/incidents/IncidentFeatureToolbar';
import { useMapConfig } from '@contexts/MapConfigContext';
import type { IncidentRecord } from '@types';
import styles from './MobileMapTab.module.css';

interface MobileMapTabProps {
  activeIncident: IncidentRecord | null;
  isAdmin: boolean;
}

// Full-screen mobile map — same components desktop uses (incident-filtered
// layers, toolbar, and the admin create/feature tools).
export default function MobileMapTab({ activeIncident, isAdmin }: MobileMapTabProps) {
  const { mapVersion } = useMapConfig();
  const [incidentsVisible, setIncidentsVisible] = useState(true);

  return (
    <div className={styles.mapWrap}>
      <MapViewProvider key={mapVersion}>
        <MapView>
          {activeIncident && (
            <IncidentsLayer
              activeView="map"
              incidentId={activeIncident.incidentId}
              visible={incidentsVisible}
            />
          )}
          <MapToolbar
            incidentsVisible={incidentsVisible}
            onToggleIncidents={() => setIncidentsVisible((v) => !v)}
          />
          {isAdmin && <IncidentCreateControl />}
          {isAdmin && <IncidentFeatureToolbar />}
        </MapView>
      </MapViewProvider>
    </div>
  );
}
