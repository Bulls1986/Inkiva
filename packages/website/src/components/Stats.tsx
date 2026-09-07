import { revealClass, type RevealDelay } from '@/lib/sections'

type Stat = { value: string; label: string; delay?: RevealDelay }

const STATS: Stat[] = [
  { value: 'WYSIWYG', label: 'editing in place' },
  { value: '33+', label: 'built-in themes', delay: 'd1' },
  { value: '3', label: 'editor modes', delay: 'd2' },
  { value: 'GPL-3.0', label: 'open source', delay: 'd3' }
]

export default function Stats() {
  return (
    <section className="block block--top-tight">
      <div className="wrap">
        <div className="stats">
          {STATS.map((s) => (
            <div className={revealClass(s.delay, 'stat')} key={s.label}>
              <div className="n grad-text">{s.value}</div>
              <div className="l">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
