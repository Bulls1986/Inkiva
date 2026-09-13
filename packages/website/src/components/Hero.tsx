'use client'

import { useRef } from 'react'
import { DOWNLOAD } from '@/lib/downloads'
import { INKIVA_VERSION_LABEL } from '@/lib/version'
import { EXT_LINK } from '@/lib/links'
import { revealClass } from '@/lib/sections'
import { useTilt } from '@/hooks/useTilt'
import MockWindow from './MockWindow'
import { CheckIcon, DownloadIcon, GitHubIcon } from './Icons'

export default function Hero() {
  const stageRef = useRef<HTMLDivElement>(null)
  const winRef = useRef<HTMLDivElement>(null)
  useTilt(stageRef, winRef)

  return (
    <header className="hero">
      <div className="wrap">
        <div className={revealClass(undefined, 'eyebrow')}>
          <span className="tag">{INKIVA_VERSION_LABEL}</span> Inkiva · 墨映
        </div>
        <h1 className={revealClass('d1', 'hero-title')}>
          Write in Markdown. <span className="grad-text">See it take shape.</span>
        </h1>
        <p className={revealClass('d2', 'hero-sub')}>
          A calm WYSIWYG Markdown editor where the document stays visible while you write.
          No split pane. No preview button. Just meaning, in place.
        </p>
        <div className={revealClass('d3', 'hero-cta')}>
          <a className="btn btn-primary btn-lg" href={DOWNLOAD.releases} {...EXT_LINK}>
            <DownloadIcon />
            Download for free
          </a>
          <a className="btn btn-ghost btn-lg" href={DOWNLOAD.repo} {...EXT_LINK}>
            <GitHubIcon />
            View on GitHub
          </a>
        </div>
        <div className={revealClass('d4', 'hero-note')}>
          <span>
            <CheckIcon /> WYSIWYG, rendered in place
          </span>
          <span>
            <CheckIcon /> Windows · macOS · Linux
          </span>
          <span>
            <CheckIcon /> GPL-3.0 · open source
          </span>
        </div>

        <div className={revealClass('d2', 'stage')} id="stage" ref={stageRef}>
          <div className="stage-glow" />
          <MockWindow title="product-launch.md" showActions windowId="heroWin" windowRef={winRef}>
            <h1>
              Shipping Notes <span className="cursor" />
            </h1>
            <p className="doc-sub">A living document, written entirely in Markdown.</p>
            <p className="lead">
              Inkiva renders your formatting <strong>as you type</strong> — headings grow, <em>emphasis</em> leans,
              and <code className="inline">code</code> snaps into place without leaving the page.
            </p>
            <h2>What changed</h2>
            <ul>
              <li>Seamless real-time rendering with no preview pane</li>
              <li>Three focused appearances: Inkiva Light, Inkiva Dark, and Inkiva Paper</li>
              <li>Tables, math, footnotes &amp; diagrams out of the box</li>
            </ul>
            <blockquote>Write once. See the meaning.</blockquote>
          </MockWindow>
        </div>
      </div>
    </header>
  )
}
