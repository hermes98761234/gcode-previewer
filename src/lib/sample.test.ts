import { describe, expect, it } from 'vitest'
import { estimate } from './estimator'
import { F } from './features'
import { parseGCode } from './parser'
import { sampleCnc, sampleVase } from './sample'

describe('samples', () => {
  it('vase parses as a PrusaSlicer printer file with 200 layers', () => {
    const tp = parseGCode(sampleVase())
    expect(tp.meta.slicer).toBe('PrusaSlicer')
    expect(tp.meta.machine).toBe('printer')
    expect(tp.layerCount).toBe(200)
    expect(tp.bounds.max[2]).toBeCloseTo(40, 1)
    const types = new Set(tp.type)
    expect(types.has(F.OuterWall) && types.has(F.InnerWall) && types.has(F.Skin) && types.has(F.Skirt)).toBe(true)
    const e = estimate(tp)
    expect(e.total).toBeGreaterThan(600)
    expect(e.filament).toBeGreaterThan(1000)
  })

  it('cnc job parses with arcs, three pocket passes and cutting depth', () => {
    const tp = parseGCode(sampleCnc())
    expect(tp.meta.machine).toBe('cnc')
    expect(tp.bounds.min[2]).toBeCloseTo(-7.5 - 0, 0)
    expect(tp.layerCount).toBeGreaterThanOrEqual(3)
    expect(tp.type.includes(F.Cut)).toBe(true)
    expect(estimate(tp).total).toBeGreaterThan(30)
  })
})
