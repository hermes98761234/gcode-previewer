import { FEATURE_COLORS, F } from './features'
import { FLAG, type Toolpath } from './toolpath'

export type ColorMode = 'feature' | 'speed' | 'layer' | 'tool'
export type RGB = [number, number, number]

export const hexToRgb = (hex: string): RGB => {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export const TOOL_COLORS = ['#38bdf8', '#f97316', '#a3e635', '#e879f9', '#facc15', '#2dd4bf', '#fb7185', '#a78bfa']

const STOPS: RGB[] = [
  [59, 76, 192],
  [48, 160, 220],
  [60, 190, 110],
  [240, 220, 50],
  [225, 60, 40],
]

/** Blue → cyan → green → yellow → red ramp for t in 0..1. */
export function gradient(t: number): RGB {
  const x = Math.min(1, Math.max(0, t)) * (STOPS.length - 1)
  const i = Math.min(STOPS.length - 2, Math.floor(x))
  const f = x - i
  const a = STOPS[i], b = STOPS[i + 1]
  return [Math.round(a[0] + (b[0] - a[0]) * f), Math.round(a[1] + (b[1] - a[1]) * f), Math.round(a[2] + (b[2] - a[2]) * f)]
}

export const rgbCss = (c: RGB) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`

/** Min / max feed (mm/s) over the printing or cutting segments. */
export function speedRange(tp: Toolpath): [number, number] {
  let lo = Infinity
  let hi = -Infinity
  for (let i = 0; i < tp.count; i++) {
    const fl = tp.flags[i]
    if (!(fl & (FLAG.Extrude | FLAG.Feed)) || (tp.meta.machine === 'printer' && !(fl & FLAG.Extrude))) continue
    const v = tp.feed[i]
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  return lo <= hi ? [lo, hi] : [0, 1]
}

/** Per-vertex RGB bytes (6 per segment) for the chosen colouring. */
export function buildColors(tp: Toolpath, mode: ColorMode): Uint8Array {
  const out = new Uint8Array(tp.count * 6)
  const feat = Object.fromEntries(Object.entries(FEATURE_COLORS).map(([k, v]) => [k, hexToRgb(v)])) as Record<number, RGB>
  const tools = TOOL_COLORS.map(hexToRgb)
  const [vlo, vhi] = speedRange(tp)
  const span = vhi - vlo || 1
  const lastLayer = Math.max(1, tp.layerCount - 1)
  const cache = new Map<number, RGB>()
  for (let i = 0; i < tp.count; i++) {
    let c: RGB
    switch (mode) {
      case 'feature':
        c = feat[tp.type[i]] ?? feat[F.Unknown]
        break
      case 'speed': {
        const q = Math.round(((tp.feed[i] - vlo) / span) * 255)
        c = cache.get(q) ?? gradient(q / 255)
        cache.set(q, c)
        break
      }
      case 'layer': {
        const q = Math.round((tp.layer[i] / lastLayer) * 255)
        c = cache.get(q) ?? gradient(q / 255)
        cache.set(q, c)
        break
      }
      default:
        c = tools[tp.tool[i] % tools.length]
    }
    const o = i * 6
    out[o] = out[o + 3] = c[0]
    out[o + 1] = out[o + 4] = c[1]
    out[o + 2] = out[o + 5] = c[2]
  }
  return out
}
