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

/**
 * Normalize a time-series response for chart consumption.
 *
 * Komari history responses can contain duplicated rows after hot/rollup table
 * boundaries and third-party deployments occasionally expose malformed rows.
 * Keep the last row for an identical timestamp, discard rows with an invalid
 * RFC3339 timestamp and return a stable chronological sequence.
 */
export function normalizeTimedRecordCollection<T extends { time?: unknown }>(
  records: T[] | Record<string, T[]> | null | undefined,
  uuid?: string,
): T[] {
  const byTimestamp = new Map<number, T>()

  for (const record of normalizeRecordCollection(records, uuid)) {
    if (!record || typeof record !== 'object' || typeof record.time !== 'string')
      continue

    const time = record.time.trim()
    const timestamp = Date.parse(time)
    if (!time || !Number.isFinite(timestamp))
      continue

    // Equal instants may use different RFC3339 offsets or fractional precision.
    // Key by the parsed instant so a transport-format difference cannot create
    // a duplicate point; the later response row remains authoritative.
    byTimestamp.set(timestamp, record)
  }

  return [...byTimestamp.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, record]) => record)
}
