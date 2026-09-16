'use client'

import Link from 'next/link'
import { useState } from 'react'
import { DOWNLOAD, DOWNLOAD_TARGETS } from '@/lib/downloads'
import { EXT_LINK } from '@/lib/links'
import { INKIVA_VERSION_LABEL } from '@/lib/version'
import PageEffects from './PageEffects'
import {
  CheckIcon,
  DownloadIcon,
  ExportIcon,
  GitHubIcon,
  GridSmallIcon,
  MacIcon,
  MenuIcon,
  SearchIcon,
  TargetIcon,
  WindowsIcon
} from './Icons'

type Locale = 'en' | 'zh-CN'

type QuietNavProps = {
  locale: Locale
  copy: Copy
}

type Copy = {
  language: string
  languageAria: string
  nav: {
    features: string
    appearances: string
    markdown: string
    docs: string
    download: string
    github: string
  }
  eyebrow: string
  heroTitle: string
  heroTitleAccent: string
  heroBody: string
  heroDownload: string
  heroDocs: string
  heroNote: string
  editorTitle: string
  editorDocuments: string
  editorRecent: string
  editorFolder: string
  editorIntro: string
  editorChanged: string
  editorNext: string
  editorChecklist: string[]
  editorStatus: string
  quietStamp: string
  sectionKicker: string
  sectionTitle: string
  sectionBody: string
  features: Array<{
    number: string
    title: string
    body: string
  }>
  appearancesKicker: string
  appearancesTitle: string
  appearancesBody: string
  appearances: string[]
  downloadKicker: string
  downloadTitle: string
  downloadBody: string
  github: string
  docs: string
  changelog: string
  footerDescription: string
  footerProduct: string
  footerResources: string
  footerCopyright: string
}

const COPY: Record<Locale, Copy> = {
  en: {
    language: '中文',
    languageAria: 'Switch to Simplified Chinese',
    nav: {
      features: 'Features',
      appearances: 'Appearances',
      markdown: 'Markdown',
      docs: 'Docs',
      download: 'Download',
      github: 'GitHub'
    },
    eyebrow: 'A document-first Markdown editor',
    heroTitle: 'Write in Markdown.',
    heroTitleAccent: 'See it take shape.',
    heroBody:
      'Inkiva is a calm, local-first desktop editor where your document stays visible while you write. Standard Markdown, rendered in real time.',
    heroDownload: 'Download for Windows x64',
    heroDocs: 'View docs',
    heroNote: 'No account. No subscription. Just a better writing space.',
    editorTitle: 'Shipping Notes.md',
    editorDocuments: 'Documents',
    editorRecent: 'Recent documents',
    editorFolder: 'Writing',
    editorIntro: 'A living document, written entirely in Markdown.',
    editorChanged: 'What changed',
    editorNext: 'Next steps',
    editorChecklist: ['Polish the release notes', 'Prepare screenshots', 'Publish the release'],
    editorStatus: 'Markdown · 237 words',
    quietStamp: 'A quieter, more focused way to write',
    sectionKicker: 'More than a Markdown editor',
    sectionTitle: 'Everything around the file stays lightweight.',
    sectionBody:
      'Inkiva adds useful navigation and recovery around ordinary Markdown files — without turning a folder into a proprietary workspace.',
    features: [
      {
        number: '01',
        title: 'Write beautifully',
        body: 'Headings, emphasis, links, lists and code render in place, keeping you in the flow. What you see is what you are writing.'
      },
      {
        number: '02',
        title: 'Navigate naturally',
        body: 'Open files and folders, and keep your recent documents close. Everything you need is just a few clicks away.'
      },
      {
        number: '03',
        title: 'Find your work',
        body: 'Quickly open recent documents or search for Markdown files. Get back to what you were writing, without leaving the editor.'
      },
      {
        number: '04',
        title: 'Keep documents connected',
        body: 'Use standard relative Markdown links and headings. Backlinks and repair prompts help you keep your documents in shape.'
      },
      {
        number: '05',
        title: 'Keep your work safe',
        body: 'Your files live on your device. Local history, autosave and crash recovery help protect your work while you write.'
      }
    ],
    appearancesKicker: 'Appearances',
    appearancesTitle: 'A focused surface for every session.',
    appearancesBody:
      'Light, Dark and Paper are tuned for long-form writing. Choose the surface that lets the words recede and the work come forward.',
    appearances: ['Inkiva Light', 'Inkiva Dark', 'Inkiva Paper'],
    downloadKicker: 'Inkiva',
    downloadTitle: 'Start writing in two minutes.',
    downloadBody: 'One download. No account, no subscription. Every desktop you write on.',
    github: 'View on GitHub',
    docs: 'Docs',
    changelog: 'Changelog',
    footerDescription: 'A local-first, document-first Markdown editor.',
    footerProduct: 'Product',
    footerResources: 'Resources',
    footerCopyright: '© 2026 Bulls1986 · Released under the GPL-3.0 license'
  },
  'zh-CN': {
    language: 'English',
    languageAria: '切换到 English',
    nav: {
      features: '功能',
      appearances: '外观',
      markdown: 'Markdown',
      docs: '文档',
      download: '下载',
      github: 'GitHub'
    },
    eyebrow: '文档优先的 Markdown 编辑器',
    heroTitle: '用 Markdown 写作，',
    heroTitleAccent: '让内容自然显现。',
    heroBody:
      'Inkiva 是一款平静、本地优先的桌面编辑器。写作时文档始终就在眼前，标准 Markdown 会在原处实时呈现。',
    heroDownload: '下载 Windows x64 版',
    heroDocs: '查看文档',
    heroNote: '无需账号，无需订阅，只为让写作更舒服。',
    editorTitle: '发版记录.md',
    editorDocuments: '文档',
    editorRecent: '最近文档',
    editorFolder: '写作',
    editorIntro: '一份完全使用 Markdown 编写的动态文档。',
    editorChanged: '本次变化',
    editorNext: '下一步',
    editorChecklist: ['完善发版记录', '准备产品截图', '发布当前版本'],
    editorStatus: 'Markdown · 237 字',
    quietStamp: '一种更安静、更专注的写作方式',
    sectionKicker: '不止是一款 Markdown 编辑器',
    sectionTitle: '文件之外的能力，始终保持轻量。',
    sectionBody:
      'Inkiva 围绕普通 Markdown 文件提供导航、关联与恢复能力，但不会把文件夹变成另一种私有格式。',
    features: [
      {
        number: '01',
        title: '写得漂亮',
        body: '标题、强调、链接、列表和代码会在原处渲染，让你始终保持写作状态。你看到的，就是正在写的内容。'
      },
      {
        number: '02',
        title: '自然导航',
        body: '打开文件和文件夹，把最近文档留在手边。需要的内容，几次点击就能找到。'
      },
      {
        number: '03',
        title: '找回你的工作',
        body: '快速打开最近文档，或搜索文件夹中的 Markdown 文件，不必离开编辑器就能回到刚才的工作。'
      },
      {
        number: '04',
        title: '让文档保持连接',
        body: '使用标准的相对 Markdown 链接和标题。反向链接与修复提示，帮助你维护文档之间的关系。'
      },
      {
        number: '05',
        title: '放心写作',
        body: '文件始终保存在自己的设备上。本地历史、自动保存和崩溃恢复，会在写作时保护你的内容。'
      }
    ],
    appearancesKicker: '外观',
    appearancesTitle: '为每一次写作，准备合适的表面。',
    appearancesBody:
      'Light、Dark 与 Paper 都针对长文写作调校。选择让文字退后、让内容向前的那一套。',
    appearances: ['Inkiva Light', 'Inkiva Dark', 'Inkiva Paper'],
    downloadKicker: 'Inkiva',
    downloadTitle: '两分钟，开始写作。',
    downloadBody: '一次下载，无需账号，无需订阅。每一台桌面设备，都可以成为你的写作空间。',
    github: '在 GitHub 查看',
    docs: '文档',
    changelog: '更新记录',
    footerDescription: '本地优先、文档优先的 Markdown 编辑器。',
    footerProduct: '产品',
    footerResources: '资源',
    footerCopyright: '© 2026 Bulls1986 · GPL-3.0 许可证'
  }
}

function QuietBrand() {
  return (
    <Link className="quiet-brand" href="#top" aria-label="Inkiva home">
      <img src="/assets/inkiva-logo.svg" alt="" width={30} height={30} />
      <span>Inkiva</span>
    </Link>
  )
}

function QuietNav({ locale, copy }: QuietNavProps) {
  const [open, setOpen] = useState(false)
  const isChinese = locale === 'zh-CN'

  const closeMenu = () => setOpen(false)

  return (
    <nav className="quiet-nav" aria-label="Primary navigation">
      <div className="quiet-wrap quiet-nav-inner">
        <QuietBrand />
        <div className={`quiet-nav-links${open ? ' is-open' : ''}`}>
          <a href="#features" onClick={closeMenu}>
            {copy.nav.features}
          </a>
          <a href="#appearances" onClick={closeMenu}>
            {copy.nav.appearances}
          </a>
          <a href="#markdown" onClick={closeMenu}>
            {copy.nav.markdown}
          </a>
          <Link href="/docs" onClick={closeMenu}>
            {copy.nav.docs}
          </Link>
        </div>
        <div className="quiet-nav-actions">
          <Link
            className="quiet-language"
            href={isChinese ? '/' : '/zh-CN/'}
            hrefLang={isChinese ? 'en' : 'zh-CN'}
            aria-label={copy.languageAria}
          >
            {copy.language}
          </Link>
          <a className="quiet-github" href={DOWNLOAD.repo} {...EXT_LINK}>
            <GitHubIcon aria-hidden="true" />
            <span>{copy.nav.github}</span>
          </a>
          <a className="quiet-button quiet-button--small" href={DOWNLOAD.releases} {...EXT_LINK}>
            {copy.nav.download}
          </a>
          <button
            className="quiet-menu-button"
            type="button"
            aria-expanded={open}
            aria-label={open ? 'Close navigation' : 'Open navigation'}
            onClick={() => setOpen((value) => !value)}
          >
            <MenuIcon aria-hidden="true" />
          </button>
        </div>
      </div>
    </nav>
  )
}

function FolderGlyph() {
  return (
    <span className="quiet-folder-icon" aria-hidden="true">
      <img src="/assets/folder.svg" alt="" />
    </span>
  )
}

function FileGlyph() {
  return <ExportIcon className="quiet-file-glyph" aria-hidden="true" />
}

function QuietEditor({ copy }: { copy: Copy }) {
  return (
    <div className="quiet-editor" aria-label="Inkiva editor preview">
      <div className="quiet-editor-bar">
        <div className="quiet-traffic" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <span className="quiet-editor-title">{copy.editorTitle}</span>
        <div className="quiet-editor-actions" aria-hidden="true">
          <GridSmallIcon />
          <TargetIcon />
          <MenuIcon />
        </div>
      </div>
      <div className="quiet-editor-body">
        <aside className="quiet-editor-sidebar">
          <div className="quiet-editor-sidebar-title">
            <span>{copy.editorDocuments}</span>
            <SearchIcon aria-hidden="true" />
          </div>
          <div className="quiet-folder">
            <span className="quiet-folder-mark">▾</span>
            <FolderGlyph />
            <span>{copy.editorFolder}</span>
          </div>
          <div className="quiet-file"><FileGlyph /><span>Ideas.md</span></div>
          <div className="quiet-file is-selected"><FileGlyph /><span>{copy.editorTitle}</span></div>
          <div className="quiet-file"><FileGlyph /><span>Roadmap.md</span></div>
          <div className="quiet-folder quiet-folder--muted">
            <span className="quiet-folder-mark">▸</span>
            <FolderGlyph />
            <span>{copy.editorFolder === 'Writing' ? 'Personal' : '个人'}</span>
          </div>
          <div className="quiet-folder quiet-folder--muted">
            <span className="quiet-folder-mark">▸</span>
            <FolderGlyph />
            <span>{copy.editorFolder === 'Writing' ? 'Archive' : '归档'}</span>
          </div>
        </aside>
        <div className="quiet-editor-source" aria-label="Markdown source">
          <div className="quiet-editor-lines" aria-hidden="true">
            {Array.from({ length: 18 }, (_, index) => (
              <span key={index}>{index + 1}</span>
            ))}
          </div>
          <div className="quiet-source-content">
            <p className="quiet-code-heading"># {copy.editorTitle.replace('.md', '')}</p>
            <p>A living document, written entirely</p>
            <p>in Markdown.</p>
            <br />
            <p className="quiet-code-heading">## {copy.editorChanged}</p>
            <p>- Seamless real-time rendering</p>
            <p>- Three focused appearances</p>
            <p>- Tables, math, footnotes &amp; diagrams</p>
            <br />
            <p className="quiet-code-heading">## {copy.editorNext}</p>
            {copy.editorChecklist.map((item) => (
              <p key={item}>- [ ] {item}</p>
            ))}
            <div className="quiet-code-block">```bash\nbrew install --cask inkiva\n```</div>
          </div>
        </div>
        <article className="quiet-editor-rendered">
          <h2>{copy.editorTitle.replace('.md', '')}</h2>
          <p className="quiet-rendered-intro">{copy.editorIntro}</p>
          <h3>{copy.editorChanged}</h3>
          <ul>
            <li>Seamless real-time rendering</li>
            <li>Three focused appearances</li>
            <li>Tables, math, footnotes &amp; diagrams</li>
          </ul>
          <h3>{copy.editorNext}</h3>
          <ul className="quiet-checklist">
            {copy.editorChecklist.map((item) => (
              <li key={item}>
                <span aria-hidden="true" /> {item}
              </li>
            ))}
          </ul>
          <div className="quiet-rendered-code">brew install --cask inkiva</div>
        </article>
      </div>
      <div className="quiet-editor-status">
        <span>{copy.editorStatus}</span>
        <span>Ln 14, Col 1</span>
      </div>
    </div>
  )
}

function FeatureVisual({ index, copy }: { index: number; copy: Copy }) {
  if (index === 0) {
    return (
      <div className="quiet-visual quiet-visual--typing">
        <div className="quiet-visual-label">As you type</div>
        <strong>Bold</strong>, <em>italics</em>, <a href="#markdown">links</a> and{' '}
        <code>code</code> all render instantly.
      </div>
    )
  }

  if (index === 1) {
    return (
      <div className="quiet-visual quiet-visual--tree">
        <div className="quiet-visual-pane">
          <span className="quiet-pane-title">{copy.editorDocuments}</span>
          <span className="quiet-tree-row"><span>▾</span><FolderGlyph />{copy.editorFolder}</span>
          <span className="quiet-tree-row"><FileGlyph />Ideas.md</span>
          <span className="quiet-tree-row is-selected"><FileGlyph />{copy.editorTitle}</span>
          <span className="quiet-tree-row"><FileGlyph />Roadmap.md</span>
        </div>
        <div className="quiet-visual-pane quiet-visual-pane--recent">
          <span className="quiet-pane-title">{copy.editorRecent}</span>
          <span className="quiet-tree-row"><FileGlyph />{copy.editorTitle}</span>
          <span className="quiet-tree-row"><FileGlyph />Ideas.md</span>
          <span className="quiet-tree-row"><FileGlyph />Roadmap.md</span>
          <span className="quiet-tree-row"><FileGlyph />Meeting Notes.md</span>
        </div>
      </div>
    )
  }

  if (index === 2) {
    return (
      <div className="quiet-visual quiet-visual--search">
        <div className="quiet-search-field">
          <SearchIcon aria-hidden="true" />
          <span>{copy.editorTitle.replace('.md', '').toLowerCase()}</span>
          <b>×</b>
        </div>
        <div className="quiet-search-result is-selected">
          <FileGlyph />
          <span>
            <strong>{copy.editorTitle}</strong>
            <small>~/Documents/Writing/{copy.editorTitle}</small>
          </span>
        </div>
        <div className="quiet-search-result">
          <FileGlyph />
          <span>
            <strong>Project Plan.md</strong>
            <small>~/Documents/Work/Project Plan.md</small>
          </span>
        </div>
        <div className="quiet-search-result">
          <FileGlyph />
          <span>
            <strong>Meeting Notes.md</strong>
            <small>~/Documents/Work/Meeting Notes.md</small>
          </span>
        </div>
      </div>
    )
  }

  if (index === 3) {
    return (
      <div className="quiet-visual quiet-visual--links">
        <p>
          See also: <a href="#features">[Roadmap](../Roadmap.md)</a>
        </p>
        <p>
          and <a href="#features">[Ideas](Ideas.md)</a>.
        </p>
        <span className="quiet-link-caret" aria-hidden="true" />
      </div>
    )
  }

  return (
    <div className="quiet-visual quiet-visual--history">
      <div className="quiet-history-icon">
        <TargetIcon aria-hidden="true" />
      </div>
      <div>
        <strong>{localeText(copy, 'Local history', '本地历史')}</strong>
        <span>{localeText(copy, 'Browse and restore previous versions of your document.', '浏览并恢复文档的历史版本。')}</span>
      </div>
    </div>
  )
}

function localeText(copy: Copy, en: string, zh: string) {
  return copy === COPY['zh-CN'] ? zh : en
}

function AppearanceVisual({ name }: { name: string }) {
  const isDark = name === 'Inkiva Dark'
  const isPaper = name === 'Inkiva Paper'
  return (
    <div className={`quiet-appearance-card${isDark ? ' is-dark' : ''}${isPaper ? ' is-paper' : ''}`}>
      <div className="quiet-appearance-window">
        <span className="quiet-appearance-title">{name.split(' ')[1]}</span>
        <span># Heading</span>
        <span>
          <strong>**bold**</strong> <em>_italic_</em>
        </span>
        <span>&gt; quote</span>
      </div>
      <div className="quiet-appearance-meta">
        <strong>{name}</strong>
        <span>
          <i />
          <i />
        </span>
      </div>
    </div>
  )
}

function DownloadCard({ target }: { target: (typeof DOWNLOAD_TARGETS)[number] }) {
  const Icon = target.id === 'windows-x64' ? WindowsIcon : MacIcon
  return (
    <a className="quiet-platform" href={target.href} {...EXT_LINK}>
      <Icon aria-hidden="true" />
      <span>
        <strong>{target.label}</strong>
        <small>{target.detail}</small>
      </span>
    </a>
  )
}

export default function QuietHomePage({ locale = 'en' }: { locale?: Locale }) {
  const copy = COPY[locale]
  const isChinese = locale === 'zh-CN'

  return (
    <main className="quiet-site" lang={isChinese ? 'zh-CN' : 'en'}>
      <header className="quiet-hero" id="top">
        <QuietNav locale={locale} copy={copy} />
        <div className="quiet-wrap quiet-hero-content">
          <div className="quiet-hero-copy quiet-reveal reveal">
            <div className="quiet-eyebrow">
              <span>{INKIVA_VERSION_LABEL}</span>
              {copy.eyebrow}
            </div>
            <h1>
              {copy.heroTitle} <em>{copy.heroTitleAccent}</em>
            </h1>
            <p>{copy.heroBody}</p>
            <div className="quiet-hero-actions">
              <a className="quiet-button quiet-button--primary" href={DOWNLOAD.releases} {...EXT_LINK}>
                <DownloadIcon aria-hidden="true" />
                {copy.heroDownload}
              </a>
              <Link className="quiet-button quiet-button--outline" href="/docs/installation">
                <ExportIcon aria-hidden="true" />
                {copy.heroDocs}
              </Link>
            </div>
            <p className="quiet-hero-note">{copy.heroNote}</p>
          </div>
          <div className="quiet-editor-wrap quiet-reveal quiet-reveal--delay reveal d2">
            <QuietEditor copy={copy} />
          </div>
        </div>
        <div className="quiet-stamp">{copy.quietStamp}</div>
      </header>

      <section className="quiet-intro quiet-paper" id="features">
        <div className="quiet-wrap quiet-intro-inner">
          <span className="quiet-section-kicker">{copy.sectionKicker}</span>
          <h2>{copy.sectionTitle}</h2>
          <p>{copy.sectionBody}</p>
        </div>
      </section>

      <section className="quiet-feature-list" aria-label={copy.nav.features}>
        {copy.features.map((feature, index) => (
          <article
            className={`quiet-feature-row ${index % 2 ? 'quiet-ink' : 'quiet-paper'} quiet-reveal reveal`}
            key={feature.number}
          >
            <div className="quiet-wrap quiet-feature-inner">
              <div className="quiet-feature-index">{feature.number}</div>
              <div className="quiet-feature-copy">
                <h2>{feature.title}</h2>
                <p>{feature.body}</p>
              </div>
              <FeatureVisual index={index} copy={copy} />
            </div>
          </article>
        ))}
      </section>

      <section className="quiet-appearances quiet-paper" id="appearances">
        <div className="quiet-wrap quiet-appearances-inner">
          <div className="quiet-appearances-copy">
            <span className="quiet-section-kicker">{copy.appearancesKicker}</span>
            <h2>{copy.appearancesTitle}</h2>
            <p>{copy.appearancesBody}</p>
            <div className="quiet-appearance-pills">
              {copy.appearances.map((appearance) => (
                <span key={appearance}>
                  <i /> {appearance}
                </span>
              ))}
            </div>
          </div>
          <div className="quiet-appearance-grid">
            {copy.appearances.map((appearance) => (
              <AppearanceVisual key={appearance} name={appearance} />
            ))}
          </div>
        </div>
      </section>

      <section className="quiet-markdown quiet-ink" id="markdown">
        <div className="quiet-wrap quiet-markdown-inner">
          <div className="quiet-markdown-copy">
            <span className="quiet-section-kicker">Markdown, kept portable</span>
            <h2>{isChinese ? '标准 Markdown，始终属于你。' : 'Standard Markdown, still yours.'}</h2>
            <p>
              {isChinese
                ? 'Inkiva 不发明新的表达式，也不把文档锁在应用里。文件可以离开 Inkiva，链接仍然是链接，内容仍然是内容。'
                : 'Inkiva does not invent a private syntax or lock your writing inside the app. Leave Inkiva whenever you like: links stay links, and your document stays a document.'}
            </p>
            <div className="quiet-markdown-points">
              <span>
                <CheckIcon aria-hidden="true" /> CommonMark / GFM
              </span>
              <span>
                <CheckIcon aria-hidden="true" /> {isChinese ? '相对链接与标题' : 'Relative links and headings'}
              </span>
              <span>
                <CheckIcon aria-hidden="true" /> {isChinese ? '导出 PDF 与 HTML' : 'Export to PDF and HTML'}
              </span>
            </div>
          </div>
          <div className="quiet-markdown-sample">
            <div className="quiet-sample-bar">
              <span>README.md</span>
              <span>{isChinese ? '普通文件' : 'ordinary file'}</span>
            </div>
            <div className="quiet-sample-body">
              <span className="quiet-code-heading"># Inkiva</span>
              <span>A document-first Markdown editor.</span>
              <span className="quiet-code-heading">## Links</span>
              <span>
                See also: <a href="#features">[Roadmap](./Roadmap.md)</a>
              </span>
              <span className="quiet-code-heading">## Export</span>
              <span>PDF · HTML · Markdown</span>
            </div>
          </div>
        </div>
      </section>

      <section className="quiet-download quiet-ink" id="download">
        <div className="quiet-wrap quiet-download-inner">
          <div className="quiet-download-copy">
            <span className="quiet-section-kicker">
              {copy.downloadKicker} {INKIVA_VERSION_LABEL}
            </span>
            <h2>{copy.downloadTitle}</h2>
            <p>{copy.downloadBody}</p>
          </div>
          <div className="quiet-platforms">
            {DOWNLOAD_TARGETS.map((target) => (
              <DownloadCard key={target.id} target={target} />
            ))}
          </div>
          <div className="quiet-download-links">
            <Link href="/docs/installation">
              <ExportIcon aria-hidden="true" /> {copy.docs}
            </Link>
            <a href={DOWNLOAD.repo} {...EXT_LINK}>
              <GitHubIcon aria-hidden="true" /> {copy.github}
            </a>
            <a href={`${DOWNLOAD.repo}/releases`} {...EXT_LINK}>
              <GridSmallIcon aria-hidden="true" /> {copy.changelog}
            </a>
          </div>
        </div>
      </section>

      <footer className="quiet-footer quiet-ink">
        <div className="quiet-wrap quiet-footer-inner">
          <div className="quiet-footer-brand">
            <QuietBrand />
            <p>{copy.footerDescription}</p>
          </div>
          <div className="quiet-footer-links">
            <div>
              <strong>{copy.footerProduct}</strong>
              <a href="#features">{copy.nav.features}</a>
              <a href="#appearances">{copy.nav.appearances}</a>
              <a href="#markdown">Markdown</a>
              <a href="#download">{copy.nav.download}</a>
            </div>
            <div>
              <strong>{copy.footerResources}</strong>
              <Link href="/docs">{copy.docs}</Link>
              <a href={DOWNLOAD.releases} {...EXT_LINK}>
                Releases
              </a>
              <a href={DOWNLOAD.issues} {...EXT_LINK}>
                Issues
              </a>
              <a href={DOWNLOAD.repo} {...EXT_LINK}>
                GitHub
              </a>
            </div>
          </div>
          <div className="quiet-footer-bottom">
            <span>{copy.footerCopyright}</span>
            <span>Write your own momentum.</span>
          </div>
        </div>
      </footer>
      <PageEffects />
    </main>
  )
}
