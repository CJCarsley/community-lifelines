# Claude Reference Notes — Community Lifelines Dashboard

---

## 2026-06-24 — Decouple community lifelines from incidents (IN PROGRESS, not committed)

**Status: code complete on branch `feature/community-lifelines`, typechecks clean (`tsc -b` exit 0), NOT committed/pushed, NOT yet sandbox-tested.** Per the EOC manager: Community Lifelines are **per-community, not per-incident**. The "Live" lifeline status is now the same no matter which incident is selected; incidents only **window the history view** via their dates.

**Model change (no ArcGIS schema edit, no Amplify/backend change — all frontend + ArcGIS data):**
- **Reserved sentinel** `COMMUNITY_KEY = '__community__'` (in `features/map/statusTable.ts`). ALL community `lifeline_status` rows read/write under `incidentid = '__community__'`. Legacy per-incident rows are simply ignored ("start fresh" decision — left in place, unused).
- **`lifeline_status` reads/writes** (`useLifelineStatuses`, `useUpdateLifelineStatus`, `useIncidentHistory`→renamed export **`useCommunityHistory`**, `seedLifelineStatus`): all dropped the `incidentId` param and now filter/insert the sentinel. Seed-8-unknowns happens ONCE for the community (first load with no community rows), not per incident. `useUpdateLifelineStatus` also invalidates `['lifelineStatusHistory']`.

**Incident dates (read-only, from existing ArcGIS fields the user added/used):**
- `reptime` (Report Time) = **start**; `incidentended` = **end** (non-null ⇒ ENDED). Both date fields on all 3 Incidents sublayers. Constants `INCIDENT_START_FIELD`/`INCIDENT_END_FIELD` in `incidentLayers.ts`.
- `useIncidents` now reads both, merges per `incidentid` (min start, max end), returns ISO `startDate`/`endDate` on `IncidentRecord` (no more `returnDistinctValues` — needs per-feature dates). `IncidentCreateControl` writes `reptime = now` on create; **no longer seeds lifeline_status** (community-wide now).

**History windowing + Live gating (`App.tsx` + `IncidentTimeline` + mobile):**
- Active/no incident: Live enabled; slider `[start (or earliest row), now]`.
- **Ended incident:** Live **disabled**, view forced to read-only history; slider clamped to `[start, end]`, default at `end`; History toggle hidden; timeline can't be closed (only view). `IncidentTimeline` gained `liveDisabled` prop (hides Live/✕ buttons, clamps into window instead of snapping to Live).
- **Lifelines viewable with NO incident selected** (community-independent): drawer/mobile lifeline page render even when `activeIncident` is null; `incidentId` is now `string | null` and used ONLY to scope the submissions list. Edit gate extended with `&& !readOnly` (ended/past = read-only) in both `LifelineDrawer` and `MobileLifelinePage`.

**Decisions (confirmed with user):** existing data = start fresh (ignore old per-incident rows); ended = read-only history; lifelines visible with no incident; dates from existing ArcGIS fields (no new edit UI).

**LEFT TO DO:**
1. **Sandbox test** (`ampx sandbox` not needed — no backend change; just `npm run dev`): verify Live is incident-independent; create/select active vs ended incident; ended → Live off + slider clamped `[start,end]` + read-only; no-incident → lifelines still editable (if assigned).
2. **Confirm the `__community__` seed** path on a table that already has legacy rows (the empty-check is on community rows only, so it should seed even when legacy incident rows exist — verify).
3. Commit → branch already exists (`feature/community-lifelines`) → PR → merge → prod (frontend-only deploy).
4. Optional: admin cleanup of orphaned legacy per-incident `lifeline_status` rows (cosmetic).
5. **Watch:** `reptime`/`incidentended` field names + epoch-ms assumption against the live service (date fields return ms; `toMsOrNull` tolerates string/empty).

**Untracked:** `apps/` (companion scaffold) remains uncommitted from earlier — unrelated to this work.

---

## 2026-06-10 — Admin per-user lifeline assignments + Return-to-Map (shipped to prod)

**Status: LIVE in prod** (PR #16, merge `b0f44726`). Admins assign each user the lifeline(s) whose status they may edit; the edit gate is now **assignment-based** (Admins edit all), replacing the static `EDIT_ROLES` gate. Everyone still SEES everything.

**Backend (`amplify/`):**
- **`LifelineAssignment` model** (`data/resource.ts`): `identifier(['userSub'])` (Cognito `sub`), fields `email`, `lifelines: string[]`. Auth `authenticated().to(['read'])` + `group('Admin')` writes. Realtime via `observeQuery`.
- **`functions/list-users/`** Lambda → Cognito `ListUsers`, exposed as the **Admin-only `listAppUsers`** custom query (`a.query().returns(a.ref('AppUser').array()).handler(a.handler.function(listUsers))`, `AppUser` `customType`). `backend.ts` registers the function in `defineBackend`, `addEnvironment('USER_POOL_ID', …userPool.userPoolId)`, and `addToRolePolicy` for `cognito-idp:ListUsers` on `…userPool.userPoolArn`. Added `@aws-sdk/client-cognito-identity-provider`.

**Frontend (`src/`):** hooks `useAppUsers` (the query), `useLifelineAssignments` (live `Map<sub,assignment>` + upsert), `useMyAssignedLifelines` (current user's live set → gate). `features/admin/UserAssignments.tsx` (user table + per-lifeline checkbox modal, dark-themed) on `AdminPage`. Edit gate in `LifelineDrawer` + `MobileLifelinePage`: `canEdit = isAdmin || assigned.has(lifelineId)`. `useAuth`/`AuthUser` gained `sub`. Return-to-Map button (`App` passes `setActiveView('map')`).

**Decisions / limitations:**
- **Client-side gating only.** The status write still goes through the service-account proxy, which *can* edit any lifeline — a hand-crafted request bypasses the UI gate. Acceptable for an internal authenticated tool; **server-side enforcement (proxy validates the caller's assignments) is the defined follow-up** if needed.
- **Assignment is the gate; Admins edit all.** `Editor`/`LifelineManager` groups no longer gate status editing (the `EDIT_ROLES` export remains in `useAuth.ts` but is unused as a gate).

**Gotchas / ops:**
- **Custom query + function:** the handler function must be both referenced in the schema (`a.handler.function(listUsers)`) AND passed to `defineBackend` so `backend.listUsers` is available to wire env + IAM. Handler typed via `Schema['listAppUsers']['functionHandler']`.
- **New model + function ⇒ backend deploy** before the UI works (sandbox rewrites `amplify_outputs.json`; restart `npm run dev`).
- **Post-deploy:** existing prod users have **no assignments** → non-admins can view but not edit until an admin assigns them lifelines (Admins always edit all). First prod deploy creates the `list-users` Lambda + role.

---

## 2026-06-08→10 — Incident-centric model + snapshot timeline + incident chat (shipped to prod)

**Status: LIVE in prod** (merged to `main` via PRs #9–#14 + `feature/incident-chat`). Replaced the mock crisis-event model with real, incident-scoped data and added a history viewer and chat.

**Web map layers** (same WebMap the app loads; all have a **string `incidentid`** field):
- `Incidents` group `19e996b6448-layer-8` → `Areas 19e996b661f-layer-9`, `Lines 19e996b6621-layer-10`, `Points 19e996b6623-layer-11` (Emergency Information Manager solution). Also `incidentnm` (name) + `incidenttp` (type, coded-value domain on Points).
- `lifeline_submissions 19e709aebf1-layer-2`, `lifeline_status 19e709ae8b2-layer-1` (loaded as a WebMap **table**).

**What shipped:**
- **lifeline_status → live tile colors**, now **per-incident + append-only (snapshots)**: every status change INSERTS a new timestamped row; current status = latest row per `(incidentid, lifeline_id)`; a row-less incident is seeded with 8 `unknown` rows on first selection/creation. (`useLifelineStatuses`, `useUpdateLifelineStatus`, `seedLifelineStatus`.)
- **Incident selector** reads distinct incidents from the Incidents sublayers (`useIncidents`, `IncidentContext` replaced the mock `CrisisEvent*`).
- **Admin incident creation** (selector → "＋ New Incident"): next `incidentid` = numeric max+1; geometry via `SketchViewModel`; **incident type** picked from the Points `incidenttp` coded-value domain with exact web-map symbols (`useIncidentTypes` + `symbolUtils.renderPreviewHTML`); seeds lifeline_status. (`IncidentCreateControl`, `incidentSketch.ts`.)
- **Per-incident feature toolbar** (`IncidentFeatureToolbar`, top-center): add more geometry to the same `incidentid`. **Map filtering**: `IncidentsLayer` scopes Points/Lines/Areas + submissions to the selected incident via `definitionExpression`.
- **Snapshot timeline** (`IncidentTimeline`, desktop "History" toggle): continuous time axis (first event → now), `datetime-local` jump + ‹ › 1-hour steps; `statusesAsOf` reconstructs whole-incident state; editing locked while viewing the past. Mobile unaffected.
- **Incident chat** (`IncidentChat` + `useIncidentChat`, bottom-left): per-incident free-form comments, **Amplify Data `ChatMessage` model** (AppSync realtime `observeQuery`), minimize, **pop-out window** (`?chat=<id>` → `ChatWindow`, shares the same API so it auto-syncs), CSV export, History-slider filtering. Backend choice = Amplify Data (NOT AGE) for realtime + existing Cognito auth + clean separation from GIS.

**GOTCHAS (durable — these cost real time):**
- **Amplify owner-auth: `create` must be on `allow.owner()`, not `allow.authenticated()`.** Otherwise the implicit `owner` field is never populated, and owner-gated `update`/`delete` return **`Unauthorized`**. Pattern used: `allow.authenticated().to(['read'])` + `allow.owner().to(['create','read','update','delete'])`. (Messages created under the wrong rule stay permanently null-owner / undeletable.)
- **A new Data model isn't testable on localhost until deployed.** `client.models.X` is `undefined` (white-screens if you call `.observeQuery` on it) until the model exists in the backend `amplify_outputs.json` points at. Deploy via `ampx sandbox` (rewrites `amplify_outputs.json` → restart `npm run dev`) or merge. Guard hooks against the model being undefined.
- **`ampx sandbox` "Multiple sandbox instances detected"** has two causes: (a) genuinely two sandboxes running from different shells (check `Get-CimInstance Win32_Process` for `node.exe` with `ampx|sandbox` in CommandLine — different ParentProcessId = different shells), or (b) a **stale `.amplify/artifacts/cdk.out/read.<pid>.lock`** left by a force-killed CDK process. **Windows recycles PIDs** — a dead CDK PID had been reassigned to `chrome`, so an "is the PID alive?" check was fooled. Fix: kill all ampx/sandbox node procs, then delete `cdk.out\*.lock` (all stale when zero procs run), launch ONE. Don't relaunch while one is dying.
- **react-aria `useRadio` emits no `id`** → `htmlFor={inputProps.id}` is undefined and clicking does nothing. Nest `<input>` INSIDE `<label>`. (Hit in both LifelineDrawer and MobileLifelinePage.)
- **AGE editing via the app's service token works** once the registered OAuth app is granted edit in its **Privileges** section — `client_credentials` app tokens CAN edit user-owned hosted layers; no named-user/refresh-token needed. (Spent a while building a refresh-token path before finding this — reverted.)
- **Dev server must be on `localhost:5173`** — the only localhost origin in the proxy `allowedOrigins`; other ports CORS-fail the WebMap.

**Two terminals for local dev:** `npx ampx sandbox --profile dcgis-app-deployer` (backend, writes `amplify_outputs.json`) AND `npm run dev` (frontend, localhost:5173). `amplify_outputs.json` is gitignored.

**Open follow-ups (none committed):** snapshot data accrues but a richer viewer could come later; orphaned pre-incident-scope `lifeline_status` rows + null-owner chat messages could use an admin cleanup; seed-on-select race could be hardened with an AGOL uniqueness constraint; the separate field-user submissions app.

---

## 2026-06-04 — Shipped admin-settings to PRODUCTION (Amplify Hosting fullstack)

**Status: LIVE in prod.** The Cognito + AppConfig + AGE-proxy feature (see 2026-06-02 entry) is merged to `main` and deployed. Production is served from the custom domain **https://eoc.dogis.org**. Verified end-to-end on prod: sign-in → Admin save persists (shared across browsers) → WebMap loads through the AGE proxy with no portal login.

**Architecture fact — per-branch backends + per-pool users.** Each Amplify branch (and the local `ampx sandbox`) deploys its OWN backend stack: its own Cognito user pool, AppConfig table, and AGE-proxy Function URL. Consequences:
- Cognito users do NOT carry across environments. Each pool needs its own admin user (`admin-create-user` + `admin-add-user-to-group Admin`). Pools so far: sandbox `us-west-2_vxdS7StQJ`, branch `feature/admin-settings` `us-west-2_pe2dZYInf`, and `main`/prod (its own — get id from the branch auth stack outputs or `amplify_outputs.json` in the build).
- The proxy `allowedOrigins` (in `amplify/backend.ts`) must list **every** origin the app is served from for that env. Currently: `https://eoc.dogis.org` (prod custom domain), `https://main.…amplifyapp.com`, `https://feature-admin-settings.…amplifyapp.com`, `http://localhost:5173`. **Any new domain/branch that serves the app needs adding here + a redeploy**, or the credentialed-CORS preflight fails with "No Access-Control-Allow-Origin".

**Deploy gotchas hit & fixed getting to prod (Amplify Hosting):**
1. **`amplify.yml` backend phase.** Added `npx ampx pipeline-deploy --branch $AWS_BRANCH --app-id $AWS_APP_ID` so Hosting stands up the backend per branch and writes `amplify_outputs.json` before the frontend build. The frontend now hard-depends on that file existing at build time.
2. **`npm ci` → `npm install`.** The backend toolchain (`aws-cdk-lib`, `cdk-from-cfn` native binaries, `@smithy/*`) trips npm's optional-dependency lockfile bug, so strict `npm ci` rejects an otherwise-valid lock ("Invalid/Missing … from lock file"). Both phases use `npm install --legacy-peer-deps`. Frontend-only builds passed before because these deps weren't present.
3. **App IAM service role (the big one).** The app was frontend-only, so `iamServiceRoleArn` was `None` → `ampx pipeline-deploy` had no identity to deploy CDK → `BootstrapDetectionError` (build ran as AWS-managed `AemiliaControlPlaneLambda-CodeBuildRole` in acct 395333095307, no perms in 433306266182). **`dcgis-app-deployer` CANNOT fix this** — lacks `iam:CreateRole` AND `iam:PassRole` by design. An ADMIN attached the existing, already-proven role **`arn:aws:iam::433306266182:role/amplifyconsole-backend-role`** (warming-cooling-centers uses it) via the Amplify console / `amplify update-app --iam-service-role-arn`. After that, re-running builds needs no admin.

**Ops reminders (carried from sandbox debugging):** run `ampx`/AWS from PowerShell not Git Bash (HOME mismatch breaks SDK cred resolution); `$env:AWS_REGION="us-west-2"`; only one `ampx sandbox` at a time; tail CloudWatch with `export MSYS_NO_PATHCONV=1` (Git Bash mangles the leading `/` in log-group names); `~/.aws/credentials`+`config` are deny-listed for Claude — use the `dcgis-app-deployer` profile by name only.

**Remaining / next:**
- **Trim sandbox if done:** the local sandbox stack (`us-west-2_vxdS7StQJ`) stays up (billing) until `ampx sandbox delete`. Delete it if no longer needed for dev.
- **Okta federation (deferred):** uncomment `externalProviders` in `amplify/auth/resource.ts`, supply OIDC issuer + CLIENT_ID/CLIENT_SECRET (via `defineSecret`, never inline) + callback/logout URLs. Groups already drive authz, so app code won't change. Add the Hosted-UI/OAuth domain at the same time.
- **Role-based UI beyond Admin:** groups `Editor`/`LifelineManager`/`Viewer` exist in the pool but the app currently only gates on `Admin`. Wire finer-grained UI when needed.
- **CORS allowlist hygiene:** consider dropping `localhost`/old-branch origins from prod's list later; harmless but loose.
- **Lifeline status tiles still mock** (`lifeline_status` table → tile colors) — separate workstream, unchanged by this work.

**Key commits (feature/admin-settings → main):** `6e3ccbb` (feature), `dbb931c` (Hosting backend phase + prod CORS origins), `c86bde7` (lockfile fix), `7280199` (add eoc.dogis.org custom-domain origin, on main).

---

## 2026-06-02 — Cognito auth + shared AppConfig persistence + AGE portal proxy (feature/admin-settings)

**Goal**: (1) make Admin map config persist across all browsers/users until an admin changes it; (2) gate the site behind Cognito (native logins now, Okta later); (3) connect to the ArcGIS Enterprise portal via the service-account client_id/secret so users never see a portal login. Branch `feature/admin-settings` off `feature/submissions-wiring` (carries the age-token backend + amplify backend deps).

**Why config was resetting**: `MapConfigContext` was pure `useState` with hardcoded defaults — never persisted anywhere. Fixed by backing it with an AppSync/DynamoDB record.

### Backend (`amplify/`)
- **`auth/resource.ts`** — `defineAuth({ loginWith:{ email:true }, groups:['Admin','Editor','LifelineManager','Viewer'] })`. Okta is a commented `externalProviders.oidc` block (uncomment + supply issuer/clientId/secret + callback URLs later). **Forward-compat decisions baked in now**: authorize by GROUP not username; `email` canonical; group names STABLE (Okta attribute mapping targets them). No app-code change needed when Okta lands.
- **`data/resource.ts`** — singleton `AppConfig` model (`portalUrl`, `webMapId`, `submissionsLayerId?`, `statusTableId?`, `updatedBy?`). Auth rules enforce the requirement server-side: `allow.authenticated().to(['read'])` + `allow.group('Admin').to(['create','read','update','delete'])`. `defaultAuthorizationMode:'userPool'` (no public API key). Client uses a fixed id `'global'`.
- **`functions/age-proxy/`** — the AGE proxy (finishes the "proxy, not token-injection" design the age-token broker was scaffolded for). Lambda Function URL (authType NONE; auth enforced IN-handler). Flow: verify caller Cognito id token via `aws-jwt-verify` (new dep) → parse target from `rawQueryString` (Esri resource-proxy convention `<proxyUrl>?<target>`) → **SSRF guard**: only `https://<ALLOWED_PORTAL_HOST=secure.dcgis.org>` → get service token from age-token broker (`createAgeTokenProvider`) → forward with `X-Esri-Authorization: Bearer <token>` (token never reaches browser) → relay (text utf-8, binary base64). Dynamic env (`AGE_TOKEN_FUNCTION_NAME`, `AGE_TOKEN_REGION`, `USER_POOL_ID`, `USER_POOL_CLIENT_ID`) declared empty in `resource.ts` (so `$amplify/env/age-proxy` types them) and set via `addEnvironment` in backend.ts.
- **`backend.ts`** — `defineBackend({ auth, data, ageToken, ageProxy })`; inject proxy env from auth/ageToken resources; `ageToken...grantInvoke(ageProxy...)`; `ageProxy...addFunctionUrl({ authType:NONE, cors })`; `backend.addOutput({ custom:{ ageProxyUrl } })` → surfaces to frontend via `amplify_outputs.json`.

### Frontend (`src/`)
- **`amplifyConfig.ts`** (new) — `Amplify.configure(outputs)` side-effect + exports `AGE_PROXY_URL` from `custom.ageProxyUrl`. Imported once at top of `main.tsx`.
- **`main.tsx`** — wrapped in `<Authenticator hideSignUp>` (accounts are admin-provisioned in the Cognito console, not self-serve). Providers (`MapConfigProvider` etc.) moved INSIDE the Authenticator render-prop so they only query Data when signed in. `signOut` threaded to `App`.
- **`hooks/useAuth.ts`** — mock replaced. Stateful hook: `fetchAuthSession()` → roles from `cognito:groups` claim, filtered to the 4 valid `UserRole`s; `Hub.listen('auth', …)` re-loads on sign-in/out/refresh. `authMethod` = `payload.identities ? 'federated' : 'cognito'`.
- **`contexts/MapConfigContext.tsx`** — `generateClient<Schema>()`. Hydrates from `AppConfig.get({id:'global'})` on mount. `setMapConfig` is now **async** (returns Promise): upserts the singleton (get → update|create), sets `updatedBy` from session email, applies locally only after the write succeeds, throws on AppSync errors (so non-Admin writes surface). `setResolvedLayerIds` stays session-local (discovery cache; writing needs Admin).
- **`features/map/arcgisProxy.ts`** (new) — `installArcgisProxy(portalUrl)`: sets `esriConfig.request.proxyRules = [{ proxyUrl: AGE_PROXY_URL, urlPrefix: <portal origin> }]` and pushes a one-time request interceptor (matched on the proxy URL) that attaches the caller's Cognito id token as `Authorization: Bearer`. Called in `MapView` before `new Portal(...)` and in `AdminPage` Verify.
- **`features/admin/AdminPage.tsx`** — `handleSave` async/await with a `saveError` state → new i18n `admin.saveError` ("Could not save. You may not have Admin permission.").
- **`App.tsx`** — `signOut?` prop wired to the existing sign-out button.

### Build / deploy notes
- `tsconfig.app.json` got `resolveJsonModule:true` (for the outputs import).
- **`amplify_outputs.json` is gitignored** — created a PLACEHOLDER local stub so `tsc -b`/`vite build` pass. Real file is generated by `ampx sandbox` (dev) / `ampx pipeline-deploy` (CI). The stub will be overwritten; do NOT commit it / do NOT rely on its values.
- `amplify.yml` will need a backend phase + `ampx pipeline-deploy --branch $AWS_BRANCH --app-id $AWS_APP_ID` (per the warming-cooling-centers pattern) — **not yet added**; frontend-only hosting won't stand up auth/data/proxy.

**First sandbox deploy — four gotchas hit & fixed (machine: Windows, profile `dcgis-app-deployer`, account 433306266182):**
1. **Credentials "not found" by `ampx` but `aws` CLI works** — the AWS **JS SDK** resolves `~/.aws` via `HOME` first on Windows; Git Bash sets `HOME=U:\` (creds live at `USERPROFILE` = `C:\Users\cjcarsley\.aws`). The Python AWS CLI uses `USERPROFILE`, hence the split. **Fix: run `ampx` from PowerShell** (HOME unset → falls back to USERPROFILE), or `HOME="$USERPROFILE" npx ampx …` in bash.
2. **`ssm:GetParameter … us-east-2 … explicit deny in permissions boundary us-west-2-only-boundary`** — profile had no region → resolution fell through to `[default]` profile's `region=us-east-2`. **Fix: `$env:AWS_REGION="us-west-2"` (or add `region = us-west-2` under `[profile dcgis-app-deployer]` in `~/.aws/config`).** Do NOT weaken the boundary.
3. **`FailedToBundleAsset … age-token-lambda … esbuild … exited with status 1`** — root cause: **`amplify/tsconfig.json` was missing** (backend was hand-bootstrapped). `ampx`'s esbuild call passes no `--alias`/`--tsconfig`; it auto-discovers the nearest tsconfig walking up from the function file to map `$amplify/*` → `.amplify/generated/*`. With none in `amplify/`, esbuild hit the root tsconfig (no `$amplify` path) → `Could not resolve "$amplify/env/age-token"`. **Fix: added `amplify/tsconfig.json` with `paths: { "$amplify/*": ["../.amplify/generated/*"] }`.** Verify a function bundles standalone: `npx esbuild amplify/functions/<fn>/handler.ts --bundle --format=esm --platform=node --outfile=$TEMP/t.mjs` (EXIT 0).
4. Deploy then succeeded: pool `us-west-2_vxdS7StQJ`, client `5els5coldvmd5vohrrb1qtthes`, AppConfig model live, proxy Function URL minted. `amplify_outputs.json` written with real values (still gitignored).

**Security note (this session):** added a global deny-rule in `~/.claude/settings.json` blocking Read/Bash/PowerShell reads of `~/.aws/credentials` + `~/.aws/config` (commingled default/ohio/dcgis profiles). A `default`-profile key was exposed in transcript during debugging and **was rotated**. Only reference `dcgis-app-deployer` by name going forward.

### Not yet verified (needs a deploy + real portal)
- Whole thing is unexercised against AWS — no sandbox deploy run here.
- **Esri proxy assumptions to confirm against secure.dcgis.org**: (a) `X-Esri-Authorization: Bearer` accepted (vs needing `?token=` appended); (b) all feature-service/tile traffic stays on host `secure.dcgis.org` — if services live on a different host (e.g. a separate server FQDN), add it to `ALLOWED_PORTAL_HOST` allow-listing and the proxyRules `urlPrefix`; (c) Function-URL response size — large tile/query payloads must fit Lambda's 6MB response limit, else this needs streaming/CloudFront.
- **Bootstrapping the first Admin**: after deploy, create a user in the Cognito console and add them to the `Admin` group (no self-serve signup).
- Token-refresh / preflight: confirm the CORS preflight (Authorization header → OPTIONS) is handled by Function URL CORS + the handler's `OPTIONS → 204`.

---

## 2026-05-29 — AGE service-account token broker (Amplify Gen 2 backend bootstrap)

**Context**: migrating off the AWS-hosted private AGOL portal to a *different* AWS-hosted private AGOL portal, accessed via a single **service account** (OAuth2 client_credentials). All app data now comes from one WebMap on the new portal: `lifeline_submissions` layer, `incidents` layer, `lifeline_status` table — already set up on the new portal as of 5/28.

**First backend ever** — `amplify/` did not exist before this. CLAUDE_NOTES history said "backend not configured / USE_MOCK_DATA=true"; this bootstraps Gen 2. `amplify/backend.ts` created from scratch.

**`amplify/functions/age-token/`** — token broker Lambda. NOT behind API Gateway; invoked only by the (future) AGE proxy.
- `resource.ts`: `defineFunction({ name:'age-token', runtime:20, timeoutSeconds:15, memoryMB:256 })`. Env: `AGE_SECRET_ARN` (ARN only, never the value), `AGE_SECRET_REGION='us-west-2'`, `AGE_TOKEN_ENDPOINT='https://secure.dcgis.org/portal/sharing/rest/oauth2/token'`.
- `handler.ts`: cold-start fetch secret via AWS SDK v3 (`@aws-sdk/client-secrets-manager`), POST client_credentials grant as `application/x-www-form-urlencoded` (NOT JSON). Single module-level cache `{ token, expiresAt } | null` + a separate module-level creds cache. Returns cached token while >5 min life remains, else refreshes. Parses standard OAuth2 `{ access_token, expires_in(sec) }`. Accepts secret JSON with either `clientId/clientSecret` or `client_id/client_secret` keys.
- **502 pattern**: handler has no API Gateway, so it returns a typed discriminated union `AgeTokenResult` = `{ok:true,token,expiresAt}` | `{ok:false,statusCode:502,message}`. AGE auth failure → `ok:false/502/generic message`. Real error logged to CloudWatch as **message-only** (never token, secret, or full stack).

**`amplify/functions/shared/ageToken.ts`** — shared contract, dependency-light. Exports `AgeTokenResult`/`AgeTokenSuccess`/`AgeTokenFailure` types, `AgeTokenAuthError(message, statusCode=502)`, `TokenProvider` interface (`getToken(): Promise<string>`), and `createAgeTokenProvider(functionName, region?)`. The provider invokes the age-token Lambda (`@aws-sdk/client-lambda`, RequestResponse), re-throws failures as `AgeTokenAuthError` so the proxy maps to 502. Only the bearer token crosses the boundary — clientId/secret never leave the broker.

**`amplify/backend.ts`**: `defineBackend({ ageToken })` + `backend.ageToken.resources.lambda.addToRolePolicy(PolicyStatement{ actions:['secretsmanager:GetSecretValue'], resources:[<exact secret ARN>] })`. Nothing else granted.

**Deps NOT yet installed** (required before `ampx sandbox`/deploy):
```
npm i -D @aws-amplify/backend @aws-amplify/backend-cli aws-cdk-lib constructs esbuild tsx typescript --legacy-peer-deps
npm i @aws-sdk/client-secrets-manager @aws-sdk/client-lambda --legacy-peer-deps
```

**Open / next (Step 5)**: the AGE **proxy** function. Wire in backend.ts: `backend.ageProxy.addEnvironment('AGE_TOKEN_FN', backend.ageToken.resources.lambda.functionName)` + `backend.ageToken.resources.lambda.grantInvoke(backend.ageProxy.resources.lambda)`; in the proxy handler call `createAgeTokenProvider(env.AGE_TOKEN_FN, env.AWS_REGION)`.

**Verify before relying on it**:
- Secret JSON key casing (`clientId` vs `client_id`).
- Portal `oauth2/token` response shape — code assumes `{ access_token, expires_in(sec) }`. If it returns `{ token, expires(epoch-ms) }` (generateToken style), `requestToken()` parse needs changing.

**Not deployed / not typechecked** — backend toolchain not installed yet, so `$amplify/env/age-token` import and CDK types won't resolve until deps land.

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
