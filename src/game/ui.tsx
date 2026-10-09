import type { ButtonHTMLAttributes, ReactNode } from 'react'

export function PrimaryButton({ className = '', alt = false, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { alt?: boolean }) {
  return (
    <button
      {...p}
      className={`btn-3d w-full min-h-14 rounded-2xl px-6 py-4 text-[19px] font-bold text-ink disabled:cursor-not-allowed disabled:opacity-40 ${alt ? 'bg-white [box-shadow:0_5px_0_#BFB3CC]' : 'bg-gold'} ${className}`}
    />
  )
}

export function Logo({ tag }: { tag: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="rounded-2xl bg-white px-3 py-2"><img src="/ulacit-logo.png" alt="ULACIT" className="block h-9 w-auto" width={100} height={36} /></div>
      <div className="text-right text-[13px] leading-tight text-[#CFC3DA]">{tag}</div>
    </div>
  )
}

export function Chips({ options, value, onChange, labelledBy }: { options: string[]; value?: string; onChange: (v: string) => void; labelledBy: string }) {
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value === o
        return (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o)}
            className={`min-h-11 rounded-full border-2 px-4 py-2 text-base transition-colors ${on ? 'border-u bg-u text-white' : 'border-soft bg-white text-ink hover:border-u2'}`}
          >
            {o}
          </button>
        )
      })}
    </div>
  )
}

export function Notice({ kind = 'info', children, action }: { kind?: 'info' | 'error' | 'ok'; children: ReactNode; action?: ReactNode }) {
  const cls = kind === 'error' ? 'bg-[#FDECEC] text-[#7a1d1a] border-[#f3b9b6]' : kind === 'ok' ? 'bg-[#E6F5EC] text-[#0f5c37] border-[#b5e0c6]' : 'bg-white/10 text-white border-white/20'
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} className={`rounded-2xl border px-4 py-3 text-[15px] ${cls}`}>
      {children}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function Spinner({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2" role="status">
      <span aria-hidden className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      {label}
    </span>
  )
}
