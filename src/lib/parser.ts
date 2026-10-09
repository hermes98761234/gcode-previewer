import { interpolateArc, type Plane, type Vec3 } from './arc'
import { detectSlicer, F, mapFeature, parseDuration, type Slicer } from './features'
import { FLAG, type Bounds, type Machine, type Meta, type Toolpath } from './toolpath'

export interface ParseOptions {
  /** Maximum chord deviation when flattening arcs, mm. */
  arcTolerance?: number
  /** Firmware retract length (G10/G11) when M207 is absent, mm. */
  retractLength?: number
  /** Firmware retract feed rate, mm/s. */
  retractFeed?: number
}

const MIN_LAYER_DZ = 0.04

class Store {
  cap = 1 << 14
  n = 0
  pos = new Float32Array(this.cap * 6)
  feed = new Float32Array(this.cap)
  accel = new Float32Array(this.cap)
  ext = new Float32Array(this.cap)
  type = new Uint8Array(this.cap)
  flags = new Uint8Array(this.cap)
  tool = new Uint8Array(this.cap)
  layer = new Uint32Array(this.cap)

  private grow() {
    const cap = this.cap * 2
    const g = <T extends Float32Array | Uint8Array | Uint32Array>(a: T, k: number): T => {
      const b = new (a.constructor as new (n: number) => T)(cap * k)
      b.set(a)
      return b
    }
    this.pos = g(this.pos, 6)
    this.feed = g(this.feed, 1)
    this.accel = g(this.accel, 1)
    this.ext = g(this.ext, 1)
    this.type = g(this.type, 1)
    this.flags = g(this.flags, 1)
    this.tool = g(this.tool, 1)
    this.layer = g(this.layer, 1)
    this.cap = cap
  }

  push(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, feed: number, accel: number, ext: number, type: number, flags: number, tool: number, layer: number) {
    if (this.n === this.cap) this.grow()
    const i = this.n++
    const p = i * 6
    this.pos[p] = x0
    this.pos[p + 1] = y0
    this.pos[p + 2] = z0
    this.pos[p + 3] = x1
    this.pos[p + 4] = y1
    this.pos[p + 5] = z1
    this.feed[i] = feed
    this.accel[i] = accel
    this.ext[i] = ext
    this.type[i] = type
    this.flags[i] = flags
    this.tool[i] = tool
    this.layer[i] = layer
  }
}

const isDigitish = (c: number) => (c >= 48 && c <= 57) || c === 43 || c === 45 || c === 46

export class GCodeParser {
  private store = new Store()
  private carry = ''
  private lines = 0
  private bytes = 0
  private opts: Required<ParseOptions>

  // Modal state
  private cx = 0
  private cy = 0
  private cz = 0
  private ce = 0
  private offX = 0
  private offY = 0
  private offZ = 0
  private u = 1
  private relative = false
  private eRelative = false
  private plane: Plane = 'XY'
  private motion = -1
  private feedRate = 20
  private accel = 0
  private tool = 0
  private feature: number = F.Unknown
  private retractLen: number
  private retractFeed: number
  private recoverExtra = 0

  // Layering
  private slicer: Slicer | null = null
  private slicerVersion: string | undefined
  private layerMarkers = 0
  private zLayer = 0
  private layerZref = Number.NaN
  private sawInches = false
  private hasE = false
  private filamentDiameter: number | undefined
  private filamentDensity: number | undefined
  private slicerEstimate: number | undefined

  // Word scratch
  private w = { x: NaN, y: NaN, z: NaN, e: NaN, f: NaN, i: NaN, j: NaN, k: NaN, r: NaN, p: NaN, s: NaN, l: NaN, t: NaN }

  constructor(opts: ParseOptions = {}) {
    this.opts = { arcTolerance: opts.arcTolerance ?? 0.02, retractLength: opts.retractLength ?? 2, retractFeed: opts.retractFeed ?? 40 }
    this.retractLen = this.opts.retractLength
    this.retractFeed = this.opts.retractFeed
  }

  /** Feeds a decoded text chunk; chunks may split lines anywhere. */
  feed(text: string, byteLength = text.length): void {
    this.bytes += byteLength
    let start = 0
    const s = this.carry ? this.carry + text : text
    const n = s.length
    for (;;) {
      const nl = s.indexOf('\n', start)
      if (nl < 0) break
      this.line(s.substring(start, nl))
      start = nl + 1
    }
    this.carry = start < n ? s.substring(start) : ''
  }

  get segmentCount(): number {
    return this.store.n
  }

  finish(): Toolpath {
    if (this.carry) this.line(this.carry)
    this.carry = ''
    const st = this.store
    const n = st.n
    const machine: Machine = this.hasE ? 'printer' : 'cnc'
    // Layer table and bounds.
    const layerCount = n === 0 ? 0 : st.layer[n - 1] + 1
    const layerStart = new Uint32Array(layerCount + 1)
    const layerZ = new Float32Array(layerCount)
    const layerHasZ = new Uint8Array(layerCount)
    const min: [number, number, number] = [Infinity, Infinity, Infinity]
    const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
    const all: Bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }
    let lastLayer = -1
    let anyPrint = false
    for (let i = 0; i < n; i++) {
      const fl = st.flags[i]
      const l = st.layer[i]
      while (lastLayer < l) layerStart[++lastLayer] = i
      if (fl & (FLAG.EOnly | FLAG.Dwell)) continue
      const p = i * 6
      const z1 = st.pos[p + 5]
      const rapid = (fl & FLAG.Rapid) !== 0
      const feedTravel = machine === 'printer' && (fl & FLAG.Feed) !== 0
      if (machine === 'cnc' && (fl & FLAG.Feed)) st.type[i] = F.Cut
      for (let k = 0; k < 2; k++) {
        for (let a = 0; a < 3; a++) {
          const v = st.pos[p + k * 3 + a]
          if (v < all.min[a]) all.min[a] = v
          if (v > all.max[a]) all.max[a] = v
        }
      }
      if (rapid || feedTravel) {
        if (!layerHasZ[l]) layerZ[l] = z1
        continue
      }
      anyPrint = true
      for (let k = 0; k < 2; k++) {
        for (let a = 0; a < 3; a++) {
          const v = st.pos[p + k * 3 + a]
          if (v < min[a]) min[a] = v
          if (v > max[a]) max[a] = v
        }
      }
      if (!layerHasZ[l] || z1 > layerZ[l] || machine === 'cnc') layerZ[l] = z1
      layerHasZ[l] = 1
    }
    layerStart[layerCount] = n
    const bounds: Bounds = anyPrint ? { min, max } : n > 0 ? all : { min: [0, 0, 0], max: [0, 0, 0] }
    const meta: Meta = {
      slicer: this.slicer,
      slicerVersion: this.slicerVersion,
      machine,
      filamentDiameter: this.filamentDiameter,
      filamentDensity: this.filamentDensity,
      slicerEstimate: this.slicerEstimate,
      lines: this.lines,
      bytes: this.bytes,
      usesInches: this.sawInches,
    }
    return {
      count: n,
      pos: st.pos.subarray(0, n * 6),
      feed: st.feed.subarray(0, n),
      accel: st.accel.subarray(0, n),
      ext: st.ext.subarray(0, n),
      type: st.type.subarray(0, n),
      flags: st.flags.subarray(0, n),
      tool: st.tool.subarray(0, n),
      layer: st.layer.subarray(0, n),
      layerStart,
      layerZ,
      layerCount,
      bounds,
      meta,
    }
  }

  private line(raw: string): void {
    this.lines++
    const len = raw.length
    if (len === 0) return
    const semi = raw.indexOf(';')
    const code = semi >= 0 ? raw.substring(0, semi) : raw
    if (semi >= 0) this.comment(raw.substring(semi + 1))
    this.code(code)
  }

  private comment(c: string): void {
    const t = c.trimStart()
    if (this.slicer === null && this.lines < 400) {
      const d = detectSlicer(t)
      if (d) {
        this.slicer = d.slicer
        this.slicerVersion = d.version
      }
    }
    const ch = t.charCodeAt(0)
    // Fast reject: all markers start with T, F, L, l, ; or one of a handful of letters.
    if (t.startsWith('TYPE:')) {
      this.feature = mapFeature(t.substring(5))
    } else if (t.startsWith('FEATURE:') || t.startsWith('feature ')) {
      this.feature = mapFeature(t.substring(8))
    } else if (this.slicer !== null) {
      if (t.startsWith('LAYER:') || t === 'LAYER_CHANGE' || (ch === 108 && /^layer \d+/.test(t))) {
        this.layerMarkers++
      } else if (t.startsWith('TIME:')) {
        const v = parseFloat(t.substring(5))
        if (v > 0) this.slicerEstimate = v
      } else if (t.startsWith('estimated printing time (normal mode)')) {
        const eq = t.indexOf('=')
        const d = eq >= 0 ? parseDuration(t.substring(eq + 1)) : null
        if (d !== null) this.slicerEstimate = d
      }
    }
    if (ch === 102 && t.startsWith('filament_diameter')) {
      const v = parseFloat(t.substring(t.indexOf('=') + 1))
      if (v > 0.5 && v < 5) this.filamentDiameter = v
    } else if (ch === 102 && t.startsWith('filament_density')) {
      const v = parseFloat(t.substring(t.indexOf('=') + 1))
      if (v > 0.1 && v < 30) this.filamentDensity = v
    }
  }

  private curLayer(): number {
    return this.slicer !== null ? Math.max(0, this.layerMarkers - 1) : this.zLayer
  }

  private code(code: string): void {
    const w = this.w
    w.x = w.y = w.z = w.e = w.f = w.i = w.j = w.k = w.r = w.p = w.s = w.l = w.t = NaN
    const gs: number[] = []
    const ms: number[] = []
    const n = code.length
    let paren = 0
    let i = 0
    while (i < n) {
      const c = code.charCodeAt(i)
      if (c === 40) { paren++; i++; continue }
      if (c === 41) { if (paren > 0) paren--; i++; continue }
      if (paren > 0) { i++; continue }
      if (c === 42) break // checksum
      const up = c & 0xdf
      if (up < 65 || up > 90) { i++; continue }
      let j = i + 1
      while (j < n && code.charCodeAt(j) === 32) j++
      const vs = j
      while (j < n && isDigitish(code.charCodeAt(j))) j++
      if (j === vs) { i = j; continue }
      const v = parseFloat(code.substring(vs, j))
      i = j
      switch (up) {
        case 71: gs.push(v); break
        case 77: ms.push(v); break
        case 88: w.x = v; break
        case 89: w.y = v; break
        case 90: w.z = v; break
        case 69: w.e = v; break
        case 70: w.f = v; break
        case 73: w.i = v; break
        case 74: w.j = v; break
        case 75: w.k = v; break
        case 82: w.r = v; break
        case 80: w.p = v; break
        case 83: w.s = v; break
        case 76: w.l = v; break
        case 84: w.t = v; break
        default: break
      }
    }
    const hasAxis = w.x === w.x || w.y === w.y || w.z === w.z || w.e === w.e
    if (w.e === w.e) this.hasE = true

    // Modal groups first so "G90 G21 G1 X1" works in any order.
    let nonModal = -1
    let motion = -1
    for (const g of gs) {
      switch (g) {
        case 17: this.plane = 'XY'; break
        case 18: this.plane = 'XZ'; break
        case 19: this.plane = 'YZ'; break
        case 20: this.u = 25.4; this.sawInches = true; break
        case 21: this.u = 1; break
        case 90: this.relative = false; this.eRelative = false; break
        case 91: this.relative = true; this.eRelative = true; break
        case 0: case 1: case 2: case 3: motion = g; this.motion = g; break
        case 4: case 10: case 11: case 28: case 92: nonModal = g; break
        default: break
      }
    }
    for (const m of ms) {
      if (m === 82) this.eRelative = false
      else if (m === 83) this.eRelative = true
      else if (m === 204) {
        const a = w.p === w.p ? w.p : w.s
        if (a > 0) this.accel = a
      } else if (m === 207) {
        if (w.s > 0) this.retractLen = w.s
        if (w.f > 0) this.retractFeed = w.f / 60
        w.f = NaN
      } else if (m === 208) {
        if (w.s === w.s) this.recoverExtra = w.s
        w.f = NaN
      } else if (m === 6 && w.t === w.t) this.tool = w.t & 255
    }
    if (ms.length === 0 && w.t === w.t && gs.length === 0) this.tool = w.t & 255
    if (w.f === w.f && w.f > 0) this.feedRate = (w.f * this.u) / 60

    if (nonModal === 92) {
      const u = this.u
      if (w.x === w.x) { const phys = this.cx + this.offX; this.cx = w.x * u; this.offX = phys - this.cx }
      if (w.y === w.y) { const phys = this.cy + this.offY; this.cy = w.y * u; this.offY = phys - this.cy }
      if (w.z === w.z) { const phys = this.cz + this.offZ; this.cz = w.z * u; this.offZ = phys - this.cz }
      if (w.e === w.e) this.ce = w.e * u
      return
    }
    if (nonModal === 4) {
      const sec = w.p === w.p ? w.p / 1000 : w.s === w.s ? w.s : 0
      if (sec > 0) {
        const px = this.cx + this.offX, py = this.cy + this.offY, pz = this.cz + this.offZ
        this.store.push(px, py, pz, px, py, pz, 0, this.accel, sec, this.feature, FLAG.Dwell, this.tool, this.curLayer())
      }
      return
    }
    if (nonModal === 10 || nonModal === 11) {
      if (nonModal === 10 && (w.l === w.l || w.p === w.p)) return // CNC G10 L2 work offsets
      const de = nonModal === 10 ? -this.retractLen : this.retractLen + this.recoverExtra
      this.pushEOnly(de, this.retractFeed)
      return
    }
    if (nonModal === 28) {
      const all = w.x !== w.x && w.y !== w.y && w.z !== w.z
      const tx = all || w.x === w.x ? 0 : this.cx
      const ty = all || w.y === w.y ? 0 : this.cy
      const tz = all || w.z === w.z ? 0 : this.cz
      this.offX = all || w.x === w.x ? 0 : this.offX
      this.offY = all || w.y === w.y ? 0 : this.offY
      this.offZ = all || w.z === w.z ? 0 : this.offZ
      this.moveTo(0, tx, ty, tz, 0)
      return
    }
    if (hasAxis || w.i === w.i || w.j === w.j || w.k === w.k) {
      const m = motion >= 0 ? motion : this.motion
      if (m < 0) return
      this.doMotion(m)
    }
  }

  private pushEOnly(de: number, feed: number): void {
    const px = this.cx + this.offX, py = this.cy + this.offY, pz = this.cz + this.offZ
    this.ce += de
    this.hasE = true
    this.store.push(px, py, pz, px, py, pz, feed, this.accel, de, this.feature, FLAG.EOnly, this.tool, this.curLayer())
  }

  private doMotion(g: number): void {
    const w = this.w
    const u = this.u
    const rel = this.relative
    const tx = w.x === w.x ? (rel ? this.cx + w.x * u : w.x * u) : this.cx
    const ty = w.y === w.y ? (rel ? this.cy + w.y * u : w.y * u) : this.cy
    const tz = w.z === w.z ? (rel ? this.cz + w.z * u : w.z * u) : this.cz
    let de = 0
    if (w.e === w.e) {
      if (this.eRelative) {
        de = w.e * u
        this.ce += de
      } else {
        const ne = w.e * u
        de = ne - this.ce
        this.ce = ne
      }
    }
    if (g === 0 || g === 1) {
      this.moveTo(g, tx, ty, tz, de)
      return
    }
    // Arc
    const hasCentre = w.i === w.i || w.j === w.j || w.k === w.k
    const hasR = w.r === w.r
    if (!hasCentre && !hasR) {
      this.moveTo(1, tx, ty, tz, de)
      return
    }
    const sx = this.cx + this.offX, sy = this.cy + this.offY, sz = this.cz + this.offZ
    const start: Vec3 = [sx, sy, sz]
    const end: Vec3 = [tx + this.offX, ty + this.offY, tz + this.offZ]
    const ijk: Vec3 = [(w.i === w.i ? w.i : 0) * u, (w.j === w.j ? w.j : 0) * u, (w.k === w.k ? w.k : 0) * u]
    const pts = interpolateArc(start, end, { ijk, r: hasR ? w.r * u : undefined }, g === 2, this.plane, this.opts.arcTolerance)
    let total = 0
    let prev = start
    const lens: number[] = []
    for (const p of pts) {
      const l = Math.hypot(p[0] - prev[0], p[1] - prev[1], p[2] - prev[2])
      lens.push(l)
      total += l
      prev = p
    }
    prev = start
    for (let k = 0; k < pts.length; k++) {
      const p = pts[k]
      const e = total > 0 ? (de * lens[k]) / total : k === pts.length - 1 ? de : 0
      this.pushSeg(prev, p, e, g)
      prev = p
    }
    this.cx = tx
    this.cy = ty
    this.cz = tz
  }

  private moveTo(g: number, tx: number, ty: number, tz: number, de: number): void {
    const start: Vec3 = [this.cx + this.offX, this.cy + this.offY, this.cz + this.offZ]
    const end: Vec3 = [tx + this.offX, ty + this.offY, tz + this.offZ]
    this.cx = tx
    this.cy = ty
    this.cz = tz
    this.pushSeg(start, end, de, g)
  }

  private pushSeg(a: Vec3, b: Vec3, de: number, g: number): void {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2]
    const moved = dx * dx + dy * dy + dz * dz > 1e-18
    if (!moved) {
      if (Math.abs(de) > 1e-9) {
        this.store.push(a[0], a[1], a[2], a[0], a[1], a[2], this.feedRate, this.accel, de, this.feature, FLAG.EOnly, this.tool, this.curLayer())
      }
      return
    }
    let flags: number = de > 1e-9 ? FLAG.Extrude : g === 0 ? FLAG.Rapid : FLAG.Feed
    if (g === 0 && de > 1e-9) flags = FLAG.Extrude
    // Layer change detection when the slicer gave no markers.
    const level = Math.abs(dz) < 1e-6 || dx * dx + dy * dy < 1e-18
    if (this.slicer === null && (flags === FLAG.Extrude || (flags === FLAG.Feed && !this.hasE && level))) {
      const z = b[2]
      if (Number.isNaN(this.layerZref)) this.layerZref = z
      else if (Math.abs(z - this.layerZref) > MIN_LAYER_DZ && (z > this.layerZref || flags === FLAG.Feed)) {
        this.zLayer++
        this.layerZref = z
      }
    }
    this.store.push(a[0], a[1], a[2], b[0], b[1], b[2], this.feedRate, this.accel, de, flags === FLAG.Extrude ? this.feature : F.Unknown, flags, this.tool, this.curLayer())
  }
}

/** Convenience for tests and small inputs. */
export function parseGCode(text: string, opts?: ParseOptions): Toolpath {
  const p = new GCodeParser(opts)
  p.feed(text)
  return p.finish()
}
