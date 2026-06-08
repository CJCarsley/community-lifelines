// Shared coercion for AGOL feature attribute values (used by the lifeline
// submission + status hooks). AGOL returns mixed types per field config.

export function toStringOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

export function toIsoOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  // AGOL date fields come through as epoch ms numbers
  if (typeof v === 'number' && Number.isFinite(v)) return new Date(v).toISOString();
  if (typeof v === 'string') {
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : new Date(t).toISOString();
  }
  return null;
}
