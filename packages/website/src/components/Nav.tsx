'use client'

import { useRef } from 'react'
import Link from 'next/link'
import { DOWNLOAD } from '@/lib/downloads'
import { EXT_LINK } from '@/lib/links'
import { SECTIONS, hash } from '@/lib/sections'
import { useToggleTheme } from '@/hooks/useTheme'
import { useNavShrink } from '@/hooks/useNavShrink'
import Brand from './Brand'
import { GitHubIcon, MoonIcon, SunIcon } from './Icons'

type Locale = 'en' | 'zh-CN'

type Props = {
  locale?: Locale
}

export default function Nav({ locale = 'en' }: Props) {
  const navRef = useRef<HTMLElement>(null)
  const toggle = useToggleTheme()
  const isChinese = locale === 'zh-CN'
  useNavShrink(navRef)

  const labels = isChinese
    ? {
        features: '功能',
        themes: '主题',
        markdown: 'Markdown',
        docs: '文档',
        download: '下载',
        language: 'English',
        languageAria: '切换到 English',
        theme: '切换主题',
        star: '在 GitHub 点 Star',
        starAria: '在 GitHub 为 Inkiva 点 Star'
      }
    : {
        features: 'Features',
        themes: 'Themes',
        markdown: 'Markdown',
        docs: 'Docs',
        download: 'Download',
        language: '中文',
        languageAria: '切换到简体中文',
        theme: 'Toggle theme',
        star: 'Star on GitHub',
        starAria: 'Star Inkiva on GitHub'
      }

  return (
    <nav className="nav" id="nav" ref={navRef}>
      <Brand />
      <div className="nav-links">
        <a href={hash(SECTIONS.preview)}>{labels.features}</a>
        <a href={hash(SECTIONS.themes)}>{labels.themes}</a>
        <a href={hash(SECTIONS.extensions)}>{labels.markdown}</a>
        <Link href="/docs">{labels.docs}</Link>
      </div>
      <div className="nav-right">
        <Link
          className="locale-switch"
          href={isChinese ? '/' : '/zh-CN/'}
          hrefLang={isChinese ? 'en' : 'zh-CN'}
          aria-label={labels.languageAria}
        >
          {labels.language}
        </Link>
        <a
          className="star-btn"
          href={DOWNLOAD.repo}
          {...EXT_LINK}
          aria-label={labels.starAria}
          title={labels.starAria}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="m12 2.8 2.85 5.78 6.38.93-4.62 4.5 1.09 6.35L12 17.36l-5.7 3 1.09-6.35-4.62-4.5 6.38-.93L12 2.8Z" />
          </svg>
          <span>{labels.star}</span>
        </a>
        <button
          type="button"
          className="icon-btn"
          id="themeToggle"
          aria-label={labels.theme}
          title={labels.theme}
          onClick={toggle}
        >
          <MoonIcon className="theme-moon" />
          <SunIcon className="theme-sun" />
        </button>
        <a className="icon-btn" href={DOWNLOAD.repo} {...EXT_LINK} aria-label="GitHub">
          <GitHubIcon />
        </a>
        <a className="btn btn-primary" href={DOWNLOAD.releases} {...EXT_LINK}>
          {labels.download}
        </a>
      </div>
    </nav>
  )
}
