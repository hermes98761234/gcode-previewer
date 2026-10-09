import { describe, expect, it } from 'vitest'
import { buildColors, gradient, hexToRgb, speedRange } from './color'
import { estimate } from './estimator'
import { F, FEATURE_COLORS } from './features'
import { parseGCode } from './parser'
import { layerSegments, lowerBound, simulate, upperBound } from './sim'

describe('bounds', () => {
  it('lowerBound / upperBound', () => {
    const a = [1, 2, 2, 2, 5]
    expect(lowerBound(a, 2)).toBe(1)
    expect(upperBound(a, 2)).toBe(4)
    expect(lowerBound(a, 9)).toBe(5)
    expect(upperBound(a, 0)).toBe(0)
  })
})

describe('simulate', () => {
  const tp = parseGCode('G1 Z0.2 F6000\nG1 X100 E1\nG1 Z0.4\nG1 X0 E2\n')
  const est = estimate(tp, { accel: 1e9, jerk: 1e9, maxSpeed: 1000, rapidSpeed: 100 })
  it('maps layers to segment ranges', () => {
    expect(tp.layerCount).toBe(2)
    expect(layerSegments(tp, 0, 0)).toEqual([0, 3])
    expect(layerSegments(tp, 0, 1)).toEqual([0, 4])
    expect(layerSegments(tp, 1, 1)).toEqual([3, 4])
  })
  it('places the head at the start, middle and end of a range', () => {
    const [a, b] = layerSegments(tp, 0, 1)
    expect(simulate(tp, est, a, b, 0).pos[0]).toBeCloseTo(0, 5)
    const end = simulate(tp, est, a, b, 1)
    expect(end.pos[0]).toBeCloseTo(0, 4)
    expect(end.time).toBeCloseTo(est.total, 4)
    const mid = simulate(tp, est, 1, 2, 0.5)
    expect(mid.pos[0]).toBeCloseTo(50, 3)
    expect(mid.drawEnd).toBe(2)
  })
})

describe('colors', () => {
  it('gradient hits blue at 0 and red at 1', () => {
    expect(gradient(0)).toEqual([59, 76, 192])
    expect(gradient(1)).toEqual([225, 60, 40])
  })
  it('colours by feature and by speed', () => {
    const t = parseGCode(';TYPE:Skirt\nG1 X10 E1 F600\n;TYPE:Support\nG1 X20 E2 F6000\n')
    const feat = buildColors(t, 'feature')
    expect(Array.from(feat.subarray(0, 3))).toEqual(hexToRgb(FEATURE_COLORS[F.Skirt]))
    expect(speedRange(t)).toEqual([10, 100])
    const sp = buildColors(t, 'speed')
    expect(Array.from(sp.subarray(0, 3))).toEqual(gradient(0))
    expect(Array.from(sp.subarray(6, 9))).toEqual(gradient(1))
  })
})
