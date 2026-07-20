/**
 * Normalize Komari record collections.
 * Target releases return load history grouped by client UUID, while a few
 * compatible deployments and older fixtures expose an already-flat array.
 */
export function normalizeRecordCollection<T>(
  records: T[] | Record<string, T[]> | null | undefined,
  uuid?: string,
): T[] {
  if (Array.isArray(records))
    return records

  if (!records || typeof records !== 'object')
    return []

  if (uuid && Array.isArray(records[uuid]))
    return records[uuid]

  return Object.values(records).flatMap(item => Array.isArray(item) ? item : [])
}
