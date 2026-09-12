import { SECTIONS } from '@/lib/sections'
import FeatItem from './FeatItem'
import { CodeIcon, SunIcon } from './Icons'

type Swatch = {
  name: string
  bg: string
  fg: string
  accent: string
  bgBorder?: string
}

const SWATCHES: Swatch[] = [
  { name: 'Inkiva Light', bg: '#ffffff', fg: '#2f3540', accent: '#0b63e5', bgBorder: '#e7e9ed' },
  { name: 'Inkiva Dark', bg: '#1b1d21', fg: '#f3f5f8', accent: '#6eaefe' },
  { name: 'Inkiva Paper', bg: '#fffdf8', fg: '#3d3a35', accent: '#0b63e5', bgBorder: '#e9e4da' }
]

export default function Themes() {
  return (
    <section className="block" id={SECTIONS.themes}>
      <div className="wrap">
        <div className="split rev">
          <div className="split-text">
            <div className="sec-head reveal">
              <span className="kicker">Appearances</span>
              <h2 className="sec-title">Make it yours.</h2>
              <p className="sec-desc">
                Three focused appearances — Inkiva Light, Inkiva Dark, and Inkiva Paper — designed to
                keep the editor calm and readable.
              </p>
            </div>
            <div className="feat-list">
              <FeatItem
                delay="d1"
                icon={<SunIcon />}
                title="Light, dark, or paper"
                description="Choose Inkiva Light, Inkiva Dark, or Inkiva Paper; light and dark can follow your system."
              />
              <FeatItem
                delay="d2"
                icon={<CodeIcon />}
                title="A focused writing surface"
                description="Each appearance keeps the interface quiet and the document in focus."
              />
            </div>
          </div>
          <div className="reveal d2">
            <div className="theme-grid">
              {SWATCHES.map((s) => (
                <div className="swatch" key={s.name}>
                  <div className="pv" style={{ background: s.bg, color: s.fg }}>
                    <div className="t" style={{ color: s.accent }}>
                      {s.name.split(' ')[0]}
                    </div>
                    # Heading
                    <br />
                    **bold** _italic_
                    <br />
                    &gt; quote
                  </div>
                  <div className="meta">
                    <b>{s.name}</b>
                    <div className="dots">
                      <i
                        style={{
                          background: s.bg,
                          border: s.bgBorder ? `1px solid ${s.bgBorder}` : undefined
                        }}
                      />
                      <i style={{ background: s.accent }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="theme-more reveal d1">
              <span>Three focused appearances, designed for writing</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
