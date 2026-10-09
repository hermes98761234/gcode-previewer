/// <reference lib="webworker" />
import { estimate, type Estimate, type EstimatorConfig } from './lib/estimator'
import { GCodeParser } from './lib/parser'
import type { Toolpath } from './lib/toolpath'

export type WorkerIn = { type: 'parse'; source: File | string; name: string; cfg: EstimatorConfig }
export type WorkerOut =
  | { type: 'progress'; done: number; total: number; segments: number }
  | { type: 'done'; tp: Toolpath; est: Estimate; name: string; cfg: EstimatorConfig }
  | { type: 'error'; message: string }

const post = (m: WorkerOut, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(m, transfer)

self.onmessage = async (e: MessageEvent<WorkerIn>) => {
  const { source, name, cfg } = e.data
  try {
    const parser = new GCodeParser()
    let lastPost = 0
    if (typeof source === 'string') {
      parser.feed(source)
    } else {
      const reader = source.stream().getReader()
      const decoder = new TextDecoder()
      let done = 0
      for (;;) {
        const { value, done: fin } = await reader.read()
        if (fin) break
        done += value.byteLength
        parser.feed(decoder.decode(value, { stream: true }), value.byteLength)
        const now = performance.now()
        if (now - lastPost > 80) {
          lastPost = now
          post({ type: 'progress', done, total: source.size, segments: parser.segmentCount })
        }
      }
      parser.feed(decoder.decode())
    }
    const tp = parser.finish()
    post({ type: 'progress', done: 1, total: 1, segments: tp.count })
    const est = estimate(tp, cfg)
    const bufs = new Set<ArrayBufferLike>()
    for (const a of [tp.pos, tp.feed, tp.accel, tp.ext, tp.type, tp.flags, tp.tool, tp.layer, tp.layerStart, tp.layerZ, est.dur, est.end]) bufs.add(a.buffer)
    post({ type: 'done', tp, est, name, cfg }, [...bufs] as Transferable[])
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}
