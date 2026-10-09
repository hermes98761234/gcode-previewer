import { useCallback, useEffect, useRef, useState } from 'react'
import type { Estimate, EstimatorConfig } from './lib/estimator'
import type { Toolpath } from './lib/toolpath'
import type { WorkerIn, WorkerOut } from './parse.worker'

export interface Loaded {
  name: string
  tp: Toolpath
  /** Estimate computed in the worker with `cfg`. */
  est: Estimate
  cfg: EstimatorConfig
}

export type LoadState =
  | { kind: 'idle' }
  | { kind: 'loading'; name: string; frac: number; segments: number }
  | { kind: 'error'; message: string }

/** Parses files in a Web Worker and exposes progress. Starting a new load cancels the previous one. */
export function useLoader() {
  const [state, setState] = useState<LoadState>({ kind: 'idle' })
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const worker = useRef<Worker | null>(null)
  const stop = useCallback(() => {
    worker.current?.terminate()
    worker.current = null
  }, [])
  useEffect(() => stop, [stop])

  const load = useCallback(
    (source: File | string, name: string, cfg: EstimatorConfig) => {
      stop()
      const w = new Worker(new URL('./parse.worker.ts', import.meta.url), { type: 'module' })
      worker.current = w
      setState({ kind: 'loading', name, frac: 0, segments: 0 })
      w.onmessage = (e: MessageEvent<WorkerOut>) => {
        const m = e.data
        if (m.type === 'progress') {
          setState({ kind: 'loading', name, frac: m.total > 0 ? m.done / m.total : 0, segments: m.segments })
        } else if (m.type === 'done') {
          setLoaded({ name: m.name, tp: m.tp, est: m.est, cfg: m.cfg })
          setState({ kind: 'idle' })
          w.terminate()
          if (worker.current === w) worker.current = null
        } else {
          setState({ kind: 'error', message: m.message })
          w.terminate()
        }
      }
      w.onerror = (e) => setState({ kind: 'error', message: e.message || 'Worker failed' })
      const msg: WorkerIn = { type: 'parse', source, name, cfg }
      w.postMessage(msg)
    },
    [stop],
  )

  const cancel = useCallback(() => {
    stop()
    setState({ kind: 'idle' })
  }, [stop])

  return { state, loaded, load, cancel }
}
