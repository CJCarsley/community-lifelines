import { StrictMode, Suspense } from 'react';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Authenticator } from '@aws-amplify/ui-react';
import { signInWithRedirect } from 'aws-amplify/auth';
import '@aws-amplify/ui-react/styles.css';
import './amplifyConfig'; // side-effect: Amplify.configure
import { IncidentProvider } from './contexts/IncidentContext';
import { MapConfigProvider } from './contexts/MapConfigContext';
import ChatWindow from './features/incidents/ChatWindow';
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

// Pop-out chat window: same origin (shares the Cognito session) + same AppSync
// API, so it auto-syncs with the docked box. Skips the map/incident providers.
const chatIncidentId = new URLSearchParams(window.location.search).get('chat');

ReactDOM.createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* hideSignUp: accounts are admin-provisioned (Cognito console), not self-serve */}
      {/* SignIn.Footer adds Okta SSO below the native email/password (break-glass) form */}
      <Authenticator
        hideSignUp
        components={{
          SignIn: {
            Footer() {
              return (
                <div style={{ padding: '0 1rem 1rem', textAlign: 'center' }}>
                  <button
                    type="button"
                    onClick={() =>
                      void signInWithRedirect({ provider: { custom: 'Okta' } })
                    }
                    style={{ width: '100%', padding: '0.5rem', cursor: 'pointer' }}
                  >
                    Sign in with Okta
                  </button>
                </div>
              );
            },
          },
        }}
      >
        {({ signOut }) =>
          chatIncidentId ? (
            <ChatWindow incidentId={chatIncidentId} />
          ) : (
            <MapConfigProvider>
              <IncidentProvider>
                <Suspense fallback={null}>
                  <App signOut={signOut} />
                </Suspense>
              </IncidentProvider>
            </MapConfigProvider>
          )
        }
      </Authenticator>
    </QueryClientProvider>
  </StrictMode>,
);
