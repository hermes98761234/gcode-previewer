import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { buildColors, type ColorMode } from '../lib/color'
import type { Estimate } from '../lib/estimator'
import { layerSegments, lowerBound, simulate } from '../lib/sim'
import { FLAG, isTravel, type Toolpath } from '../lib/toolpath'

export type ViewName = 'top' | 'iso' | 'front' | 'side'

/** Three.js view of a toolpath: batched line segments sharing one position buffer, redrawn on demand. */
export class ToolpathScene {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(40, 1, 0.1, 10000)
  private controls: OrbitControls
  private ro: ResizeObserver
  private raf = 0
  private disposed = false

  private tp: Toolpath | null = null
  private est: Estimate | null = null
  private printGeom: THREE.BufferGeometry | null = null
  private travelGeom: THREE.BufferGeometry | null = null
  private printLines: THREE.LineSegments | null = null
  private travelLines: THREE.LineSegments | null = null
  private printSegs = new Uint32Array(0)
  private travelSegs = new Uint32Array(0)
  private travelMat = new THREE.LineBasicMaterial({ color: 0x8a93a3, transparent: true, opacity: 0.55 })
  private printMat = new THREE.LineBasicMaterial({ vertexColors: true })
  private grid: THREE.GridHelper | null = null
  private axes: THREE.AxesHelper | null = null
  private head = new THREE.Group()
  private center = new THREE.Vector3()
  private radius = 50

  private lo = 0
  private hi = 0
  private showTravel = false
  private mode: ColorMode = 'feature'
  private sim: number | null = null

  private host: HTMLElement

  constructor(host: HTMLElement) {
    this.host = host
    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    host.appendChild(this.renderer.domElement)
    this.camera.up.set(0, 0, 1)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.addEventListener('change', this.requestRender)
    this.scene.add(this.head)
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.28, 1, 20).rotateX(-Math.PI / 2).translate(0, 0, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xff7a00 }),
    )
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), new THREE.MeshBasicMaterial({ color: 0xffffff }))
    this.head.add(cone, ball)
    this.head.visible = false
    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(host)
    this.resize()
    this.refreshTheme()
  }

  /** Reads the page's CSS colours (call after a theme change). */
  refreshTheme(): void {
    const cs = getComputedStyle(document.documentElement)
    const v = (n: string, d: string) => cs.getPropertyValue(n).trim() || d
    this.renderer.setClearColor(new THREE.Color(v('--chart-bg', '#ffffff')))
    if (this.grid) {
      const g = this.grid
      this.scene.remove(g)
      g.geometry.dispose()
      ;(g.material as THREE.Material).dispose()
      this.grid = null
      this.buildGrid()
    }
    this.requestRender()
  }

  private buildGrid(): void {
    if (!this.tp) return
    const cs = getComputedStyle(document.documentElement)
    const c1 = new THREE.Color(cs.getPropertyValue('--grid-strong').trim() || '#b9bec7')
    const c2 = new THREE.Color(cs.getPropertyValue('--grid').trim() || '#e3e6ea')
    const b = this.tp.bounds
    const sx = b.max[0] - b.min[0]
    const sy = b.max[1] - b.min[1]
    const step = Math.max(sx, sy) > 400 ? 50 : Math.max(sx, sy) > 100 ? 10 : 5
    const size = Math.max(step * 2, Math.ceil((Math.max(sx, sy) * 1.5) / step / 2) * step * 2)
    this.grid = new THREE.GridHelper(size, size / step, c1, c2)
    this.grid.rotateX(Math.PI / 2)
    this.grid.position.set((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, b.min[2])
    this.scene.add(this.grid)
  }

  /** Loads a new toolpath (layer range resets to all; colour mode and travel visibility persist). */
  setData(tp: Toolpath | null): void {
    this.clearGeometry()
    this.tp = tp
    if (!tp || tp.count === 0) {
      this.head.visible = false
      this.requestRender()
      return
    }
    const n = tp.count
    let np = 0
    let nt = 0
    for (let i = 0; i < n; i++) {
      const fl = tp.flags[i]
      if (fl & (FLAG.EOnly | FLAG.Dwell)) continue
      if (isTravel(fl, tp.meta.machine)) nt++
      else np++
    }
    this.printSegs = new Uint32Array(np)
    this.travelSegs = new Uint32Array(nt)
    const pIdx = new Uint32Array(np * 2)
    const tIdx = new Uint32Array(nt * 2)
    let pi = 0
    let ti = 0
    for (let i = 0; i < n; i++) {
      const fl = tp.flags[i]
      if (fl & (FLAG.EOnly | FLAG.Dwell)) continue
      if (isTravel(fl, tp.meta.machine)) {
        this.travelSegs[ti] = i
        tIdx[ti * 2] = i * 2
        tIdx[ti * 2 + 1] = i * 2 + 1
        ti++
      } else {
        this.printSegs[pi] = i
        pIdx[pi * 2] = i * 2
        pIdx[pi * 2 + 1] = i * 2 + 1
        pi++
      }
    }
    const posAttr = new THREE.BufferAttribute(tp.pos, 3)
    this.printGeom = new THREE.BufferGeometry()
    this.printGeom.setAttribute('position', posAttr)
    this.printGeom.setIndex(new THREE.BufferAttribute(pIdx, 1))
    this.travelGeom = new THREE.BufferGeometry()
    this.travelGeom.setAttribute('position', posAttr)
    this.travelGeom.setIndex(new THREE.BufferAttribute(tIdx, 1))
    this.printLines = new THREE.LineSegments(this.printGeom, this.printMat)
    this.travelLines = new THREE.LineSegments(this.travelGeom, this.travelMat)
    this.printLines.frustumCulled = false
    this.travelLines.frustumCulled = false
    this.scene.add(this.printLines, this.travelLines)

    const b = tp.bounds
    this.center.set((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2)
    this.radius = Math.max(1, Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]) / 2)
    const hs = this.radius * 0.1
    this.head.scale.setScalar(hs)
    this.buildGrid()
    this.axes = new THREE.AxesHelper(Math.min(30, this.radius * 0.5))
    this.scene.add(this.axes)
    this.lo = 0
    this.hi = tp.layerCount - 1
    this.sim = null
    this.head.visible = false
    this.setColorMode(this.mode)
    this.applyRanges()
    this.setView('iso')
  }

  private clearGeometry(): void {
    for (const o of [this.printLines, this.travelLines, this.grid, this.axes]) if (o) this.scene.remove(o)
    this.printGeom?.dispose()
    this.travelGeom?.dispose()
    if (this.grid) {
      this.grid.geometry.dispose()
      ;(this.grid.material as THREE.Material).dispose()
    }
    this.axes?.dispose()
    this.printLines = this.travelLines = this.printGeom = this.travelGeom = this.grid = this.axes = null
  }

  /** Swaps the time estimate (e.g. after changing acceleration) without rebuilding geometry. */
  setEstimate(est: Estimate | null): void {
    this.est = est
    this.applyRanges()
  }

  setColorMode(mode: ColorMode): void {
    this.mode = mode
    if (!this.tp || !this.printGeom) return
    this.printGeom.setAttribute('color', new THREE.BufferAttribute(buildColors(this.tp, mode), 3, true))
    this.requestRender()
  }

  setShowTravel(v: boolean): void {
    this.showTravel = v
    this.applyRanges()
  }

  /** Shows layers lo..hi (inclusive). */
  setLayerRange(lo: number, hi: number): void {
    this.lo = lo
    this.hi = hi
    this.applyRanges()
  }

  /** Progress 0..1 of the playback over the shown layers, or null to show everything. */
  setSim(p: number | null): void {
    this.sim = p
    this.applyRanges()
  }

  private applyRanges(): void {
    const tp = this.tp
    const est = this.est
    if (!tp || !est || !this.printGeom || !this.travelGeom || !this.printLines || !this.travelLines) return
    const [a, b] = layerSegments(tp, this.lo, this.hi)
    let end = b
    if (this.sim !== null) {
      const s = simulate(tp, est, a, b, this.sim)
      end = s.drawEnd
      this.head.position.set(s.pos[0], s.pos[1], s.pos[2])
      this.head.visible = true
    } else {
      this.head.visible = false
    }
    const pl = lowerBound(this.printSegs, a)
    const ph = lowerBound(this.printSegs, end)
    this.printGeom.setDrawRange(pl * 2, (ph - pl) * 2)
    const tl = lowerBound(this.travelSegs, a)
    const th = lowerBound(this.travelSegs, end)
    this.travelGeom.setDrawRange(tl * 2, (th - tl) * 2)
    this.travelLines.visible = this.showTravel
    this.requestRender()
  }

  setView(name: ViewName): void {
    const dirs: Record<ViewName, [number, number, number]> = {
      top: [0, -0.0005, 1],
      iso: [0.9, -1.1, 0.85],
      front: [0, -1, 0.0005],
      side: [1, 0, 0.0005],
    }
    const d = new THREE.Vector3(...dirs[name]).normalize()
    const fov = (this.camera.fov * Math.PI) / 180
    const aspect = this.camera.aspect || 1
    const dist = (this.radius / Math.tan(fov / 2)) * 1.1 * (aspect < 1 ? 1 / aspect : 1) + this.radius * 0.2
    this.camera.near = Math.max(0.01, dist / 500)
    this.camera.far = dist * 50
    this.camera.updateProjectionMatrix()
    this.camera.position.copy(this.center).addScaledVector(d, dist)
    this.controls.target.copy(this.center)
    this.controls.update()
    this.requestRender()
  }

  private resize = (): void => {
    const w = Math.max(1, this.host.clientWidth)
    const h = Math.max(1, this.host.clientHeight)
    this.renderer.setSize(w, h)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.requestRender()
  }

  private requestRender = (): void => {
    if (this.raf || this.disposed) return
    this.raf = requestAnimationFrame(() => {
      this.raf = 0
      if (!this.disposed) this.renderer.render(this.scene, this.camera)
    })
  }

  dispose(): void {
    this.disposed = true
    cancelAnimationFrame(this.raf)
    this.ro.disconnect()
    this.controls.dispose()
    this.clearGeometry()
    this.printMat.dispose()
    this.travelMat.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}
