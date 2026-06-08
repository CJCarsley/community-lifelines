import { installArcgisProxy } from './arcgisProxy';
import type FeatureLayerType from '@arcgis/core/layers/FeatureLayer';

// Title MapView discovery walks for; fallback when the id isn't resolved yet.
const STATUS_TABLE_TITLE = 'lifeline_status';

// Loads the WebMap-owned `lifeline_status` table WITHOUT a MapView. Used by the
// status read hook (strip/home render outside any map) and the write mutation.
// installArcgisProxy is host-guarded/idempotent so the AGE proxy + Cognito token
// apply whether or not a MapView is mounted.
export async function loadStatusTable(
  portalUrl: string,
  webMapId: string,
  statusTableId: string | null,
): Promise<FeatureLayerType | null> {
  installArcgisProxy(portalUrl);

  const [{ default: WebMap }, { default: Portal }] = await Promise.all([
    import('@arcgis/core/WebMap'),
    import('@arcgis/core/portal/Portal'),
  ]);

  const portal = new Portal({ url: portalUrl });
  const webmap = new WebMap({ portalItem: { id: webMapId, portal } });
  await webmap.load();

  const table = (
    statusTableId
      ? webmap.tables.find((tbl) => tbl.id === statusTableId)
      : webmap.tables.find((tbl) => tbl.title === STATUS_TABLE_TITLE)
  ) as FeatureLayerType | undefined;
  if (!table) return null;

  await table.load();
  return table;
}
