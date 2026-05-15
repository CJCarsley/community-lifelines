# Claude Reference Notes — Community Lifelines Dashboard

---

## 2026-05-15 — Official Lifeline Graphics Overhaul

**What changed**: Replaced the LifelineStrip pill buttons AND the left-side icon rail with a single top-of-page strip of 8 large (~88px) official Nebraska lifeline graphics, halo color driven by status.

**Status model expansion** (4 → 6): `LifelineStatus` is now `unknown | stable | minor | moderate | major | extreme`, matching the Nebraska enhanced lifeline structure (see `lifeline_legend.pdf`). Halo colors map: unknown→GRAY, stable→GREEN, minor→YELLOW, moderate→ORANGE, major→RED, extreme→PURPLE. The `NONE` (haloless) variant is used when no event is active.

**Shared status palette** (duplicated inline in 4 files — App, LifelineDrawer, IncidentsLayer, MapToolbar; kept in sync manually):
```
unknown:  #888780   stable:   #2E8B47   minor: #EAB308
moderate: #EF7C1F   major:    #E24B4A   extreme: #7B2D8E
```

**deriveEventSeverity** is now worst-of: extreme→catastrophic, major→high, moderate→moderate, else→low.

**Layout grid** simplified: shell is now `grid-template-columns: 1fr` and `grid-template-rows: 48px auto 1fr` (top bar / strip / content). The 56px left rail column is gone.

**Graphics location**: `public/graphics/` — Vite serves at `/graphics/{stem}-{COLOR}.png`. The `LIFELINE_ID → filename stem` map lives in `LifelineStrip.tsx`:
```
safety-security        → SafetySecurity
food-hydration-shelter → food-hydration-shelter  (already kebab)
health-medical         → HealthMedical
water-systems          → Water-Systems
energy                 → Energy
communications         → Communications
transportation         → Transportation
hazardous-material     → HazMat
```

**LifelineStrip API change**: now requires `buttonRefs: Record<LifelineId, RefObject>` prop (refs lifted to App for drawer-close focus return). Tile clicks toggle (click active tile = back to map). Still `role="tablist"` + `role="tab"` per the existing ARIA pattern.

**Removed**: `src/components/icons/` (9 SVG components no longer referenced). The `nav.mapLabel` and `nav.lifelineRail` i18n keys are now unused but left in place.

**MapToolbar legend**: StatusSwatch glyphs expanded from 4 to 6 (added a dot for `minor` and a circled-X for `extreme`). All 6 levels are visually distinguishable without color.

**Known pre-existing TS error** (not from this overhaul): `EventSelector.tsx:38` — `React.Key` vs `@react-types` `Key` (bigint). Should be fixed separately.

---

## 2026-05-13 — Project Initialization & Phase 2–3 Shell

### Project Overview

Crisis management dashboard for displaying FEMA Community Lifeline status during active events.
Built for Douglas County / DCHD. React 18 + TypeScript + Vite + ArcGIS Maps SDK 4.x + AWS Amplify Gen 2.

**Live dev server**: `npm run dev` → http://localhost:5175 (5173/5174 were already in use on this machine)
**GitHub repo**: not yet connected

---

### Stack

| Layer | Choice |
|---|---|
| UI | React 18, TypeScript 5.6, Vite 5 |
| Map | @arcgis/core 4.x (ESM, lazy-loaded) |
| Auth | aws-amplify 6.x + @aws-amplify/ui-react |
| Data fetching | @tanstack/react-query 5.x |
| i18n | i18next 23 + react-i18next 14 (EN only for now) |
| A11y components | @react-aria/button, @react-aria/dialog, @react-aria/listbox, @react-aria/focus |
| A11y testing | @axe-core/react (dev only, dynamic import) |
| Styles | CSS Modules per component |

---

### Path Aliases

Configured in both `tsconfig.app.json` (paths) and `vite.config.ts` (resolve.alias):

| Alias | Resolves to |
|---|---|
| `@components` | `src/components` |
| `@features` | `src/features` |
| `@hooks` | `src/hooks` |
| `@types` | `src/types/index.ts` (non-wildcard — see gotcha below) |
| `@utils` | `src/utils` |
| `@i18n` | `src/i18n` |

**Gotcha — `@types` alias**: TypeScript treats any import matching `@types/<name>` (with a slash) as
a reference to `node_modules/@types` declaration packages (TS6137 error). The fix is to make it a
**non-wildcard** alias: `"@types": ["src/types/index"]` in tsconfig, and import as
`import type { Foo } from '@types'` (no slash). If types are ever split into multiple files, rename
this alias to `@t/*` or `@apptypes/*`.

---

### amplify.yml / Build Notes

Amplify not yet configured for this project. When connecting:
- Reference the warming-cooling-centers project's amplify.yml as a template
- Key flags: `--legacy-peer-deps` on all `npm install` calls (peer dep conflicts exist)
- NODE_OPTIONS=--max-old-space-size=7168 needed for @arcgis/core build (heap exhaustion)

---

### Key Architectural Decisions

**ArcGIS module loading**: All `@arcgis/core` imports are dynamic (`import('...')`) inside `useEffect`.
Zero ArcGIS code in the initial bundle. The three modules loaded for the map are:
`@arcgis/core/Map`, `@arcgis/core/views/MapView`, `@arcgis/core/widgets/ScaleBar`.

**Map config**: basemap `gray-vector`, CONUS center `[-98.5795, 39.8283]`, zoom 4.
UI components trimmed to `['zoom', 'attribution']` only. ScaleBar added bottom-left.

**MapView instance sharing**: `useMapView()` hook (from `src/features/map/useMapView.ts`) exposes
the ArcGIS `MapViewType` instance via a `MutableRefObject`. The context provider lives inside
`MapView.tsx`. Future features that need to add graphics/layers to the map call `useMapView()` from
anywhere inside the `<MapView />` tree. If panels outside that tree need map access, lift the provider
into App.tsx.

**ARIA pattern for icon rail**: `role="tablist"` on the `<nav>`, `role="tab"` + `aria-pressed` on
each button (user-specified pattern). Uses `useButton` from `@react-aria/button` for press handling
and `FocusRing` from `@react-aria/focus` for keyboard focus ring (class: `styles.focusRing`).

**Status dot colors** (FEMA-aligned, colorblind-safe):
- operational: `#3B8BD4` (blue)
- degraded: `#EF9F27` (amber)
- critical: `#E24B4A` (red)
- unknown: `#888780` (gray)

**Severity badge colors** (for active crisis event in top bar):
- low: `#4caf50` / moderate: `#EF9F27` / high: `#E24B4A` / catastrophic: `#7B0000`

**IncidentsLayer visibility pattern**: `visible` prop is NOT in the main effect deps. A separate `useEffect([visible])` mutates `layerRef.current.visible` without destroying/re-creating the graphics. `layerRef` (useRef) is shared between both effects.

**Incident marker shapes** (SEVERITY_MARKER_STYLES): low=circle, moderate=diamond, high=square, catastrophic=x. Shape + color together satisfy "never rely on color alone". The legend SVGs in MapToolbar match these ArcGIS `SimpleMarkerSymbol.style` values exactly.

**MapToolbar basemap cycle**: `(view.map as unknown as { basemap: string }).basemap = 'satellite'` — cast needed since ArcGIS TypeScript types narrow `basemap` to `Basemap` object, but the API accepts string portal IDs at runtime. Three basemaps: gray-vector, satellite, streets.

**EventSelector dropdown positioning**: `.shell { overflow: hidden }` clips `position: absolute` children. EventSelector uses `position: fixed` with coordinates from `triggerRef.current.getBoundingClientRect()` set on open. The `CrisisEventProvider` lives in `main.tsx` inside `QueryClientProvider` (because it calls `useCrisisEvents`) and outside `Suspense` (because it doesn't use ArcGIS).

**Top bar event state**: now driven by `CrisisEventContext` (wraps `useCrisisEvents`, auto-selects `events[0]`, exposes `setActiveEventId`). `useCrisisEventContext()` replaces direct `useCrisisEvents()` usage in App. `Item` for `useListState` imported from `react-stately` umbrella package (not `@react-stately/collections` which isn't directly installed). Severity is derived
from lifeline statuses via `deriveEventSeverity()` (3+ critical = catastrophic, 1+ critical = high,
any degraded = moderate, else low). MapView is always rendered in the content area (not gated on
`activeView === 'map'`) so IncidentsLayer can react to activeView changes and apply the lifeline filter.

---

### TypeScript Config

Two tsconfig targets (project references):
- `tsconfig.app.json` — `src/` (React app, `moduleResolution: bundler`, `jsx: react-jsx`)
- `tsconfig.node.json` — `vite.config.ts` only (`types: ["node"]` for path/url modules)

`noUnusedLocals`, `noUnusedParameters`, `strict` all enabled. `skipLibCheck: true` (ArcGIS types
have known issues in strict mode).

---

### File Map (everything created so far)

```
src/
  types/
    index.ts              — LifelineId, LifelineStatus, Lifeline, Incident,
                            CrisisEvent, AuthUser, UserRole, ApiResponse<T>

  hooks/
    useCrisisEvents.ts    — useQuery GET /api/events → CrisisEvent[]; 60s refetch
    useCrisisEvent.ts     — useQuery GET /api/events/{id}; enabled when id truthy
                            exports crisisEventQueryKey(id) for invalidation
    useUpdateLifelineStatus.ts — useMutation PATCH /api/events/{eid}/lifelines/{lid}
                            body: { status, notes? }; invalidates useCrisisEvent on success

  utils/
    apiClient.ts          — apiGet<T>(path), apiPatch<T>(path, data); Amplify v6
                            REST (aws-amplify/api); auth via fetchAuthSession idToken;
                            normalizes errors to ApiClientError(status, message)
    mockData.ts           — USE_MOCK_DATA=true flag; MOCK_EVENTS (hurricane + wildfire),
                            getMockEvent(id); bypasses real API in all hooks when true

  contexts/
    CrisisEventContext.tsx — CrisisEventProvider wraps QueryClientProvider children;
                            wraps useCrisisEvents(); auto-selects events[0] on load.
                            useCrisisEventContext() → { events, activeEvent,
                            activeEventId, setActiveEventId, isLoading }

  components/
    EventSelector.tsx     — Top-bar dropdown: trigger button (28-char truncated name
                            + chevron) + fixed-position listbox. useListState (react-stately),
                            useListBox/useOption (@react-aria/listbox), useOverlay +
                            DismissButton (@react-aria/overlays), FocusScope restoreFocus.
                            position:fixed anchored via getBoundingClientRect() to escape
                            shell overflow:hidden. Calls useCrisisEventContext().
    EventSelector.module.css
    icons/
      index.tsx           — 9 SVG icon components (fill-based except WaveIcon
                            which uses stroke): MapOverviewIcon, ShieldIcon,
                            DropletIcon, CrossIcon, LightningIcon, WifiIcon,
                            TruckIcon, WarningIcon, WaveIcon

  features/
    map/
      MapView.tsx         — ArcGIS map wrapper; lazy-loads all @arcgis/core
                            modules in useEffect; provides MapViewContext;
                            gray pulse skeleton while loading; destroyed on unmount
                            accepts children?: ReactNode, rendered after !isLoading
      MapView.module.css
      useMapView.ts       — MapViewContext + useMapView() hook
      MapToolbar.tsx      — Floating top-right widget (position:absolute 12px inset).
                            3 buttons: basemap cycle (tooltip=current name), incidents
                            toggle (eye icon), legend open. LegendPanel subcomponent:
                            position:absolute right-0 top-0 bottom-0 280px, useDialog
                            + useOverlay + FocusScope contain+restoreFocus, DismissButton.
                            Legend shows severity shapes (circle/diamond/square/x) +
                            status swatches (circle + embedded icon per status).
      MapToolbar.module.css

    lifelines/
      LifelineStrip.tsx     — role="toolbar"; 8 pill buttons (shortLabel + status text + dot);
                              active pill: statusColor@15% background + solid border (inline style).
                              Narrow (<900px): text hidden via CSS media query; tooltip via
                              CSS ::after + data-tooltip attr. aria-describedby per pill → srOnly
                              span with full label + status. Grid placement: .stripRow from
                              App.module.css (grid-column: 2; grid-row: 2).
      LifelineStrip.module.css

      LifelineDrawer.tsx    — aside role="complementary"; slides in from right (320px, position:absolute
                              within .content); CSS @keyframes slideIn. Status segmented control via
                              useRadioGroup+useRadio (@react-aria/radio) + useRadioGroupState
                              (@react-stately/radio). Notes textarea with 800ms debounce →
                              useUpdateLifelineStatus. Locate-on-map calls view.goTo(). Focus sent to
                              h2 on mount; Escape fires onClose → App returns focus to trigger button.
                              canEdit = user.roles intersects ['Admin','Editor','LifelineManager'].
      LifelineDrawer.module.css

    incidents/
      IncidentsLayer.tsx  — renders null; manages a GraphicsLayer on the ArcGIS map.
                            Per incident: circle SimpleMarkerSymbol (color by severity,
                            size 12, white outline 1.5px, 30% alpha when filtered out)
                            + geodesicBuffer impact zone (SimpleFillSymbol, 15% fill,
                            60% dashed outline). PopupTemplate per marker (severity badge,
                            lifeline status chips, timestamp, description). ArcGIS popup
                            provides focus trap and Escape-to-close natively.
                            Effect re-runs on incidents/activeView/lifelines change;
                            destroyed=flag prevents stale async callbacks after cleanup.

  i18n/
    index.ts              — i18next init (side-effect import in main.tsx)
    locales/
      en.json             — all UI strings (EN only)

  App.tsx                 — Shell: top bar (48px) + icon rail (56px) + content area
  App.module.css          — Grid layout, dark navy theme (#1b2a4a / #162238)
  main.tsx                — ArcGIS CSS import + axe-core (dev only) + Suspense
  vite-env.d.ts           — /// <reference types="vite/client" />

vite.config.ts            — path aliases via resolve()
tsconfig.json             — project references root
tsconfig.app.json         — app compiler options + path aliases
tsconfig.node.json        — vite.config.ts compiler options
index.html                — <div id="root">, title "Lifeline Dashboard"
```

---

### i18n Key Structure (en.json)

Top-level namespaces added so far:
`app`, `common`, `nav`, `topBar`, `event.severity`, `lifeline.<id>.label`,
`map`, `lifelines` (legacy flat keys), `incidents`, `auth`

Lifeline label keys follow the pattern `lifeline.<LifelineId>.label`:
```
lifeline.safety-security.label
lifeline.food-hydration-shelter.label
lifeline.health-medical.label
lifeline.water-systems.label
lifeline.energy.label
lifeline.communications.label
lifeline.transportation.label
lifeline.hazardous-material.label
```

---

### FEMA Lifeline IDs (LifelineId type)

```
safety-security | food-hydration-shelter | health-medical | water-systems
energy | communications | transportation | hazardous-material
```

---

### Phase Completion Status

- [x] Phase 1 — Project scaffold, dependencies, path aliases, i18n, axe-core
- [x] Phase 2.1 — App shell (top bar, icon rail, content area, activeView state)
- [x] Phase 3.1 — MapView component (lazy ArcGIS loading, skeleton, useMapView hook)
- [x] Phase 3.2 — IncidentsLayer (GraphicsLayer, markers, impact zones, popups, lifeline filter/fade)
- [x] Phase 3.3 — MapToolbar (basemap cycle, incidents toggle, legend dialog, shape+color accessibility)
- [x] Phase 4.1 — LifelineDrawer (slide-in panel, status radio group, notes autosave, incident list, locate-on-map)
- [x] Phase 2.2 — EventSelector (top-bar dropdown, CrisisEventContext, useListBox, useOverlay, fixed-position)
- [x] Phase 4.2 — LifelineStrip (36px status strip, pill buttons, narrow-viewport tooltip, aria-describedby)
- [ ] Phase 4.2 — Auth (Cognito + Okta federation)
- [x] Phase 5.1 — API hooks + mock data (useCrisisEvents, useCrisisEvent, useUpdateLifelineStatus, apiClient, mockData)
- [ ] Phase 6 — Incident markers + impact zones on map
