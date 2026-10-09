import type { Settings } from '../lib/settings'
import type { T } from '../i18n'
import NumberField from './NumberField'

interface Props {
  s: Settings
  t: T
  onChange: (patch: Partial<Settings>) => void
}

export default function SettingsPanel({ s, t, onChange }: Props) {
  return (
    <div className="section">
      <h3>{t('Settings')}</h3>
      <div className="grid2">
        <div className="field">
          <label>
            {t('Language')}
            <select value={s.lang} onChange={(e) => onChange({ lang: e.target.value as Settings['lang'] })}>
              <option value="en">English</option>
              <option value="uk">Українська</option>
            </select>
          </label>
        </div>
        <div className="field">
          <label>
            {t('Theme')}
            <select value={s.theme} onChange={(e) => onChange({ theme: e.target.value as Settings['theme'] })}>
              <option value="auto">{t('System')}</option>
              <option value="light">{t('Light')}</option>
              <option value="dark">{t('Dark')}</option>
            </select>
          </label>
        </div>
      </div>
      <h3 className="sub">{t('Time model')}</h3>
      <div className="grid2">
        <NumberField label={t('Acceleration')} unit="mm/s²" value={s.accel} min={10} max={100000} onChange={(v) => v !== null && onChange({ accel: v })} />
        <NumberField label={t('Corner speed (jerk)')} unit="mm/s" value={s.jerk} min={0} max={500} onChange={(v) => v !== null && onChange({ jerk: v })} />
        <NumberField label={t('Max speed')} unit="mm/s" value={s.maxSpeed} min={1} max={5000} onChange={(v) => v !== null && onChange({ maxSpeed: v })} />
        <NumberField label={t('CNC rapid speed')} unit="mm/s" value={s.rapidSpeed} min={1} max={5000} onChange={(v) => v !== null && onChange({ rapidSpeed: v })} />
      </div>
      <p className="hint">{t('M204 in the file overrides the acceleration.')}</p>
      <h3 className="sub">{t('Filament')}</h3>
      <div className="grid2">
        <NumberField label={t('Diameter')} unit="mm" value={s.filamentDiameter} placeholder={t('auto')} nullable min={0.5} max={5} onChange={(v) => onChange({ filamentDiameter: v })} />
        <NumberField label={t('Density')} unit="g/cm³" value={s.filamentDensity} placeholder={t('auto')} nullable min={0.1} max={30} onChange={(v) => onChange({ filamentDensity: v })} />
      </div>
      <p className="hint">{t('Empty = from the file, else 1.75 mm and 1.24 g/cm³ (PLA).')}</p>
    </div>
  )
}
