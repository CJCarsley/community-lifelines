import { StrictMode, Suspense, useEffect, useState } from 'react';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Authenticator, useAuthenticator } from '@aws-amplify/ui-react';
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

// ── Okta auto-redirect (Desktop SSO / IWA) ──
// On-network domain users hit the site and get forwarded straight to Okta,
// which authenticates them silently off their Windows session — no login
// screen, no clicks. Escape hatches keep it from trapping anyone:
//   ?login=native  -> show the email/password form (break-glass / off-network)
//   REDIR_KEY       -> one-shot guard so a failed/cancelled Okta round-trip
//                      falls back to the native form instead of looping
//   SUPPRESS_KEY    -> set on sign-out so the post-logout landing doesn't
//                      immediately bounce back into Okta (IWA would re-auth)
const REDIR_KEY = 'cl-okta-redirecting';
const SUPPRESS_KEY = 'cl-okta-suppress';

function startOkta() {
  sessionStorage.removeItem(SUPPRESS_KEY);
  sessionStorage.removeItem(REDIR_KEY);
  void signInWithRedirect({ provider: { custom: 'Okta' } });
}

function Splash() {
  return (
    <div
      style={{
        display: 'grid',
        placeItems: 'center',
        minHeight: '100vh',
        font: '500 0.95rem system-ui, sans-serif',
        color: '#555',
      }}
    >
      Signing in…
    </div>
  );
}

// hideSignUp: accounts are admin-provisioned (Cognito console), not self-serve.
// SignIn.Footer adds Okta SSO below the native email/password (break-glass) form.
const authComponents = {
  SignIn: {
    Footer() {
      return (
        <div style={{ padding: '0 1rem 1rem', textAlign: 'center' }}>
          <button
            type="button"
            onClick={startOkta}
            style={{ width: '100%', padding: '0.5rem', cursor: 'pointer' }}
          >
            Sign in with Okta
          </button>
        </div>
      );
    },
  },
};

function Content({ signOut }: { signOut?: () => void }) {
  // Land on the native form after sign-out so IWA doesn't silently re-auth.
  const onSignOut = () => {
    sessionStorage.setItem(SUPPRESS_KEY, '1');
    signOut?.();
  };

  // Pop-out chat window: same origin (shares the Cognito session) + same AppSync
  // API, so it auto-syncs with the docked box. Skips the map/incident providers.
  const chatIncidentId = new URLSearchParams(window.location.search).get('chat');

  return chatIncidentId ? (
    <ChatWindow incidentId={chatIncidentId} />
  ) : (
    <MapConfigProvider>
      <IncidentProvider>
        <Suspense fallback={null}>
          <App signOut={onSignOut} />
        </Suspense>
      </IncidentProvider>
    </MapConfigProvider>
  );
}

function Gate() {
  const { authStatus } = useAuthenticator((c) => [c.authStatus]);
  const [redirecting, setRedirecting] = useState(false);

  const params = new URLSearchParams(window.location.search);
  const nativeLogin = params.get('login') === 'native';
  const isOAuthCallback = params.has('code') && params.has('state');
  const alreadyTried = sessionStorage.getItem(REDIR_KEY) === '1';
  const suppressed = sessionStorage.getItem(SUPPRESS_KEY) === '1';
  const willAutoRedirect =
    authStatus === 'unauthenticated' && !nativeLogin && !alreadyTried && !suppressed;

  useEffect(() => {
    if (authStatus === 'authenticated') {
      sessionStorage.removeItem(REDIR_KEY);
      sessionStorage.removeItem(SUPPRESS_KEY);
      return;
    }
    if (willAutoRedirect && !redirecting) {
      sessionStorage.setItem(REDIR_KEY, '1');
      setRedirecting(true);
      void signInWithRedirect({ provider: { custom: 'Okta' } }).catch(() => {
        // Okta unreachable/declined -> drop the guard so the render below
        // shows the native form as a fallback.
        sessionStorage.removeItem(REDIR_KEY);
        setRedirecting(false);
      });
    }
  }, [authStatus, willAutoRedirect, redirecting]);

  // Show the splash whenever we're resolving a session or bouncing to Okta —
  // never flash the native form during an auto-redirect or OAuth callback.
  const showSplash =
    authStatus !== 'authenticated' &&
    (authStatus === 'configuring' || redirecting || isOAuthCallback || willAutoRedirect);

  if (showSplash) return <Splash />;

  return (
    <Authenticator hideSignUp components={authComponents}>
      {({ signOut }) => <Content signOut={signOut} />}
    </Authenticator>
  );
}

ReactDOM.createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Authenticator.Provider>
        <Gate />
      </Authenticator.Provider>
    </QueryClientProvider>
  </StrictMode>,
);
