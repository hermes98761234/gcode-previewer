import { describe, expect, it } from 'vitest'
import { estimate, filamentWeight, formatDuration, trapezoidTime } from './estimator'
import { F } from './features'
import { parseGCode } from './parser'

const cfg = { accel: 1000, jerk: 8, maxSpeed: 500, rapidSpeed: 100 }

describe('trapezoidTime', () => {
  it('matches the textbook trapezoid: 100 mm at 100 mm/s with 1000 mm/s²', () => {
    // 0.1 s ramp each way covering 5 mm each, 90 mm cruise = 0.9 s
    expect(trapezoidTime(100, 0, 0, 100, 1000)).toBeCloseTo(1.1, 9)
  })
  it('uses a triangle profile on short moves: 2·sqrt(d/a)', () => {
    expect(trapezoidTime(1, 0, 0, 100, 1000)).toBeCloseTo(2 * Math.sqrt(1 / 1000), 9)
  })
  it('is distance / speed with no acceleration limit', () => {
    expect(trapezoidTime(50, 0, 0, 25, 0)).toBeCloseTo(2)
  })
  it('handles a non-zero entry speed', () => {
    // from 50 to 50 cruising: pure distance / speed
    expect(trapezoidTime(10, 50, 50, 50, 1000)).toBeCloseTo(0.2)
  })
})

describe('estimate', () => {
  it('times a single 100 mm move at F6000', () => {
    const tp = parseGCode('G1 X100 F6000\n')
    const e = estimate(tp, cfg)
    expect(e.total).toBeCloseTo(1.1, 4)
    expect(e.end[0]).toBeCloseTo(1.1, 4)
  })

  it('does not stop at collinear joints', () => {
    const one = estimate(parseGCode('G1 X100 F6000\n'), cfg).total
    const two = estimate(parseGCode('G1 X50 F6000\nG1 X100\n'), cfg).total
    expect(two).toBeCloseTo(one, 3)
  })

  it('slows down for a 90 degree corner', () => {
    const straight = estimate(parseGCode('G1 X50 F6000\nG1 X100\n'), cfg).total
    const corner = estimate(parseGCode('G1 X50 F6000\nG1 Y50\n'), cfg).total
    expect(corner).toBeGreaterThan(straight)
  })

  it('uses M204 acceleration from the file', () => {
    const slow = estimate(parseGCode('M204 S250\nG1 X100 F6000\n'), cfg).total
    // 0.4 s ramps (20 mm each), 60 mm cruise 0.6 s
    expect(slow).toBeCloseTo(1.4, 4)
  })

  it('adds dwell time', () => {
    const e = estimate(parseGCode('G4 P1500\nG1 X100 F6000\n'), cfg)
    expect(e.total).toBeCloseTo(1.5 + 1.1, 4)
  })

  it('accounts per feature and sums net filament', () => {
    const tp = parseGCode(';TYPE:Perimeter\nG1 X10 E1 F3000\n;TYPE:Skirt\nG1 X20 E2\nG1 E1.5 F1800\nG1 X30 F6000\n')
    const e = estimate(tp, cfg)
    expect(e.byFeature[F.InnerWall]).toBeGreaterThan(0)
    expect(e.byFeature[F.Travel]).toBeGreaterThan(0)
    expect(e.filament).toBeCloseTo(1.5)
    let sum = 0
    for (const v of e.byFeature) sum += v
    expect(sum).toBeCloseTo(e.total, 4)
  })

  it('moves CNC rapids at the rapid speed', () => {
    const e = estimate(parseGCode('G0 X100\n'), cfg)
    expect(e.total).toBeCloseTo(trapezoidTime(100, 0, 0, 100, 1000), 4)
  })
})

describe('helpers', () => {
  it('computes filament weight (1 m of 1.75 mm PLA is about 2.98 g)', () => {
    expect(filamentWeight(1000, 1.75, 1.24)).toBeCloseTo(2.98, 2)
  })
  it('formats durations', () => {
    expect(formatDuration(65)).toBe('1:05')
    expect(formatDuration(3723)).toBe('1:02:03')
  })
})
