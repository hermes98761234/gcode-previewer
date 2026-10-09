import { useMemo } from 'react'
import { filamentWeight, formatDuration, type Estimate } from '../lib/estimator'
import { F, FEATURE_COLORS, FEATURE_NAMES } from '../lib/features'
import { fmtNum, formatBytes, formatLong } from '../lib/format'
import { DEFAULT_FILAMENT_DENSITY, DEFAULT_FILAMENT_DIAMETER, type Settings } from '../lib/settings'
import type { Toolpath } from '../lib/toolpath'
import type { T } from '../i18n'

interface Props {
  name: string
  tp: Toolpath
  est: Estimate
  settings: Settings
  t: T
}

export default function Stats({ name, tp, est, settings, t }: Props) {
  const units = { h: t('h'), min: t('min'), s: t('s') }
  const dia = settings.filamentDiameter ?? tp.meta.filamentDiameter ?? DEFAULT_FILAMENT_DIAMETER
  const dens = settings.filamentDensity ?? tp.meta.filamentDensity ?? DEFAULT_FILAMENT_DENSITY
  const weight = filamentWeight(est.filament, dia, dens)
  const b = tp.bounds
  const printer = tp.meta.machine === 'printer'
  const rows = useMemo(() => {
    const out: { id: number; time: number }[] = []
    for (let i = 0; i < est.byFeature.length; i++) if (est.byFeature[i] > 0.0005) out.push({ id: i, time: est.byFeature[i] })
    return out.sort((a, c) => c.time - a.time)
  }, [est])
  const maxT = rows.length ? rows[0].time : 1
  const dim = (a: number) => `${fmtNum(b.min[a], 2)} … ${fmtNum(b.max[a], 2)}  (${fmtNum(b.max[a] - b.min[a], 2)})`

  return (
    <div className="box stats">
      <h3>{t('Statistics')}</h3>
      <div className="stat-grid">
        <div className="stat">
          <span className="stat-label">{t('Estimated time')}</span>
          <span className="stat-value">{formatLong(est.total, units)}</span>
          <span className="hint">
            {formatDuration(est.total)}
            {tp.meta.slicerEstimate ? ` · ${t('slicer says {0}', formatLong(tp.meta.slicerEstimate, units))}` : ''}
          </span>
        </div>
        {printer && (
          <div className="stat">
            <span className="stat-label">{t('Filament')}</span>
            <span className="stat-value">{fmtNum(est.filament / 1000, 2)} m</span>
            <span className="hint">
              {fmtNum(weight, 1)} g · Ø{dia} mm · {dens} g/cm³
            </span>
          </div>
        )}
        <div className="stat">
          <span className="stat-label">{t('Layers')}</span>
          <span className="stat-value">{tp.layerCount}</span>
          <span className="hint">{t(printer ? '{0} segments' : '{0} moves', tp.count.toLocaleString())}</span>
        </div>
        <div className="stat">
          <span className="stat-label">{printer ? t('Print path') : t('Cutting path')}</span>
          <span className="stat-value">{fmtNum(est.printLength / 1000, 2)} m</span>
          <span className="hint">{t('travel {0} m', fmtNum(est.travelLength / 1000, 2))}</span>
        </div>
      </div>
      <table className="data">
        <tbody>
          <tr>
            <td>{t('File')}</td>
            <td>
              {name} · {formatBytes(tp.meta.bytes)} · {tp.meta.lines.toLocaleString()} {t('lines')}
            </td>
          </tr>
          <tr>
            <td>{t('Source')}</td>
            <td>
              {tp.meta.slicer ? `${tp.meta.slicer}${tp.meta.slicerVersion ? ' ' + tp.meta.slicerVersion : ''}` : t('Unknown slicer')} · {printer ? t('3D printer') : t('CNC / plotter')}
              {tp.meta.usesInches ? ` · ${t('inches')}` : ''}
            </td>
          </tr>
          <tr>
            <td>X (mm)</td>
            <td>{dim(0)}</td>
          </tr>
          <tr>
            <td>Y (mm)</td>
            <td>{dim(1)}</td>
          </tr>
          <tr>
            <td>Z (mm)</td>
            <td>{dim(2)}</td>
          </tr>
        </tbody>
      </table>
      <h3 className="sub">{t('Time per feature')}</h3>
      <table className="data feat">
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                <span className="swatch" style={{ background: FEATURE_COLORS[r.id] }} /> {t(FEATURE_NAMES[r.id] ?? 'Other')}
              </td>
              <td className="barcell">
                <span className="bar" style={{ width: `${Math.max(2, (r.time / maxT) * 100)}%`, background: FEATURE_COLORS[r.id], opacity: r.id === F.Travel ? 0.5 : 1 }} />
              </td>
              <td className="num">{formatLong(r.time, units)}</td>
              <td className="num">{est.total > 0 ? fmtNum((r.time / est.total) * 100, 1) : '0'}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
