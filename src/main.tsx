import { StrictMode, Suspense } from 'react';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import './amplifyConfig'; // side-effect: Amplify.configure
import { CrisisEventProvider } from './contexts/CrisisEventContext';
import { MapConfigProvider } from './contexts/MapConfigContext';
import '@arcgis/core/assets/esri/themes/light/main.css';
import './index.css';
import './i18n';
import App from './App';

const queryClient = new QueryClient();

if (import.meta.env.DEV) {
  void import('@axe-core/react').then(({ default: axe }) => {
    void axe(React, ReactDOM, 1000);
  });
}

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element not found');

ReactDOM.createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* hideSignUp: accounts are admin-provisioned (Cognito console), not self-serve */}
      <Authenticator hideSignUp>
        {({ signOut }) => (
          <MapConfigProvider>
            <CrisisEventProvider>
              <Suspense fallback={null}>
                <App signOut={signOut} />
              </Suspense>
            </CrisisEventProvider>
          </MapConfigProvider>
        )}
      </Authenticator>
    </QueryClientProvider>
  </StrictMode>,
);
