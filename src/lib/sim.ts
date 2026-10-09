import type { Estimate } from './estimator'
import type { Toolpath } from './toolpath'

/** First index in [lo, hi) of the ascending array whose value is >= x (hi if none). */
export function lowerBound(arr: ArrayLike<number>, x: number, lo = 0, hi = arr.length): number {
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (arr[mid] < x) lo = mid + 1
    else hi = mid
  }
  return lo
}

/** First index in [lo, hi) of the ascending array whose value is > x (hi if none). */
export function upperBound(arr: ArrayLike<number>, x: number, lo = 0, hi = arr.length): number {
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (arr[mid] <= x) lo = mid + 1
    else hi = mid
  }
  return lo
}

/** Segment range [a, b) covering layers lo..hi inclusive. */
export function layerSegments(tp: Toolpath, lo: number, hi: number): [number, number] {
  const last = Math.max(0, tp.layerCount - 1)
  const l = Math.min(Math.max(0, lo), last)
  const h = Math.min(Math.max(l, hi), last)
  return [tp.layerStart[l], tp.layerStart[h + 1]]
}

export interface SimState {
  /** Segments [a, drawEnd) are drawn; the last one may be partly travelled. */
  drawEnd: number
  /** Seconds since the start of the shown range, and the range's total. */
  time: number
  total: number
  /** Tool head position. */
  pos: [number, number, number]
}

/** Position of the tool head at progress p (0..1) through the time of segments [a, b). */
export function simulate(tp: Toolpath, est: Estimate, a: number, b: number, p: number): SimState {
  if (b <= a) return { drawEnd: a, time: 0, total: 0, pos: [0, 0, 0] }
  const tA = a > 0 ? est.end[a - 1] : 0
  const tB = est.end[b - 1]
  const total = tB - tA
  const t = tA + Math.min(1, Math.max(0, p)) * total
  const k = Math.min(b - 1, upperBound(est.end, t, a, b))
  const d = est.dur[k]
  const startT = est.end[k] - d
  const f = d > 0 ? Math.min(1, Math.max(0, (t - startT) / d)) : 1
  const i = k * 6
  const pos: [number, number, number] = [0, 1, 2].map((c) => tp.pos[i + c] + (tp.pos[i + 3 + c] - tp.pos[i + c]) * f) as [number, number, number]
  return { drawEnd: Math.min(b, k + 1), time: t - tA, total, pos }
}
