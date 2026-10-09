import type { ColorMode } from './color'
import { DEFAULT_ESTIMATOR, type EstimatorConfig } from './estimator'

export type Lang = 'en' | 'uk'
export type Theme = 'auto' | 'light' | 'dark'

export interface Settings {
  lang: Lang
  theme: Theme
  color: ColorMode
  showTravel: boolean
  /** null = take the value from the file, else the default. */
  filamentDiameter: number | null
  filamentDensity: number | null
  accel: number
  jerk: number
  maxSpeed: number
  rapidSpeed: number
}

export const DEFAULT_FILAMENT_DIAMETER = 1.75
export const DEFAULT_FILAMENT_DENSITY = 1.24

export const DEFAULT_SETTINGS: Settings = {
  lang: 'en',
  theme: 'auto',
  color: 'feature',
  showTravel: false,
  filamentDiameter: null,
  filamentDensity: null,
  ...DEFAULT_ESTIMATOR,
}

const KEY = 'gcode-previewer:settings:v1'

type Store = Pick<Storage, 'getItem' | 'setItem'>

const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : d)
const numOrNull = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null)

/** Reads settings, falling back field by field so a corrupt or old entry never breaks the app. */
export function loadSettings(store: Store | undefined = typeof localStorage === 'undefined' ? undefined : localStorage, browserLang = ''): Settings {
  const d = { ...DEFAULT_SETTINGS, lang: browserLang.toLowerCase().startsWith('uk') ? ('uk' as Lang) : ('en' as Lang) }
  let raw: Record<string, unknown> = {}
  try {
    const s = store?.getItem(KEY)
    if (s) raw = JSON.parse(s) as Record<string, unknown>
  } catch {
    return d
  }
  if (typeof raw !== 'object' || raw === null) return d
  const pick = <T extends string>(v: unknown, ok: readonly T[], def: T): T => (ok.includes(v as T) ? (v as T) : def)
  return {
    lang: pick(raw.lang, ['en', 'uk'], d.lang),
    theme: pick(raw.theme, ['auto', 'light', 'dark'], d.theme),
    color: pick(raw.color, ['feature', 'speed', 'layer', 'tool'], d.color),
    showTravel: typeof raw.showTravel === 'boolean' ? raw.showTravel : d.showTravel,
    filamentDiameter: numOrNull(raw.filamentDiameter, 0.5, 5),
    filamentDensity: numOrNull(raw.filamentDensity, 0.1, 30),
    accel: num(raw.accel, 10, 100000, d.accel),
    jerk: num(raw.jerk, 0, 500, d.jerk),
    maxSpeed: num(raw.maxSpeed, 1, 5000, d.maxSpeed),
    rapidSpeed: num(raw.rapidSpeed, 1, 5000, d.rapidSpeed),
  }
}

export function saveSettings(s: Settings, store: Store | undefined = typeof localStorage === 'undefined' ? undefined : localStorage): void {
  try {
    store?.setItem(KEY, JSON.stringify(s))
  } catch {
    /* storage full or blocked: settings just won't persist */
  }
}

export const estimatorConfig = (s: Settings): EstimatorConfig => ({ accel: s.accel, jerk: s.jerk, maxSpeed: s.maxSpeed, rapidSpeed: s.rapidSpeed })
