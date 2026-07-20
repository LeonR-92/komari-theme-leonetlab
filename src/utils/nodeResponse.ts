/**
 * Komari changed `common:getNodes` from an array in 1.2.5 to a UUID-keyed
 * object in later releases. Keep that version difference at the data boundary
 * so the rest of the theme always works with one stable shape.
 */
export type UuidCollection<T> = T[] | Record<string, T>

export function normalizeUuidCollection<T extends { uuid: string }>(
  collection: UuidCollection<T> | null | undefined,
): Record<string, T> {
  const normalized: Record<string, T> = {}
  const values = Array.isArray(collection)
    ? collection
    : collection && typeof collection === 'object'
      ? Object.values(collection)
      : []

  for (const item of values) {
    if (!item || typeof item !== 'object')
      continue

    const uuid = typeof item.uuid === 'string' ? item.uuid.trim() : ''
    if (!uuid)
      continue

    normalized[uuid] = item
  }

  return normalized
}
