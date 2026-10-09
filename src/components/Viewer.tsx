import { useEffect, useRef, useState } from 'react'
import type { ColorMode } from '../lib/color'
import type { Estimate } from '../lib/estimator'
import type { Toolpath } from '../lib/toolpath'
import { ToolpathScene, type ViewName } from '../viewer/scene'

export interface ViewCmd {
  name: ViewName
  n: number
}

interface Props {
  tp: Toolpath | null
  est: Estimate | null
  color: ColorMode
  showTravel: boolean
  lo: number
  hi: number
  sim: number | null
  view: ViewCmd
  themeKey: string
  noWebgl: string
}

function webglSupported(): boolean {
  try {
    return !!document.createElement('canvas').getContext('webgl2')
  } catch {
    return false
  }
}

export default function Viewer({ tp, est, color, showTravel, lo, hi, sim, view, themeKey, noWebgl }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const scene = useRef<ToolpathScene | null>(null)
  const [failed] = useState(() => !webglSupported())

  useEffect(() => {
    if (!host.current || failed) return
    const s = new ToolpathScene(host.current)
    scene.current = s
    return () => {
      s.dispose()
      scene.current = null
    }
  }, [failed])

  useEffect(() => {
    scene.current?.setData(tp)
  }, [tp])
  useEffect(() => {
    scene.current?.setEstimate(est)
  }, [est])
  useEffect(() => {
    scene.current?.setColorMode(color)
  }, [color])
  useEffect(() => {
    scene.current?.setShowTravel(showTravel)
  }, [showTravel])
  useEffect(() => {
    scene.current?.setLayerRange(lo, hi)
  }, [lo, hi])
  useEffect(() => {
    scene.current?.setSim(sim)
  }, [sim])
  useEffect(() => {
    if (view.n > 0) scene.current?.setView(view.name)
  }, [view])
  useEffect(() => {
    scene.current?.refreshTheme()
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const f = () => scene.current?.refreshTheme()
    mq.addEventListener('change', f)
    return () => mq.removeEventListener('change', f)
  }, [themeKey])

  return (
    <div className="viewer-host" ref={host} role="img" aria-label="3D toolpath view">
      {failed && <div className="scene-msg">{noWebgl}</div>}
    </div>
  )
}
