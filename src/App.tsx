import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { type ColorMode } from './lib/color'
import { estimate, formatDuration } from './lib/estimator'
import { fmtNum } from './lib/format'
import { SAMPLES, type SampleId } from './lib/sample'
import { estimatorConfig, loadSettings, saveSettings, type Settings } from './lib/settings'
import { layerSegments, simulate } from './lib/sim'
import { tr, type T } from './i18n'
import { useLoader } from './useLoader'
import Legend from './components/Legend'
import SettingsPanel from './components/SettingsPanel'
import Stats from './components/Stats'
import type { ViewCmd } from './components/Viewer'
import type { ViewName } from './viewer/scene'

const Viewer = lazy(() => import('./components/Viewer'))

type LayerMode = 'all' | 'single' | 'range'
const SPEEDS = [0, 1, 10, 60, 300, 1000, 5000]
const ACCEPT = '.gcode,.gco,.gc,.g,.nc,.ngc,.tap,.cnc,.ncc,.txt,text/plain'

export default function App() {
  const [settings, setSettings] = useState<Settings>(() => loadSettings(undefined, navigator.language))
  const t: T = (s, ...a) => tr(settings.lang, s, ...a)
  const update = (patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch }))

  const [cfg, setCfg] = useState(() => estimatorConfig(settings))
  useEffect(() => {
    const id = setTimeout(() => {
      const next = estimatorConfig(settings)
      setCfg((prev) => (prev.accel === next.accel && prev.jerk === next.jerk && prev.maxSpeed === next.maxSpeed && prev.rapidSpeed === next.rapidSpeed ? prev : next))
    }, 300)
    return () => clearTimeout(id)
  }, [settings])

  const { state, loaded, load, cancel } = useLoader()
  const est = useMemo(() => {
    if (!loaded) return null
    const c = loaded.cfg
    const same = c.accel === cfg.accel && c.jerk === cfg.jerk && c.maxSpeed === cfg.maxSpeed && c.rapidSpeed === cfg.rapidSpeed
    return same ? loaded.est : estimate(loaded.tp, cfg)
  }, [loaded, cfg])
  const tp = loaded?.tp ?? null

  useEffect(() => saveSettings(settings), [settings])
  useLayoutEffect(() => {
    const root = document.documentElement
    if (settings.theme === 'auto') delete root.dataset.theme
    else root.dataset.theme = settings.theme
    root.lang = settings.lang
  }, [settings.theme, settings.lang])

  // View state, reset whenever a new file arrives.
  const [layerMode, setLayerMode] = useState<LayerMode>('all')
  const [single, setSingle] = useState(0)
  const [rangeLo, setRangeLo] = useState(0)
  const [rangeHi, setRangeHi] = useState(0)
  const [simOn, setSimOn] = useState(false)
  const [p, setP] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(0)
  const [view, setView] = useState<ViewCmd>({ name: 'iso', n: 0 })
  const [seen, setSeen] = useState(loaded)
  if (loaded !== seen) {
    setSeen(loaded)
    setLayerMode('all')
    setSingle(0)
    setRangeLo(0)
    setRangeHi(Math.max(0, (loaded?.tp.layerCount ?? 1) - 1))
    setSimOn(false)
    setPlaying(false)
    setP(0)
  }

  const nLayers = tp?.layerCount ?? 0
  const last = Math.max(0, nLayers - 1)
  const [lo, hi] = layerMode === 'all' ? [0, last] : layerMode === 'single' ? [Math.min(single, last), Math.min(single, last)] : [Math.min(rangeLo, rangeHi), Math.max(rangeLo, rangeHi)]

  const span = useMemo(() => (tp ? layerSegments(tp, lo, hi) : ([0, 0] as [number, number])), [tp, lo, hi])
  const rangeTotal = useMemo(() => {
    if (!est || span[1] <= span[0]) return 0
    return est.end[span[1] - 1] - (span[0] > 0 ? est.end[span[0] - 1] : 0)
  }, [est, span])
  const simState = useMemo(() => (simOn && tp && est ? simulate(tp, est, span[0], span[1], p) : null), [simOn, tp, est, span, p])

  // Playback clock
  const pRef = useRef(0)
  useEffect(() => {
    pRef.current = p
  }, [p])
  useEffect(() => {
    if (!playing) return
    let id = 0
    let prev = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - prev) / 1000)
      prev = now
      const rate = speed === 0 || rangeTotal <= 0 ? 1 / 20 : speed / rangeTotal
      const np = pRef.current + dt * rate
      if (np >= 1) {
        pRef.current = 1
        setP(1)
        setPlaying(false)
        return
      }
      pRef.current = np
      setP(np)
      id = requestAnimationFrame(tick)
    }
    id = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(id)
  }, [playing, speed, rangeTotal])

  const togglePlay = () => {
    if (!tp) return
    if (playing) {
      setPlaying(false)
      return
    }
    setSimOn(true)
    if (p >= 1 || !simOn) {
      pRef.current = 0
      setP(0)
    }
    setPlaying(true)
  }
  const stopSim = () => {
    setPlaying(false)
    setSimOn(false)
    setP(0)
  }

  // Drag and drop
  const [dragging, setDragging] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const openFile = useCallback((f: File) => load(f, f.name, cfg), [load, cfg])
  useEffect(() => {
    let depth = 0
    const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files')
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth++
      setDragging(true)
    }
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault()
    }
    const leave = () => {
      depth = Math.max(0, depth - 1)
      if (depth === 0) setDragging(false)
    }
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth = 0
      setDragging(false)
      const f = e.dataTransfer?.files[0]
      if (f) openFile(f)
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
    }
  }, [openFile])

  const loadSample = (id: SampleId) => load(SAMPLES[id].generate(), SAMPLES[id].name, cfg)
  const startCfg = useRef(cfg)
  useEffect(() => {
    load(SAMPLES.vase.generate(), SAMPLES.vase.name, startCfg.current)
  }, [load])

  const goView = (name: ViewName) => setView((v) => ({ name, n: v.n + 1 }))
  const views: [ViewName, string][] = [
    ['iso', t('Iso')],
    ['top', t('Top')],
    ['front', t('Front')],
    ['side', t('Side')],
  ]
  const zOf = (l: number) => (tp ? tp.layerZ[Math.min(l, last)] : 0)
  const loading = state.kind === 'loading'
  const colors: [ColorMode, string][] = [
    ['feature', t('Feature type')],
    ['speed', t('Speed')],
    ['layer', t('Layer')],
    ['tool', t('Tool')],
  ]

  return (
    <div className="app">
      <header className="toolbar">
        <span className="brand">{t('G-code Previewer')}</span>
        <span className="hint">{t('3D printer and CNC toolpaths in your browser. Files never leave your device.')}</span>
      </header>
      <div className="body">
        <aside className="side">
          <div className="panel">
            <div className="section">
              <h3>{t('File')}</h3>
              <input
                ref={fileInput}
                type="file"
                accept={ACCEPT}
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) openFile(f)
                  e.target.value = ''
                }}
              />
              <div className="row">
                <button className="primary" onClick={() => fileInput.current?.click()}>
                  {t('Open file…')}
                </button>
                <button onClick={() => loadSample('vase')}>{t('Sample: vase')}</button>
                <button onClick={() => loadSample('cnc')}>{t('Sample: CNC pocket')}</button>
              </div>
              <p className="hint">{t('Drop a .gcode, .nc, .ngc or .tap file anywhere on the page. Large files are parsed in the background.')}</p>
              {loading && (
                <div className="progress" role="status">
                  <div className="row">
                    <span className="grow">
                      {t('Parsing {0}', state.name)} · {Math.round(state.frac * 100)}% · {state.segments.toLocaleString()} {t('segments')}
                    </span>
                    <button className="small" onClick={cancel}>
                      {t('Cancel')}
                    </button>
                  </div>
                  <progress value={state.frac} max={1} />
                </div>
              )}
              {state.kind === 'error' && <p className="err-text">{t('Error: {0}', state.message)}</p>}
            </div>

            <div className="section">
              <h3>{t('Display')}</h3>
              <div className="field">
                <label>
                  {t('Color by')}
                  <select value={settings.color} onChange={(e) => update({ color: e.target.value as ColorMode })}>
                    {colors.map(([k, n]) => (
                      <option key={k} value={k}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="check">
                <input type="checkbox" checked={settings.showTravel} onChange={(e) => update({ showTravel: e.target.checked })} /> {t('Show travel moves')}
              </label>
              {tp && <Legend tp={tp} mode={settings.color} t={t} />}
            </div>

            <div className="section">
              <h3>{t('Layers')}</h3>
              <div className="seg" role="group" aria-label={t('Layers')}>
                {(['all', 'single', 'range'] as LayerMode[]).map((m) => (
                  <button key={m} className={layerMode === m ? 'on' : ''} aria-pressed={layerMode === m} disabled={!tp} onClick={() => setLayerMode(m)}>
                    {m === 'all' ? t('All') : m === 'single' ? t('Single') : t('Range')}
                  </button>
                ))}
              </div>
              {tp && layerMode === 'single' && (
                <>
                  <input type="range" aria-label={t('Layer')} min={0} max={last} value={Math.min(single, last)} onChange={(e) => setSingle(+e.target.value)} />
                  <p className="hint">{t('Layer {0} of {1} · Z {2} mm', lo + 1, nLayers, fmtNum(zOf(lo), 2))}</p>
                </>
              )}
              {tp && layerMode === 'range' && (
                <>
                  <input type="range" aria-label={t('From layer')} min={0} max={last} value={Math.min(rangeLo, last)} onChange={(e) => setRangeLo(+e.target.value)} />
                  <input type="range" aria-label={t('To layer')} min={0} max={last} value={Math.min(rangeHi, last)} onChange={(e) => setRangeHi(+e.target.value)} />
                  <p className="hint">{t('Layers {0}–{1} of {2} · Z {3}–{4} mm', lo + 1, hi + 1, nLayers, fmtNum(zOf(lo), 2), fmtNum(zOf(hi), 2))}</p>
                </>
              )}
              {tp && layerMode === 'all' && <p className="hint">{t('{0} layers · Z up to {1} mm', nLayers, fmtNum(zOf(last), 2))}</p>}
            </div>

            <SettingsPanel s={settings} t={t} onChange={update} />
          </div>
        </aside>

        <main className="main">
          <div className="viewport">
            <Suspense fallback={<div className="scene-msg">{t('Loading viewer…')}</div>}>
              <Viewer
                tp={tp}
                est={est}
                color={settings.color}
                showTravel={settings.showTravel}
                lo={lo}
                hi={hi}
                sim={simOn ? p : null}
                view={view}
                themeKey={settings.theme}
                noWebgl={t('WebGL is not available in this browser.')}
              />
            </Suspense>
            <div className="views" role="group" aria-label={t('Camera')}>
              {views.map(([k, n]) => (
                <button key={k} className="small" onClick={() => goView(k)}>
                  {n}
                </button>
              ))}
            </div>
            {!tp && !loading && <div className="scene-msg">{t('Open a file or load a sample.')}</div>}
            {loading && <div className="scene-msg overlay">{t('Parsing {0}', state.name)} {Math.round(state.frac * 100)}%</div>}
            {dragging && <div className="scene-msg drop">{t('Drop the file to open it')}</div>}
          </div>

          <div className="box playback">
            <button className="primary" disabled={!tp} onClick={togglePlay} aria-label={playing ? t('Pause') : t('Play')}>
              {playing ? t('Pause') : t('Play')}
            </button>
            <button disabled={!simOn} onClick={stopSim}>
              {t('Stop')}
            </button>
            <input
              className="grow"
              type="range"
              aria-label={t('Simulation position')}
              min={0}
              max={1000}
              disabled={!tp}
              value={Math.round((simOn ? p : 0) * 1000)}
              onChange={(e) => {
                setSimOn(true)
                setP(+e.target.value / 1000)
              }}
            />
            <span className="clock">
              {simState ? `${formatDuration(simState.time)} / ${formatDuration(simState.total)}` : rangeTotal ? formatDuration(rangeTotal) : '–'}
              {simState && tp ? ` · ${t('layer {0}', tp.layer[Math.max(span[0], simState.drawEnd - 1)] + 1)}` : ''}
            </span>
            <label className="speed">
              {t('Speed')}
              <select value={speed} onChange={(e) => setSpeed(+e.target.value)}>
                {SPEEDS.map((v) => (
                  <option key={v} value={v}>
                    {v === 0 ? t('Auto (20 s)') : `${v}×`}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {tp && est && loaded && <Stats name={loaded.name} tp={tp} est={est} settings={settings} t={t} />}
        </main>
      </div>
      <p className="hint foot">
        {t('Time is an estimate: acceleration-limited trapezoids with look-ahead, no firmware specifics.')}{' '}
        <a href="https://github.com/hermes98761234/gcode-previewer">{t('Source on GitHub')}</a>
      </p>
    </div>
  )
}
