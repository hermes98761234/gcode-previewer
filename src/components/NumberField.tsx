import { useState } from 'react'

interface Props {
  label: string
  value: number | null
  min: number
  max: number
  step?: number
  unit?: string
  /** Shown when value is null (auto). */
  placeholder?: string
  /** Allow clearing the field, which reports null. */
  nullable?: boolean
  onChange: (v: number | null) => void
}

/** Number input that keeps its own text while typing and only reports valid, in-range values. */
export default function NumberField({ label, value, min, max, step, unit, placeholder, nullable, onChange }: Props) {
  const [text, setText] = useState(value === null ? '' : String(value))
  const [seen, setSeen] = useState(value)
  if (value !== seen) {
    setSeen(value)
    setText(value === null ? '' : String(value))
  }
  const parsed = text.trim() === '' ? null : Number(text)
  const bad = text.trim() === '' ? !nullable : !Number.isFinite(parsed) || parsed! < min || parsed! > max
  return (
    <div className="field">
      <label>
        {label}
        {unit ? ` (${unit})` : ''}
        <input
          type="number"
          inputMode="decimal"
          className={bad ? 'bad' : undefined}
          value={text}
          min={min}
          max={max}
          step={step ?? 'any'}
          placeholder={placeholder}
          onChange={(e) => {
            const t = e.target.value
            setText(t)
            if (t.trim() === '') {
              if (nullable) onChange(null)
              return
            }
            const n = Number(t)
            if (Number.isFinite(n) && n >= min && n <= max) onChange(n)
          }}
          onBlur={() => setText(value === null ? '' : String(value))}
        />
      </label>
    </div>
  )
}
