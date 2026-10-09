import type { Slicer } from './features'

/** Segment flag bits. */
export const FLAG = {
  /** Printing move: XYZ motion with positive filament extrusion. */
  Extrude: 1,
  /** G0 rapid move. */
  Rapid: 2,
  /** Extruder-only move (retract, unretract, prime). */
  EOnly: 4,
  /** Dwell (G4); `ext` holds the pause in seconds. */
  Dwell: 8,
  /** Feed move without extrusion (G1/G2/G3): a cut on a CNC, a travel on a printer. */
  Feed: 16,
} as const

export type Machine = 'printer' | 'cnc'

export interface Bounds {
  min: [number, number, number]
  max: [number, number, number]
}

export interface Meta {
  slicer: Slicer | null
  slicerVersion?: string
  machine: Machine
  /** Filament diameter / density declared in the file, if any. */
  filamentDiameter?: number
  filamentDensity?: number
  /** Print time the slicer wrote into the file, in seconds. */
  slicerEstimate?: number
  lines: number
  bytes: number
  usesInches: boolean
}

/** Struct-of-arrays toolpath: one entry per segment (arcs are already flattened into segments). */
export interface Toolpath {
  count: number
  /** x0 y0 z0 x1 y1 z1 per segment, millimetres. */
  pos: Float32Array
  /** Programmed feed rate, mm/s. */
  feed: Float32Array
  /** Acceleration set by M204 (mm/s²), 0 when the file never set one. */
  accel: Float32Array
  /** Filament length change in mm (negative for retracts); pause seconds for dwell segments. */
  ext: Float32Array
  type: Uint8Array
  flags: Uint8Array
  tool: Uint8Array
  layer: Uint32Array
  /** First segment of each layer; length layerCount + 1. */
  layerStart: Uint32Array
  layerZ: Float32Array
  layerCount: number
  bounds: Bounds
  meta: Meta
}

export const isTravel = (flags: number, machine: Machine) =>
  (flags & FLAG.Rapid) !== 0 || (machine === 'printer' && (flags & FLAG.Feed) !== 0)

/** True for segments that draw a visible line: printing moves, cuts and travels (not E-only or dwell). */
export const isMotion = (flags: number) => (flags & (FLAG.EOnly | FLAG.Dwell)) === 0
