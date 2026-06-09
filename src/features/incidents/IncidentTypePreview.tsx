import { useEffect, useRef } from 'react';

// Renders an exact preview of an ArcGIS symbol (from the web map's renderer)
// into a DOM node via symbolUtils. The symbol is opaque here (the ArcGIS
// SymbolUnion is awkward to name) — it's passed straight back to symbolUtils.
export default function IncidentTypePreview({
  symbol,
  size = 18,
}: {
  symbol: unknown;
  size?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.replaceChildren();
    if (!symbol) return;

    let cancelled = false;
    void import('@arcgis/core/symbols/support/symbolUtils').then(async (symbolUtils) => {
      try {
        const el = await symbolUtils.renderPreviewHTML(
          symbol as Parameters<typeof symbolUtils.renderPreviewHTML>[0],
          { size },
        );
        if (!cancelled && ref.current && el) {
          ref.current.replaceChildren(el);
        }
      } catch {
        /* leave empty on preview failure */
      }
    });
    return () => {
      cancelled = true;
    };
  }, [symbol, size]);

  return (
    <span
      ref={ref}
      aria-hidden="true"
      style={{
        display: 'inline-flex',
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    />
  );
}
