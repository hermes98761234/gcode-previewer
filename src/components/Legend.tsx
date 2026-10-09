import { useMemo } from 'react'
import { gradient, rgbCss, speedRange, TOOL_COLORS, type ColorMode } from '../lib/color'
import { FEATURE_COLORS, FEATURE_NAMES } from '../lib/features'
import { FLAG, isTravel, type Toolpath } from '../lib/toolpath'
import type { T } from '../i18n'

export default function Legend({ tp, mode, t }: { tp: Toolpath; mode: ColorMode; t: T }) {
  const info = useMemo(() => {
    const feats = new Set<number>()
    const tools = new Set<number>()
    for (let i = 0; i < tp.count; i++) {
      const fl = tp.flags[i]
      if (fl & (FLAG.EOnly | FLAG.Dwell) || isTravel(fl, tp.meta.machine)) continue
      feats.add(tp.type[i])
      tools.add(tp.tool[i])
    }
    return { feats: [...feats].sort((a, b) => a - b), tools: [...tools].sort((a, b) => a - b), speed: speedRange(tp) }
  }, [tp])
  const ramp = `linear-gradient(90deg, ${[0, 0.25, 0.5, 0.75, 1].map((q) => rgbCss(gradient(q))).join(', ')})`

  if (mode === 'feature') {
    return (
      <ul className="legend">
        {info.feats.map((f) => (
          <li key={f}>
            <span className="swatch" style={{ background: FEATURE_COLORS[f] }} /> {t(FEATURE_NAMES[f] ?? 'Other')}
          </li>
        ))}
      </ul>
    )
  }
  if (mode === 'tool') {
    return (
      <ul className="legend">
        {info.tools.map((k) => (
          <li key={k}>
            <span className="swatch" style={{ background: TOOL_COLORS[k % TOOL_COLORS.length] }} /> {t('Tool {0}', k)}
          </li>
        ))}
      </ul>
    )
  }
  const [a, b] = mode === 'speed' ? info.speed : [1, Math.max(1, tp.layerCount)]
  return (
    <div className="ramp">
      <div className="ramp-bar" style={{ background: ramp }} />
      <div className="ramp-labels">
        <span>{mode === 'speed' ? `${Math.round(a * 60)} mm/min` : `${a}`}</span>
        <span>{mode === 'speed' ? `${Math.round(b * 60)} mm/min` : `${b}`}</span>
      </div>
    </div>
  )
}
