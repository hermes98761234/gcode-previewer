export type Vec3 = [number, number, number]
export type Plane = 'XY' | 'XZ' | 'YZ'

/** Plane axes (first, second, helical) as indices into [x, y, z], and the I/J/K offset indices for the first two. */
const PLANE_AXES: Record<Plane, { a: number; b: number; h: number }> = {
  // G17: X then Y, normal +Z. G18: Z then X, normal +Y. G19: Y then Z, normal +X.
  XY: { a: 0, b: 1, h: 2 },
  XZ: { a: 2, b: 0, h: 1 },
  YZ: { a: 1, b: 2, h: 0 },
}

export interface ArcParams {
  /** Centre offsets from the start point, indexed by axis: [I, J, K]. Unset axes are 0. */
  ijk: Vec3
  /** Radius form. When set (and not NaN) it wins over I/J/K. Negative selects the major arc. */
  r?: number
}

/**
 * Interpolates a G2/G3 arc into points (start excluded, end included).
 * Handles I/J/K and R forms, G17/G18/G19 planes, helical motion on the third axis and full circles.
 * `tol` is the maximum chord deviation in mm.
 */
export function interpolateArc(start: Vec3, end: Vec3, p: ArcParams, clockwise: boolean, plane: Plane, tol = 0.02): Vec3[] {
  const { a, b, h } = PLANE_AXES[plane]
  const sa = start[a], sb = start[b]
  const ea = end[a], eb = end[b]
  let ca: number, cb: number
  if (p.r !== undefined && !Number.isNaN(p.r)) {
    const dx = ea - sa, dy = eb - sb
    const d = Math.hypot(dx, dy)
    if (d < 1e-9) return [end]
    const r = Math.abs(p.r)
    const hh = Math.sqrt(Math.max(0, r * r - (d / 2) * (d / 2)))
    // Centre lies left of the chord for CCW minor arcs and right for CW; a negative R flips to the major arc.
    const side = (clockwise ? -1 : 1) * (p.r >= 0 ? 1 : -1)
    ca = sa + dx / 2 + (side * hh * -dy) / d
    cb = sb + dy / 2 + (side * hh * dx) / d
  } else {
    ca = sa + p.ijk[a]
    cb = sb + p.ijk[b]
  }
  const r0 = Math.hypot(sa - ca, sb - cb)
  const r1 = Math.hypot(ea - ca, eb - cb)
  if (r0 < 1e-9) return [end]
  const a0 = Math.atan2(sb - cb, sa - ca)
  const a1 = Math.atan2(eb - cb, ea - ca)
  let sweep = a1 - a0
  if (clockwise) {
    if (sweep >= -1e-9) sweep -= 2 * Math.PI
  } else if (sweep <= 1e-9) sweep += 2 * Math.PI
  const rm = Math.max(r0, r1)
  const step = rm <= tol ? Math.PI / 2 : 2 * Math.acos(Math.max(0, 1 - tol / rm))
  const n = Math.min(4000, Math.max(1, Math.ceil(Math.abs(sweep) / Math.max(step, 0.005))))
  const out: Vec3[] = []
  for (let i = 1; i <= n; i++) {
    if (i === n) {
      out.push([end[0], end[1], end[2]])
      break
    }
    const f = i / n
    const ang = a0 + sweep * f
    const r = r0 + (r1 - r0) * f
    const pt: Vec3 = [0, 0, 0]
    pt[a] = ca + r * Math.cos(ang)
    pt[b] = cb + r * Math.sin(ang)
    pt[h] = start[h] + (end[h] - start[h]) * f
    out.push(pt)
  }
  return out
}
