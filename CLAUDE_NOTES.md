# Claude Reference Notes — Community Lifelines Dashboard

---

## 2026-05-27 — Side panel rewired to lifeline_submissions (desktop + mobile)

**What changed**: the "Affected Incidents" list in `LifelineDrawer` (desktop) and `MobileLifelinePage` (mobile) no longer reads from `activeEvent.incidents` (mockData). Both query the WebMap-owned `lifeline_submissions` FeatureLayer via a new react-query hook. Sorted by `submitted_at DESC`. Mock data still drives the lifeline tile statuses, status notes, and event selector — those rewires are downstream.

**New hook** `src/hooks/useLifelineSubmissions.ts`:
- `useLifelineSubmissions(lifelineId: LifelineId | null) → UseQueryResult<LifelineSubmission[], Error>`
- Query key: `['lifelineSubmissions', mapVersion, submissionsLayerId, lifelineId]` — `mapVersion` is in the key so a portal/WebMap swap invalidates cached lists.
- `enabled: isReady && lifelineId !== null && submissionsLayerId !== null` — gates on both the map being loaded AND the layer ID being resolved by discovery.
- `staleTime: 30_000`, `num: 100`. `where: lifeline_id = '<id>'` — `lifelineId` is the closed `LifelineId` union so injection-safe.
- Maps `feature.attributes` to a typed `LifelineSubmission`: `objectId`, `lifelineId`, `severity` (raw `severity_official` string), `submittedAt` (ISO; accepts both epoch-ms numbers and ISO strings from AGOL), `aiInterpretation`, `incidentName` (read but not surfaced in UI yet — for the upcoming incident-grouping work), `coordinates` (extracted from Point geometry via `.longitude`/`.latitude`; null if non-point or missing).

**`MapViewContext` lifted to caller — pre-existing bug fixed as a side effect**: previously `MapViewContext.Provider` lived inside `MapView.tsx`, so `LifelineDrawer` (rendered as a *sibling* of MapView in App.tsx) got the default null-ref from context. That meant `locateIncident` was a silent no-op on desktop. New shape:
- `useMapView()` now returns `{ ref, isReady, setIsReady }` (was just `MutableRefObject`).
- New `MapViewProvider` component owns the ref + `isReady` state and exposes it via context.
- `MapView` reads the ref from context (writes to `ref.current`; toggles `isReady` after `view.when()`; clears on cleanup).
- Caller must wrap the tree in `MapViewProvider`. Desktop: `App.tsx` wraps the content area; the `key={mapVersion}` lives on the *provider* now so a config save resets ref + readiness state alongside the MapView remount. Mobile: `MobileLifelinePage` self-wraps with `MapViewProvider` (each detail-page entry is its own provider scope).
- Consumers updated: `IncidentsLayer`, `MapToolbar`, `LifelineDrawer`, `MobileLifelinePage`. Locate-on-map now actually pans the map on desktop.

**Card content** (both desktop and mobile):
- `ai_interpretation` becomes the primary body text (no separate title — `lifeline_id` is the filter, not a per-row title).
- Severity chip uses `severity_official` raw string. Color mapped from `KNOWN_SEVERITY_COLORS` (`low | moderate | high | catastrophic`) with a gray fallback for unknown values — defensive against schema drift.
- Timestamp formatted from `submittedAt`.
- Locate button only rendered when `coordinates !== null`.

**Mobile-specific**: `ZoomToIncidents` renamed to `ZoomToSubmissions`, takes `LifelineSubmission[]` keyed by `objectId`. The card button is `disabled` when coordinates are null. `IncidentsLayer` call dropped its now-unused `incidents` / `lifelines` props.

**Renamed**: `src/features/map/useMapView.ts` → `.tsx` (now exports a JSX-returning `MapViewProvider`). Used `git mv` so history is preserved.

**i18n added** to `lifeline.drawer`: `loadingIncidents`, `loadIncidentsError`. `noIncidents` message changed from "No incidents affecting this lifeline." → "No submissions for this lifeline yet." to reflect the data source.

**Not yet wired (per current scope)**:
- Event-selector → submission filter (will use the upcoming `incident_name` attribute the user is adding).
- Admin "Create new incident" UX in the event-selector dropdown.
- `lifeline_status` table → tile colors / status edits (currently still mock).
- mockData removal — staying for now, will go when the above land.

**Files**: `useMapView.ts → .tsx`, `MapView.tsx`, `IncidentsLayer.tsx`, `MapToolbar.tsx`, `LifelineDrawer.tsx`, `MobileLifelinePage.tsx`, `MobileShell.tsx`, `App.tsx`, new `hooks/useLifelineSubmissions.ts`, `i18n/locales/en.json`.

**Not browser-verified**: `tsc --noEmit` exit 0. Real exercise needs the lifeline_submissions layer populated with rows having the expected attributes.

---

## 2026-05-27 — Portal URL + Verify, WebMap-owned layer discovery

**Pivot**: dashboard now points at an AGOL **portal + WebMap** (no separate FeatureService URL). The two pieces of lifeline data live *inside* the WebMap:
- `lifeline_submissions` — operational FeatureLayer (incident points, filtered per active lifeline)
- `lifeline_status` — a feature **table** (8 rows, one per lifeline ID). Discovered now; runtime read is a future change (will replace `mockData`).

**Discovery strategy** (hybrid title-then-cache):
- On first WebMap load, walk `webmap.allLayers` for `lifeline_submissions` and `webmap.tables` for `lifeline_status`, match by title, store their **layer IDs** in `MapConfigContext` via `setResolvedLayerIds`.
- Subsequent runtime lookups (e.g., `IncidentsLayer`) use the cached IDs — title changes in AGOL don't break the app.
- Cache is **in-memory only**. `webmap.load()` happens on every page mount anyway, so the title-walk discovery itself costs ~µs. Persisting (e.g., localStorage) would add stale-ID risk for no perceptible perf gain.
- Re-discovery is triggered by `setMapConfig(portalUrl, webMapId)` — that setter clears resolved IDs (unless a `ResolvedLayerIds` is passed in alongside, as it is from a freshly-verified Save).

**`MapConfigContext` shape** (replaces the `featureServiceUrl` model):
```
portalUrl: string        // default 'https://www.arcgis.com'
webMapId: string         // default '' (was 'PLACEHOLDER_ID')
submissionsLayerId: string | null
statusTableId: string | null
mapVersion: number
setMapConfig(portalUrl, webMapId, resolved?: ResolvedLayerIds | null)
setResolvedLayerIds(subId, tableId)
```

**`MapView.tsx`** — added `@arcgis/core/portal/Portal` to the lazy-load batch. Constructs `new Portal({ url: portalUrl })` and passes it as `portalItem.portal` so the portal scope is per-WebMap (no `esriConfig.portalUrl` mutation — avoids cross-instance interference during Verify). Discovery runs inside `view.when()` only when either resolved ID is `null` (preserves IDs carried in from Verify+Save). Both layer AND table must be found to call `setResolvedLayerIds` — partial state would be misleading.

**`IncidentsLayer.tsx`** — no longer creates/owns a FeatureLayer. Looks up the WebMap-owned layer by `submissionsLayerId` (cast to `FeatureLayer`), then mutates its `definitionExpression` and `visible`. Single effect with deps `[viewRef, submissionsLayerId, activeView, visible]`. No cleanup — the layer's lifetime is the WebMap's, and the MapView remount via `mapVersion` key brings down the whole tree.

**`AdminPage.tsx`** — Portal URL input (top, `type="url"`) + WebMap ID input (below). New **Verify** button (`useButton`, secondary outline style): loads a throwaway `WebMap` with the typed values, walks for both titles, surfaces specific errors (`verifyMapError` / `verifyLayerMissing` / `verifyTableMissing`). On success, the `ResolvedLayerIds` is stored in local state along with the verified `portalUrl`/`webMapId`; on Save, if the current draft still matches what was verified, those resolved IDs are passed into `setMapConfig` so the runtime skips re-discovery. Verify is **not** a gate on Save — if a user clicks Save without verifying first, the runtime will re-discover on next WebMap load.

**Files**: `MapConfigContext.tsx`, `MapView.tsx`, `IncidentsLayer.tsx`, `AdminPage.tsx`, `AdminPage.module.css` (added `.verifyBtn` + `.verifySuccess` + `.verifyError`), `en.json` (renamed `admin.featureUrl*` → `admin.portalUrl*`, added `admin.verify*`).

**Not verified**: no browser smoke test yet — needs a real AGOL portal + WebMap with the two named layers/tables to actually exercise Verify and the discovery path. `tsc --noEmit` exit 0.

---

## 2026-05-20 — Amplify build fix on feature/admin-page

**Symptom**: Amplify CI failed on `e9eaa16` with `src/App.tsx(171,38): error TS2367: This comparison appears to be unintentional because the types 'LifelineId' and '"map"' have no overlap.` Local `tsc --noEmit` had passed pre-push — version skew between local TS and Amplify's resolved TS bit us.

**Cause**: Line 171 read `isLifelineActive && mapActiveView !== 'map' && activeEvent`. TS 5.x narrows through **aliased const boolean conditions** — once `isLifelineActive` (= `mapActiveView !== 'map'`) is true, `mapActiveView` is already `LifelineId`, so the second compare is a no-overlap error.

**Fix** (commit `bdb94f0`): drop the redundant compare → `isLifelineActive && activeEvent`. The `isLifelineActive` narrowing carries `mapActiveView` as `LifelineId` into the props below — no other changes needed.

**Takeaway**: when guarding with an aliased boolean (`const isX = foo === 'a'`), don't re-state the underlying compare alongside it. Either use the boolean or the raw compare, not both.

---

## 2026-05-20 — AGOL WebMap + Admin Settings (feature/webmap, feature/admin-page)

**Two stacked branches**, both pushed: `feature/webmap` (commit `2ea9a15`) introduces the AGOL plumbing; `feature/admin-page` (commit `17f3d17`, branched from `feature/webmap`) makes the IDs editable at runtime.

**feature/webmap — what landed**:
- `MapView.tsx`: `new Map({ basemap: 'gray-vector' })` → `new WebMap({ portalItem: { id: WEB_MAP_ID } })`. Lazy-load list swapped `@arcgis/core/Map` → `@arcgis/core/WebMap`. Skeleton/ScaleBar/useMapView pattern preserved.
- `IncidentsLayer.tsx`: full rewrite — dropped all GraphicsLayer / Graphic / Point / SimpleMarkerSymbol / SimpleFillSymbol / SimpleLineSymbol / PopupTemplate / geometryEngine imports and the SEVERITY_MARKER_STYLES / parseHex / buildPopupContent helpers. Now mounts a FeatureLayer at `FEATURE_SERVICE_URL`, filters via `definitionExpression` (`lifeline_id = '<id>'` when a specific lifeline is active, else `1=1`). Visibility-only toggle still uses the separate-effect pattern (no recreation).
- **Props back-compat trick**: kept `incidents?` and `lifelines?` on `IncidentsLayerProps` even though they're unused — App.tsx and MobileLifelinePage.tsx still pass them and the spec said don't touch those call sites. Worth narrowing later when the call sites are revisited.
- The marker-shape SVGs in `MapToolbar.tsx` legend are now stale (FeatureLayer renderers come from AGOL, not our code). Comment at MapToolbar.tsx:75 still references `SimpleMarkerSymbol styles` — left untouched; will need revisiting if/when we own renderers again.
- `IncidentsLayer` is now a misnomer (it's a generic lifeline FeatureLayer mounter). Rename deferred to avoid churning the call sites.

**feature/admin-page — what landed**:
- New `src/contexts/MapConfigContext.tsx` — provider holds `webMapId`, `featureServiceUrl`, `mapVersion`, `setMapConfig(id, url)`. Setter updates both values **and** bumps `mapVersion`. Initial values are the `PLACEHOLDER_ID` / `PLACEHOLDER_URL` strings (moved here from MapView/IncidentsLayer). Phase B will replace the provider body with an AppSync fetch — interface stays the same.
- `MapView.tsx` and `IncidentsLayer.tsx` no longer hold their respective constants. Each reads from `useMapConfig()` and **gates construction on a non-empty value** so a future fetch-then-set flow doesn't crash on empty initial state.
- `App.tsx` reads `mapVersion` and uses it as `MapView`'s `key` — `setMapConfig` → bump → MapView fully remounts (its child IncidentsLayer too) with the new config. **No `webMapId` in MapView's effect deps** — single-mount semantics by design; key-bump is the only remount trigger.
- `AdminPage.tsx` (new) — admin-only via `user.roles.includes('Admin')`, hard-returns `null` for non-admins as a defense even though the nav button is also gated. Form: two text inputs pre-filled from `useMapConfig()`, validates non-empty + `https://` prefix on the URL, Save is `useButton` from `@react-aria/button` with `isDisabled` while unchanged or invalid. Save calls `setMapConfig` and shows a transient "Saved" hint that clears on next keystroke. Inline errors only appear after the user types into a field (no errors on initial render); `aria-invalid` + `aria-describedby` wired for SR.
- `AdminPage.module.css` — dark navy (`#162238` page, `#1b2a4a` form card), 44px min-height on inputs and Save button, `:focus-visible` rings matching `LifelineDrawer`, mobile-stretch Save at ≤760px.
- `App.tsx` — `ActiveView` widened to `'map' | 'admin' | LifelineId`. New top-bar "Admin" button (`adminBtn` + `adminBtnActive` styles in `App.module.css`) — visible only to admin role, **desktop only** (`!isMobile`); mobile admin deferred because MobileShell is out-of-scope for this branch. Active-state toggle pattern matches the lifeline tile toggle. `mapActiveView: 'map' | LifelineId` local narrows the type for LifelineStrip / IncidentsLayer / LifelineDrawer prop boundaries (TS can't narrow through an `isAdminActive` boolean alone).
- When AdminPage is active, the entire MapView tree is unmounted — no map behind the form. LifelineDrawer is gated off as well.

**Provider order in `main.tsx`** (outermost → inner): `StrictMode` → `QueryClientProvider` → `MapConfigProvider` → `CrisisEventProvider` → `Suspense` → `App`. MapConfig is above CrisisEvent because nothing in CrisisEvent reads map config, but the inverse isn't true.

**i18n additions** (`en.json`): new `admin.*` namespace — `navButton`, `heading`, `subheading`, `webMapIdLabel/Placeholder/Error`, `featureUrlLabel/Placeholder/Error/HttpsError`, `saved`. No new keys outside that namespace.

**SQL-injection note**: `definitionExpression = `lifeline_id = '${activeView}'`` uses string interpolation. `activeView` is narrowed to `LifelineId` (closed union of safe slugs) before this is built, so it's not exploitable today — but worth knowing before this is ever wired to user-controlled state.

**What's NOT verified**: no dev-server smoke test in either branch. Typecheck passes (`tsc --noEmit` exit 0). Browser verification of WebMap render, FeatureLayer filtering, and Save → remount flow still pending — needs a real AGOL item ID and service URL to actually load anything.

**Stacking caveat**: `feature/admin-page` is based on `feature/webmap`, not `main`. Merge `webmap` PR first; `admin-page` will then rebase cleanly. Rebasing `admin-page` directly onto `main` before `webmap` merges would conflict on `MapView.tsx` (basemap vs WebMap) and `IncidentsLayer.tsx` (GraphicsLayer vs FeatureLayer).

---

## 2026-05-18 — Mobile Two-Screen Flow (feature/mobile-2)

**Branch**: `feature/mobile-2`, branched off `feature/mobile` (keeps the document-anchoring lock from that pass). Pushed to origin. Commit `e5e9b1b`. Goal: replace the cramped horizontal lifeline strip on phones with a dedicated mobile flow — *home* (8 large tiles) → *detail* (small map + scrollable info).

**Mobile detection** (`src/hooks/useIsMobile.ts`): single `matchMedia('(max-width: 760px)')` hook with `addEventListener('change')`. JS-side branching (vs pure CSS show/hide) because the desktop vs mobile component trees are different enough — the strip + drawer + full map vs. the home grid + small map — that conditionally rendering keeps unused trees out of the DOM and avoids double-mounting ArcGIS.

**App.tsx routing**: `useIsMobile()` selects the shell class (`.shell` vs `.mobileShell`) and the body content. Desktop branch unchanged. Mobile branch replaces the strip + map area with `<MobileShell />`.

**App.module.css**: added `.mobileShell` — `grid-template-rows: 44px 1fr` (no strip row), same `100dvh` / `touch-action: none` / `overscroll-behavior: none` anchoring as `.shell`. The mobile top bar drops `.topBarLeft` (title) and `.lastUpdated` via descendant selectors on `.mobileShell` so EventSelector + sign-out fit comfortably.

**MobileShell** (`src/features/mobile/MobileShell.tsx`): tiny state machine. `activeLifeline: LifelineId | null` — null means home, non-null means detail. Renders `MobileHome` or `MobileLifelinePage`. No real router; this is a single-page in-place toggle. `key={activeLifeline}` on the detail page so per-lifeline state (notes draft, focused incident) is fresh on each switch.

**MobileHome** (`src/features/mobile/MobileHome.tsx`): 2-col × 4-row CSS grid filling the viewport. Each tile = official lifeline graphic (status-tinted via the `STATUS_HALO` map, same convention as `LifelineStrip`) + label + status text. Tile flex column with `flex: 1 1 0` on the image — image scales fluidly to fill available tile height while staying contained. Portrait layout is 2×4; `@media (orientation: landscape) and (max-height: 500px)` flips to 4×2 for landscape phones so tiles stay roughly square. `@media (max-height: 600px)` hides the status sublabel on very short screens.

**MobileLifelinePage** (`src/features/mobile/MobileLifelinePage.tsx`): three-row flex column.
- Header (fixed): back-button (custom SVG chevron, `useButton`) + lifeline name + status badge + last-updated timestamp.
- Map slot (fixed): `height: 38dvh`, `min-height: 200px`, `max-height: 320px`. Hosts a fresh `<MapView>` with `<IncidentsLayer activeView={lifelineId}>` and an internal `<ZoomToIncidents>` helper.
- Content (scrollable): `overflow-y: auto` + `touch-action: pan-y` + `overscroll-behavior: contain` so scroll stays inside the page and never escapes the locked document. Houses the status segmented control (editors only), notes textarea with 800ms debounce → `useUpdateLifelineStatus`, and incident list.

**Map reuse caveat**: each detail entry mounts a fresh ArcGIS `MapView` (because we unmount the page on back). The lazy-loaded ArcGIS modules are cached after first load, so subsequent entries are fast, but the view itself is re-instantiated. Acceptable for now — if it becomes a perceived lag, lift the `<MapView>` into `MobileShell` and hide vs unmount.

**ZoomToIncidents** (helper inside `MobileLifelinePage.tsx`): replaces ArcGIS' Extent module with a small center+zoom heuristic. Computes the bounding span of incident coordinates and picks zoom from a 5-step ladder (`span > 12 → 5`, `> 5 → 6`, `> 1.5 → 7`, `> 0.3 → 9`, else 11). When a single incident is focused via the list, zooms to it at zoom 12. Single-incident lifelines: zoom 11. Empty: CONUS fallback (`[-98.5795, 39.8283]`, zoom 5). `lastTargetRef` debounces redundant `goTo` calls.

**Incident list interaction**: each card is a `<button aria-pressed>` (not an anchor — there's no navigation). Tap toggles focus: tap to zoom map to that point, tap again (or tap a different card) to either widen back out or refocus. The "Locate on map" / "Show all incidents" label flips with focus state. All clearer than the drawer's per-card "Locate on map" button.

**i18n keys added**: `common.back` = "Back", `lifeline.drawer.showAll` = "Show all incidents". `t()` calls in MobileLifelinePage use the second-arg fallback pattern (`t('common.back', 'Back')`) defensively in case keys are missing from a future locale.

**Files**:
```
src/hooks/useIsMobile.ts                              (new)
src/features/mobile/MobileShell.tsx                   (new)
src/features/mobile/MobileShell.module.css            (new)
src/features/mobile/MobileHome.tsx                    (new)
src/features/mobile/MobileHome.module.css             (new)
src/features/mobile/MobileLifelinePage.tsx            (new)
src/features/mobile/MobileLifelinePage.module.css     (new)
src/App.tsx                                           (modified — mobile branch)
src/App.module.css                                    (modified — .mobileShell grid)
src/i18n/locales/en.json                              (modified — back, showAll)
```

**What it replaces from feature/mobile**: the previous strategy crammed the strip to ~44px graphics + 0.55rem wrapped labels at ≤760px, and ≤420px hid labels entirely. That mobile-only strip CSS is now dead code on mobile (the strip is never rendered at ≤760px). Left in place because it's still correct if someone resizes a desktop window narrow; not worth removing.

**Desktop**: completely untouched. `useIsMobile()` returns false above 760px and the original strip + map + drawer layout renders exactly as before.

---

## 2026-05-18 — Mobile Layout Pass (feature/mobile)

**Branch**: `feature/mobile`. Pushed to origin. Goal: make the dashboard usable on phones — lifeline strip was getting clipped, and finger drags were panning the document.

**Page-level anchoring** (new `src/index.css`, imported in `main.tsx`):
- `html, body` get `overflow: hidden`, `overscroll-behavior: none`, 100% size.
- `body` gets `position: fixed; inset: 0; touch-action: none` so finger drags do not pan/bounce the document.
- `#root` is 100%/100% with `overflow: hidden`.
- Carve-out: `.esri-view, .esri-view-surface { touch-action: none }` lets ArcGIS handle its own touch gestures (pan/zoom inside the map). Necessary because the global lock would otherwise kill map interaction.
- `index.html` viewport meta tightened to `maximum-scale=1.0, user-scalable=no, viewport-fit=cover` to suppress pinch-zoom (which would otherwise let the document shift).

**Shell sizing** (`App.module.css`): `.shell` height is `100vh` then `100dvh` (dynamic viewport — handles iOS Safari bottom bar collapsing). Also added `touch-action: none; overscroll-behavior: none` defensively.

**Top bar at ≤760px**: drops `.topBarLeft` (title) and `.lastUpdated` to free room for EventSelector + sign-out. Bar shrinks from 48px → 44px.

**LifelineStrip mobile distribution** (`LifelineStrip.module.css`):
- Tiles already `flex: 1 1 0` — the issue was the fixed 52px image plus padding/gaps overflowing on narrow widths.
- ≤760px: `gap: 2px`, padding `4px 4px 6px`, tile padding `2px 0`, border `1px`, image goes responsive (`width: 100%; max-width: 44px; max-height: 44px`). Label wraps with `overflow-wrap: anywhere` at 0.55rem. All 8 tiles fit evenly.
- ≤420px: image cap drops to 38px, labels `display: none`. Just the graphics across the very narrowest phones.

**LifelineDrawer mobile** (`LifelineDrawer.module.css`):
- ≤760px: drawer goes full-width (no left border).
- `.body` already had `overflow-y: auto` (internal scroll preserved per requirement). Added `overscroll-behavior: contain` + `touch-action: pan-y` so scrolling stays inside the drawer and never escapes to the locked document.

**MapToolbar legend panel** (`MapToolbar.module.css`): mirrored the drawer — full width on mobile, `overscroll-behavior: contain` + `touch-action: pan-y` on `.legendBody`.

**Why these specific guards** (in case the lock seems redundant): `touch-action: none` alone prevents the OS from interpreting the gesture as a pan, but iOS still rubber-bands the body unless `position: fixed` + `overscroll-behavior: none` are also set. The three together are the reliable combo. The internal scroll containers reverse it with `touch-action: pan-y; overscroll-behavior: contain`.

---

## 2026-05-18 — GitHub + Amplify Hosting Live

**GitHub**: `https://github.com/CJCarsley/community-lifelines` (canonical casing — the lowercase `cjcarsley/...` form 301-redirects). Initial commit `2874664`, hosting commit `29997ef`. Default branch `main`. Local `~/.gitconfig` (at `U:\.gitconfig`) has `user.name=CJCarsley`, `user.email=CJCarsley@dotcomm.org` — same identity used on warming-cooling-centers.

**Amplify Hosting**: Connected to `main`, frontend-only (no backend yet). `amplify.yml` at root drives the build:
```yaml
preBuild: npm ci --legacy-peer-deps
build:    NODE_OPTIONS=--max-old-space-size=7168 npm run build
artifacts: dist/**
```
The heap-size flag is mandatory for the @arcgis/core build — without it Amplify's default 4GB build runner OOMs. SPA rewrite rule (the regex one targeting `/index.html` with status `200`) added in the Console post-deploy so deep links don't 404.

**Pre-existing TS error fixed in this push** (`29997ef`): `EventSelector.tsx` was typing `item.key` as `React.Key`. React 19 types added `bigint` to `React.Key`, which is wider than `@react-types/shared` `Key` (`string | number`). Fix: import `Key` from `@react-types/shared` and use it at both the props type and the cast site (line 160). Pattern to remember if any new react-aria/react-stately wrapper code shows the same error.

**.gitignore additions this session**: `.idea/` (JetBrains workspace). Existing entries already covered `node_modules`, `dist`, `.env`, `.env.local`, `amplify_outputs.json`.

**Backend status**: still not configured. App runs on `USE_MOCK_DATA = true` (mockData.ts). When auth/API are needed, follow the warming-cooling-centers pattern (Gen 2 `amplify/backend.ts` + `backend:` phase in amplify.yml + `npm install --prefix amplify --legacy-peer-deps` and `ampx pipeline-deploy --branch $AWS_BRANCH --app-id $AWS_APP_ID`).

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
