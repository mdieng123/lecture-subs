interface ChunkSpec {
  start: number
  duration: number
  offsetSeconds: number
}

export function computeChunks(
  totalDuration: number,
  chunkMinutes: number,
  silences: number[],
  overlapSeconds = 2
): ChunkSpec[] {
  const chunkSeconds = chunkMinutes * 60
  const chunks: ChunkSpec[] = []
  let cursor = 0

  while (cursor < totalDuration) {
    const target = cursor + chunkSeconds

    if (target >= totalDuration) {
      // Last chunk
      chunks.push({ start: cursor, duration: totalDuration - cursor, offsetSeconds: cursor })
      break
    }

    // Find nearest silence within ±15s of target
    const windowLow = target - 15
    const windowHigh = target + 15
    const nearby = silences.filter((s) => s >= windowLow && s <= windowHigh)

    let splitPoint = target
    if (nearby.length > 0) {
      // Pick silence closest to target
      splitPoint = nearby.reduce((best, s) =>
        Math.abs(s - target) < Math.abs(best - target) ? s : best
      )
    }

    const end = Math.min(splitPoint + overlapSeconds, totalDuration)
    chunks.push({ start: cursor, duration: end - cursor, offsetSeconds: cursor })
    cursor = splitPoint
  }

  return chunks
}

export function trimOverlapFromSegments<T extends { start_seconds: number; end_seconds: number }>(
  allSegments: T[][],
  chunkSpecs: ChunkSpec[],
  overlapSeconds = 2
): T[] {
  const merged: T[] = []
  const seen = new Set<number>()

  for (let i = 0; i < allSegments.length; i++) {
    const spec = chunkSpecs[i]
    const nextChunkStart = i + 1 < chunkSpecs.length ? chunkSpecs[i + 1].offsetSeconds : Infinity

    for (const seg of allSegments[i]) {
      // Skip segments that fall entirely within the overlap tail of this chunk
      // (they'll appear in the next chunk with better accuracy)
      if (i < allSegments.length - 1 && seg.start_seconds >= nextChunkStart - overlapSeconds) {
        continue
      }

      // Deduplicate by start_seconds (rounded to 0.01s)
      const key = Math.round(seg.start_seconds * 100)
      if (seen.has(key)) continue
      seen.add(key)

      merged.push(seg)
    }
  }

  return merged.sort((a, b) => a.start_seconds - b.start_seconds)
}
