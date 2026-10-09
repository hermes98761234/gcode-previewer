import { FEATURE_COUNT, F } from './features'
import { FLAG, type Toolpath } from './toolpath'

export interface EstimatorConfig {
  /** Acceleration used when the file never sets one with M204, mm/s². */
  accel: number
  /** Corner speed change that needs no slowdown ("classic jerk"), mm/s. */
  jerk: number
  /** Hard cap on any move's speed, mm/s. */
  maxSpeed: number
  /** Speed of G0 rapids on a CNC machine, mm/s. */
  rapidSpeed: number
}

export const DEFAULT_ESTIMATOR: EstimatorConfig = { accel: 1000, jerk: 8, maxSpeed: 500, rapidSpeed: 83 }

/**
 * Time to cover `dist` starting at speed v0, ending at v1, cruising at most at vmax, with constant acceleration `a`.
 * v0 and v1 must already be reachable within `dist` (|v1² − v0²| ≤ 2·a·dist).
 */
export function trapezoidTime(dist: number, v0: number, v1: number, vmax: number, a: number): number {
  if (dist <= 0) return 0
  if (a <= 0 || !Number.isFinite(a)) return vmax > 0 ? dist / vmax : 0
  const vm = Math.max(vmax, v0, v1)
  if (vm <= 0) return 0
  const dAcc = (vm * vm - v0 * v0) / (2 * a)
  const dDec = (vm * vm - v1 * v1) / (2 * a)
  if (dAcc + dDec <= dist) {
    return (vm - v0) / a + (vm - v1) / a + (dist - dAcc - dDec) / vm
  }
  // Triangle profile: never reaches vmax.
  const vp = Math.sqrt(Math.max(0, (2 * a * dist + v0 * v0 + v1 * v1) / 2))
  return (vp - v0) / a + (vp - v1) / a
}

export interface Estimate {
  /** Duration of each segment, seconds. */
  dur: Float32Array
  /** Cumulative time at the end of each segment. */
  end: Float32Array
  total: number
  /** Time per feature id (index F.Travel holds all non-printing moves), seconds. */
  byFeature: Float64Array
  /** Net filament length pushed, mm. */
  filament: number
  /** Length of path travelled while printing / cutting, mm. */
  printLength: number
  travelLength: number
}

/**
 * Estimates motion time with a look-ahead planner: junction speeds from the classic jerk rule,
 * a backward and forward pass to keep every move's entry/exit speed reachable under its acceleration,
 * then a trapezoid per move.
 */
export function estimate(tp: Toolpath, cfg: EstimatorConfig = DEFAULT_ESTIMATOR): Estimate {
  const n = tp.count
  const dur = new Float32Array(n)
  const end = new Float32Array(n)
  const byFeature = new Float64Array(FEATURE_COUNT)
  const cnc = tp.meta.machine === 'cnc'
  const len = new Float32Array(n)
  const vmax = new Float32Array(n)
  const acc = new Float32Array(n)
  const dir = new Float32Array(n * 3)
  const pos = tp.pos
  let printLength = 0
  let travelLength = 0
  let filament = 0

  for (let i = 0; i < n; i++) {
    const fl = tp.flags[i]
    filament += fl & FLAG.Dwell ? 0 : tp.ext[i]
    acc[i] = tp.accel[i] > 0 ? tp.accel[i] : cfg.accel
    if (fl & FLAG.Dwell) continue
    let v = tp.feed[i]
    if (fl & FLAG.EOnly) {
      len[i] = Math.abs(tp.ext[i])
    } else {
      const p = i * 6
      const dx = pos[p + 3] - pos[p]
      const dy = pos[p + 4] - pos[p + 1]
      const dz = pos[p + 5] - pos[p + 2]
      const l = Math.sqrt(dx * dx + dy * dy + dz * dz)
      len[i] = l
      if (l > 0) {
        dir[i * 3] = dx / l
        dir[i * 3 + 1] = dy / l
        dir[i * 3 + 2] = dz / l
      }
      if (cnc && fl & FLAG.Rapid) v = cfg.rapidSpeed
      const travel = fl & FLAG.Rapid || (!cnc && fl & FLAG.Feed)
      if (travel) travelLength += l
      else printLength += l
    }
    vmax[i] = Math.min(v > 0 ? v : 20, cfg.maxSpeed)
  }

  // Junction speeds: entry[i] is the speed at the start of move i, entry[n] = 0 at the end.
  const entry = new Float32Array(n + 1)
  for (let i = 1; i < n; i++) {
    const a = i - 1
    if (len[a] === 0 || len[i] === 0 || (tp.flags[a] | tp.flags[i]) & (FLAG.EOnly | FLAG.Dwell)) {
      entry[i] = 0
      continue
    }
    const va = vmax[a], vb = vmax[i]
    const dvx = va * dir[a * 3] - vb * dir[i * 3]
    const dvy = va * dir[a * 3 + 1] - vb * dir[i * 3 + 1]
    const dvz = va * dir[a * 3 + 2] - vb * dir[i * 3 + 2]
    const dv = Math.sqrt(dvx * dvx + dvy * dvy + dvz * dvz)
    const vm = Math.min(va, vb)
    entry[i] = dv <= cfg.jerk ? vm : Math.max(0, vm * (cfg.jerk / dv))
  }
  // Backward pass: the exit speed must allow braking to the next entry.
  for (let i = n - 1; i >= 0; i--) {
    const reach = Math.sqrt(entry[i + 1] * entry[i + 1] + 2 * acc[i] * len[i])
    if (entry[i] > reach) entry[i] = reach
  }
  // Forward pass: the exit speed cannot exceed what acceleration from the entry allows.
  for (let i = 0; i < n; i++) {
    const reach = Math.sqrt(entry[i] * entry[i] + 2 * acc[i] * len[i])
    if (entry[i + 1] > reach) entry[i + 1] = reach
  }

  let t = 0
  for (let i = 0; i < n; i++) {
    const fl = tp.flags[i]
    let d: number
    if (fl & FLAG.Dwell) d = tp.ext[i]
    else d = trapezoidTime(len[i], entry[i], entry[i + 1], vmax[i], acc[i])
    dur[i] = d
    t += d
    end[i] = t
    const travel = fl & FLAG.Rapid || (!cnc && fl & FLAG.Feed) || fl & (FLAG.EOnly | FLAG.Dwell)
    byFeature[travel ? F.Travel : tp.type[i]] += d
  }
  return { dur, end, total: t, byFeature, filament, printLength, travelLength }
}

/** Filament mass in grams for a length in mm, diameter in mm and density in g/cm³. */
export function filamentWeight(lengthMm: number, diameterMm: number, densityGcm3: number): number {
  const r = diameterMm / 2
  const volumeMm3 = Math.PI * r * r * lengthMm
  return (volumeMm3 / 1000) * densityGcm3
}

export function formatDuration(sec: number): string {
  if (!Number.isFinite(sec)) return '–'
  const s = Math.round(sec)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
  return `${m}:${String(r).padStart(2, '0')}`
}
