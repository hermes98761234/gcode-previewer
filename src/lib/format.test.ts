import { describe, expect, it } from 'vitest'
import { fmtNum, formatBytes, formatLong } from './format'

const u = { h: 'h', min: 'min', s: 's' }
describe('format', () => {
  it('formats durations', () => {
    expect(formatLong(35, u)).toBe('35 s')
    expect(formatLong(247, u)).toBe('4 min 07 s')
    expect(formatLong(3720, u)).toBe('1 h 02 min')
  })
  it('formats sizes and numbers', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(52428800)).toBe('50.0 MB')
    expect(fmtNum(-0.001, 1)).toBe('0.0')
    expect(fmtNum(12.345, 2)).toBe('12.35')
  })
})
