import type { Metadata } from 'next'
import Link from 'next/link'
import { findPageBySlug, firstPageOfTab } from '@/lib/docs-nav'
import { DOCS_DESCRIPTION, createPageMetadata } from '@/lib/seo'

export const metadata: Metadata = {
  ...createPageMetadata({
    title: 'Documentation',
    description: DOCS_DESCRIPTION,
    path: '/docs/',
    openGraphTitle: 'Documentation · Inkiva Docs'
  })
}

const topics = [
  { slug: 'installation', title: 'Installation', detail: 'Set up Inkiva on your computer' },
  { slug: 'basics', title: 'Workspace basics', detail: 'Files, tabs, outlines and navigation' },
  { slug: 'editing', title: 'Editing & tables', detail: 'Write, format and organize content' },
  { slug: 'markdown-syntax', title: 'Markdown syntax', detail: 'Supported formatting and blocks' },
  { slug: 'export', title: 'Export a document', detail: 'PDF, HTML and print options' },
  { slug: 'faq', title: 'Help & FAQ', detail: 'Answers to common questions' }
] as const

export default function DocsIndex() {
  const user = firstPageOfTab('user')
  const chinese = firstPageOfTab('zh')
  const developer = firstPageOfTab('dev')

  return (
    <main className="docs-home">
      <section className="docs-home-hero" aria-labelledby="docs-home-title">
        <div className="docs-home-hero-copy">
          <div className="docs-home-kicker">
            <span className="docs-home-kicker-dot" aria-hidden="true" />
            INKIVA DOCUMENTATION
          </div>
          <h1 id="docs-home-title">Good writing starts here.</h1>
          <p className="docs-home-lead">
            Everything you need to feel at home in Inkiva. Learn to edit Markdown, work with
            documents, personalize the editor and share your work.
          </p>
          <div className="docs-home-actions">
            <Link className="docs-home-primary" href={user.href}>
              Start with Inkiva <span aria-hidden="true">↗</span>
            </Link>
            <a className="docs-home-secondary" href="#browse-topics">
              Explore topics <span aria-hidden="true">↓</span>
            </a>
          </div>
        </div>
        <div className="docs-home-preview" aria-hidden="true">
          <div className="docs-home-preview-bar">
            <span className="docs-home-preview-dots"><i /><i /><i /></span>
            <span>THE EDITOR</span>
          </div>
          <img src="/docs/assets/inkiva-interface.png" alt="" loading="lazy" />
        </div>
      </section>

      <section className="docs-home-section" aria-labelledby="docs-home-choose">
        <div className="docs-home-section-heading">
          <div>
            <span className="docs-home-section-label">FIND YOUR PATH</span>
            <h2 id="docs-home-choose">What brings you here?</h2>
          </div>
          <p>Choose a guide and pick up where you need to.</p>
        </div>
        <div className="docs-home-paths">
          <Link className="docs-home-card" href={user.href}>
            <span className="docs-home-card-overline">01 / LEARN</span>
            <span className="docs-home-card-title">User guide</span>
            <span className="docs-home-card-description">
              From your first document to editing, links, tables and exporting.
            </span>
            <span className="docs-home-card-cta">Read the guide <span aria-hidden="true">↗</span></span>
          </Link>
          <Link className="docs-home-card" href={chinese.href} lang="zh-CN">
            <span className="docs-home-card-overline">02 / 中文</span>
            <span className="docs-home-card-title">中文使用手册</span>
            <span className="docs-home-card-description">
              中文入门指南，包含编辑操作、设置、快捷键及导出说明。
            </span>
            <span className="docs-home-card-cta">阅读中文文档 <span aria-hidden="true">↗</span></span>
          </Link>
          <Link className="docs-home-card" href={developer.href}>
            <span className="docs-home-card-overline">03 / BUILD</span>
            <span className="docs-home-card-title">Developer docs</span>
            <span className="docs-home-card-description">
              Explore the architecture, build from source and contribute to Inkiva.
            </span>
            <span className="docs-home-card-cta">Explore development <span aria-hidden="true">↗</span></span>
          </Link>
        </div>
      </section>

      <section className="docs-home-section docs-home-topics" id="browse-topics" aria-labelledby="docs-home-popular">
        <div className="docs-home-section-heading">
          <div>
            <span className="docs-home-section-label">QUICK REFERENCE</span>
            <h2 id="docs-home-popular">Popular topics</h2>
          </div>
          <p>Jump straight to the answer.</p>
        </div>
        <div className="docs-home-topic-grid">
          {topics.map((topic) => {
            const page = findPageBySlug([topic.slug])
            if (!page) return null
            return (
              <Link className="docs-home-topic" href={page.href} key={topic.slug}>
                <span>
                  <strong>{topic.title}</strong>
                  <small>{topic.detail}</small>
                </span>
                <span className="docs-home-topic-arrow" aria-hidden="true">↗</span>
              </Link>
            )
          })}
        </div>
      </section>
    </main>
  )
}
