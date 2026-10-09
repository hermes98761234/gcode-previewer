/** "1 h 02 min", "4 min 07 s" or "35 s". */
export function formatLong(sec: number, units: { h: string; min: string; s: string }): string {
  if (!Number.isFinite(sec)) return '–'
  const s = Math.round(sec)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  if (h > 0) return `${h} ${units.h} ${String(m).padStart(2, '0')} ${units.min}`
  if (m > 0) return `${m} ${units.min} ${String(r).padStart(2, '0')} ${units.s}`
  return `${r} ${units.s}`
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export const fmtNum = (v: number, digits = 1) => (Math.abs(v) < 0.5 * 10 ** -digits ? 0 : v).toFixed(digits)
