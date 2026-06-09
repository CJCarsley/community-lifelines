import { installArcgisProxy } from '@features/map/arcgisProxy';
import type WebMapType from '@arcgis/core/WebMap';

// Loads a WebMap WITHOUT a MapView — for hooks that render outside any map
// (the incident selector, the lifeline strip, the mobile home). installArcgisProxy
// is host-guarded/idempotent so the AGE proxy + Cognito token apply regardless.
export async function loadWebMap(
  portalUrl: string,
  webMapId: string,
): Promise<WebMapType> {
  installArcgisProxy(portalUrl);

  const [{ default: WebMap }, { default: Portal }] = await Promise.all([
    import('@arcgis/core/WebMap'),
    import('@arcgis/core/portal/Portal'),
  ]);

  const portal = new Portal({ url: portalUrl });
  const webmap = new WebMap({ portalItem: { id: webMapId, portal } });
  await webmap.load();
  return webmap;
}
