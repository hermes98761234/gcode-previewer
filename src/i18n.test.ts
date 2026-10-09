import { describe, expect, it } from 'vitest'
import { FEATURE_NAMES } from './lib/features'
import { tr, UK } from './i18n'

const holes = (s: string) => (s.match(/\{\d+\}/g) ?? []).sort().join()

describe('i18n', () => {
  it('keeps placeholders identical in both languages', () => {
    for (const [en, uk] of Object.entries(UK)) expect(holes(uk), en).toBe(holes(en))
  })
  it('translates every feature name', () => {
    for (const name of Object.values(FEATURE_NAMES)) expect(UK[name], name).toBeTruthy()
  })
  it('interpolates and falls back to English', () => {
    expect(tr('en', 'Layer {0} of {1} · Z {2} mm', 1, 5, '0.2')).toBe('Layer 1 of 5 · Z 0.2 mm')
    expect(tr('uk', 'Layer {0} of {1} · Z {2} mm', 1, 5, '0.2')).toBe('Шар 1 з 5 · Z 0.2 мм')
    expect(tr('uk', 'not in the dictionary')).toBe('not in the dictionary')
  })
})
