/** FNV-1a: a 32-bit hash of a string. */
function fnv1a(text: string) {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** MurmurHash3's finalizer: spreads every input bit over the result. */
function mix(value: number) {
  let h = value >>> 0
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return h >>> 0
}

/**
 * A copy of `items` in a pseudo-random order fully determined by `seed`:
 * each item is ranked by a hash of the seed and its stable key.
 *
 * Because an item's rank depends only on the seed and its own key, adding
 * or removing items leaves the others in the same relative order. A Card
 * created or edited while the collection is shuffled therefore slots into
 * the shuffled order instead of reshuffling everything.
 */
export function seededShuffle<T>(
  items: readonly T[],
  seed: number,
  keyOf: (item: T) => string,
): T[] {
  const ranked = items.map((item) => {
    const key = keyOf(item)
    return { item, key, rank: mix(fnv1a(key) ^ mix(seed >>> 0)) }
  })
  ranked.sort(
    (a, b) => a.rank - b.rank || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
  )
  return ranked.map(({ item }) => item)
}
