/** Feature (move type) ids stored per segment. */
export const F = {
  Unknown: 0,
  OuterWall: 1,
  InnerWall: 2,
  Skin: 3,
  Infill: 4,
  Support: 5,
  Skirt: 6,
  Bridge: 7,
  GapFill: 8,
  PrimeTower: 9,
  Ironing: 10,
  Cut: 11,
  /** Pseudo feature used only for time accounting of non-printing moves. */
  Travel: 15,
} as const

export const FEATURE_COUNT = 16

/** English source names, translated in the UI through tr(). */
export const FEATURE_NAMES: Record<number, string> = {
  [F.Unknown]: 'Other',
  [F.OuterWall]: 'Outer wall',
  [F.InnerWall]: 'Inner wall',
  [F.Skin]: 'Top / bottom skin',
  [F.Infill]: 'Infill',
  [F.Support]: 'Support',
  [F.Skirt]: 'Skirt / brim',
  [F.Bridge]: 'Bridge / overhang',
  [F.GapFill]: 'Gap fill',
  [F.PrimeTower]: 'Prime tower',
  [F.Ironing]: 'Ironing',
  [F.Cut]: 'Cutting',
  [F.Travel]: 'Travel',
}

export const FEATURE_COLORS: Record<number, string> = {
  [F.Unknown]: '#9ca3af',
  [F.OuterWall]: '#ef4444',
  [F.InnerWall]: '#f59e0b',
  [F.Skin]: '#eab308',
  [F.Infill]: '#a855f7',
  [F.Support]: '#22c55e',
  [F.Skirt]: '#14b8a6',
  [F.Bridge]: '#3b82f6',
  [F.GapFill]: '#f472b6',
  [F.PrimeTower]: '#84cc16',
  [F.Ironing]: '#fde68a',
  [F.Cut]: '#38bdf8',
  [F.Travel]: '#6b7280',
}

/** Maps the text after ";TYPE:" (Cura, PrusaSlicer, OrcaSlicer) or "; feature " (Simplify3D) to a feature id. */
export function mapFeature(raw: string): number {
  const s = raw.trim().toLowerCase().replace(/[_-]/g, ' ')
  if (!s) return F.Unknown
  if (s.includes('support')) return F.Support
  if (s.includes('prime tower') || s.includes('wipe tower')) return F.PrimeTower
  if (s.includes('skirt') || s.includes('brim') || s.includes('raft')) return F.Skirt
  if (s.includes('iron')) return F.Ironing
  if (s.includes('gap')) return F.GapFill
  if (s.includes('bridge') || s.includes('overhang')) return F.Bridge
  if (s.includes('outer') || s.includes('external')) return F.OuterWall
  if (s.includes('perimeter') || s.includes('wall')) return F.InnerWall
  if (s.includes('skin') || s.includes('solid') || s.includes('top') || s.includes('bottom') || s.includes('floor') || s.includes('dense')) return F.Skin
  if (s.includes('fill')) return F.Infill
  return F.Unknown
}

export type Slicer = 'Cura' | 'PrusaSlicer' | 'OrcaSlicer' | 'Simplify3D' | 'Other'

/** Looks at a comment line (without the leading ';') and recognises the slicer that wrote the file. */
export function detectSlicer(comment: string): { slicer: Slicer; version?: string } | null {
  const c = comment.trim()
  const lower = c.toLowerCase()
  if (lower.includes('orcaslicer')) return { slicer: 'OrcaSlicer', version: /orcaslicer\s+([\d.]+\S*)/i.exec(c)?.[1] }
  if (lower.includes('bambustudio')) return { slicer: 'OrcaSlicer', version: undefined }
  if (lower.includes('prusaslicer') || lower.includes('slic3r prusa') || lower.includes('superslicer')) {
    return { slicer: 'PrusaSlicer', version: /(?:prusaslicer|superslicer)\s+([\d.]+\S*)/i.exec(c)?.[1] }
  }
  if (lower.includes('simplify3d')) return { slicer: 'Simplify3D', version: /version\s+([\d.]+)/i.exec(c)?.[1] }
  if (lower.includes('cura_steamengine') || lower.startsWith('flavor:') || lower.includes('generated with cura') || lower.includes('ultimaker cura')) {
    return { slicer: 'Cura', version: /cura_steamengine\s+([\d.]+\S*)/i.exec(c)?.[1] }
  }
  return null
}

/** Parses "1h 2m 3s", "2d 3h 4m 5s" or "12m 5s" style durations into seconds. */
export function parseDuration(s: string): number | null {
  let total = 0
  let found = false
  for (const m of s.matchAll(/(\d+(?:\.\d+)?)\s*([dhms])/gi)) {
    found = true
    const v = parseFloat(m[1])
    const u = m[2].toLowerCase()
    total += v * (u === 'd' ? 86400 : u === 'h' ? 3600 : u === 'm' ? 60 : 1)
  }
  return found ? total : null
}
