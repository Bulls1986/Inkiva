import { DOWNLOAD_TARGETS } from '@/lib/downloads'
import { EXT_LINK } from '@/lib/links'
import { SECTIONS } from '@/lib/sections'
import { MacIcon, WindowsIcon } from './Icons'

export default function Download() {
  return (
    <section className="block" id={SECTIONS.download}>
      <div className="wrap">
        <div className="cta reveal">
          <div className="cta-glow" />
          <span className="kicker kicker--center">Free download</span>
          <h2>
            Start writing in <span className="grad-text">two minutes</span>.
          </h2>
          <p>One download. No account, no subscription. Every desktop you write on.</p>
          <div className="platforms">
            {DOWNLOAD_TARGETS.map((target) => {
              const Icon = target.id === 'windows-x64' ? WindowsIcon : MacIcon
              return (
                <a className="plat" key={target.id} href={target.href} {...EXT_LINK}>
                  <Icon />
                  <div>
                    <b>{target.label}</b>
                    <span>{target.detail}</span>
                  </div>
                </a>
              )
            })}
          </div>
          <div className="hero-note hero-note--cta">
            <span>
              Or install via Homebrew: <code className="inline">brew install --cask inkiva</code>
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}
