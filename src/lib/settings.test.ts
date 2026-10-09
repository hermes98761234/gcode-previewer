import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from './settings'

const mem = () => {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
}

describe('settings', () => {
  it('round-trips through storage', () => {
    const s = mem()
    saveSettings({ ...DEFAULT_SETTINGS, theme: 'dark', accel: 2500, filamentDiameter: 2.85, showTravel: true }, s)
    const back = loadSettings(s)
    expect(back.theme).toBe('dark')
    expect(back.accel).toBe(2500)
    expect(back.filamentDiameter).toBe(2.85)
    expect(back.showTravel).toBe(true)
  })
  it('falls back per field on bad data', () => {
    const s = mem()
    s.setItem('gcode-previewer:settings:v1', JSON.stringify({ theme: 'neon', accel: -4, color: 'speed' }))
    const back = loadSettings(s)
    expect(back.theme).toBe('auto')
    expect(back.accel).toBe(DEFAULT_SETTINGS.accel)
    expect(back.color).toBe('speed')
    s.setItem('gcode-previewer:settings:v1', '{oops')
    expect(loadSettings(s).theme).toBe('auto')
  })
  it('defaults to Ukrainian for Ukrainian browsers', () => {
    expect(loadSettings(mem(), 'uk-UA').lang).toBe('uk')
    expect(loadSettings(mem(), 'en-US').lang).toBe('en')
  })
})
