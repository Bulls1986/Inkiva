import Link from 'next/link'
import { firstPageOfTab } from '@/lib/docs-nav'

export default function DocsIndex() {
  const first = firstPageOfTab('user')

  return (
    <main className="doc-main">
      <article className="doc-article">
        <div className="doc-eyebrow">Inkiva documentation</div>
        <h1 className="art-title">Documentation</h1>
        <p className="art-lead">
          Learn the editor, its Markdown behavior, themes, shortcuts and export workflow.
        </p>
        <p>
          Start with the user guide, or browse the developer documentation from the sidebar.
        </p>
        <p>
          <Link className="edit-link" href={first.href}>
            Open the user guide →
          </Link>
        </p>
      </article>
    </main>
  )
}
