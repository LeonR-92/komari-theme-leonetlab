/**
 * Komari `common:getNodes` 返回形状历史：原始 1.2.5 已是 UUID 键对象，
 * 1.2.5-fix1 回归为数组，1.2.5-fix2 起恢复 UUID 键对象。
 * 在数据边界统一归一化为一种稳定形状，主题其余部分无需关心版本差异。
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
