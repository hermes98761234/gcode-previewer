import { describe, expect, it } from 'vitest'
import { interpolateArc, type Vec3 } from './arc'

const len = (pts: Vec3[], start: Vec3) => {
  let prev = start
  let l = 0
  for (const p of pts) {
    l += Math.hypot(p[0] - prev[0], p[1] - prev[1], p[2] - prev[2])
    prev = p
  }
  return l
}

describe('interpolateArc', () => {
  it('flattens a CCW quarter circle (I/J form) onto the circle', () => {
    const start: Vec3 = [10, 0, 0]
    const pts = interpolateArc(start, [0, 10, 0], { ijk: [-10, 0, 0] }, false, 'XY')
    expect(pts.length).toBeGreaterThan(8)
    for (const p of pts) expect(Math.hypot(p[0], p[1])).toBeCloseTo(10, 6)
    expect(pts.at(-1)).toEqual([0, 10, 0])
    // chord polyline is slightly shorter than the true arc length, within tolerance
    expect(len(pts, start)).toBeCloseTo((Math.PI * 10) / 2, 1)
    // CCW from +X to +Y passes through the first quadrant
    expect(pts[0][1]).toBeGreaterThan(0)
  })

  it('goes the long way round for a CW arc between the same points', () => {
    const start: Vec3 = [10, 0, 0]
    const pts = interpolateArc(start, [0, 10, 0], { ijk: [-10, 0, 0] }, true, 'XY')
    expect(len(pts, start)).toBeCloseTo(((Math.PI * 10) * 3) / 2, 1)
    expect(pts[0][1]).toBeLessThan(0)
  })

  it('draws a full circle when start equals end', () => {
    const start: Vec3 = [5, 0, 0]
    const pts = interpolateArc(start, [5, 0, 0], { ijk: [-5, 0, 0] }, true, 'XY')
    expect(len(pts, start)).toBeCloseTo(2 * Math.PI * 5, 1)
  })

  it('R form matches the I/J form, and negative R selects the major arc', () => {
    const start: Vec3 = [0, 0, 0]
    const end: Vec3 = [10, 10, 0]
    const ij = interpolateArc(start, end, { ijk: [0, 10, 0] }, false, 'XY')
    const r = interpolateArc(start, end, { ijk: [0, 0, 0], r: 10 }, false, 'XY')
    // CCW minor arc (0,0) -> (10,10) with R=10 has its centre at (0,10)
    expect(len(r, start)).toBeCloseTo(len(ij, start), 1)
    const major = interpolateArc(start, end, { ijk: [0, 0, 0], r: -10 }, false, 'XY')
    expect(len(major, start)).toBeCloseTo(1.5 * Math.PI * 10, 1)
  })

  it('interpolates the helical axis linearly', () => {
    const pts = interpolateArc([10, 0, 0], [-10, 0, -4], { ijk: [-10, 0, 0] }, false, 'XY')
    expect(pts.at(-1)![2]).toBeCloseTo(-4)
    const mid = pts[Math.floor(pts.length / 2) - 1]
    expect(mid[2]).toBeLessThan(0)
    expect(mid[2]).toBeGreaterThan(-4)
  })

  it('uses the right axes for G18 (ZX) and G19 (YZ)', () => {
    // G18: centre offset K (Z) and I (X). Start (x=10,z=0), end (x=0,z=10): CCW means Z then X angle increases.
    const xz = interpolateArc([0, 5, 10], [10, 5, 0], { ijk: [0, 0, -10] }, false, 'XZ')
    for (const p of xz) {
      expect(p[1]).toBeCloseTo(5)
      expect(Math.hypot(p[0], p[2])).toBeCloseTo(10, 6)
    }
    const yz = interpolateArc([5, 10, 0], [5, 0, 10], { ijk: [0, -10, 0] }, false, 'YZ')
    for (const p of yz) {
      expect(p[0]).toBeCloseTo(5)
      expect(Math.hypot(p[1], p[2])).toBeCloseTo(10, 6)
    }
  })

  it('uses more segments for a tighter tolerance', () => {
    const a = interpolateArc([10, 0, 0], [0, 10, 0], { ijk: [-10, 0, 0] }, false, 'XY', 0.1)
    const b = interpolateArc([10, 0, 0], [0, 10, 0], { ijk: [-10, 0, 0] }, false, 'XY', 0.001)
    expect(b.length).toBeGreaterThan(a.length)
  })
})
