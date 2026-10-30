import Link from 'next/link'

type Locale = 'en' | 'zh-CN'

const COPY = {
  en: {
    eyebrow: 'Markdown editor comparison',
    title: 'Inkiva vs Typora vs MarkText',
    lead: 'A practical comparison of three desktop Markdown editors for people who want to write in a rendered document while keeping their files portable.',
    updated: 'Facts checked against official product pages and repositories on October 30, 2026. Prices, supported systems and features may change.',
    home: 'Inkiva home',
    tableTitle: 'At a glance',
    headers: ['Dimension', 'Inkiva', 'Typora', 'MarkText'],
    rows: [
      ['Product model', 'Document-first desktop Markdown editor', 'Commercial Markdown editor', 'Open-source desktop Markdown editor'],
      ['Editing experience', 'In-place WYSIWYG, plus source mode', 'In-place live preview, plus source mode', 'In-place WYSIWYG, plus source mode'],
      ['Price and license', 'Free · GPL-3.0', '15-day trial · US$14.99 one-time license', 'Free · MIT'],
      ['Desktop platforms', 'Windows x64; macOS Intel and Apple silicon', 'Windows, macOS and Linux', 'Windows, macOS and Linux'],
      ['Local Markdown files', 'Yes · ordinary CommonMark/GFM files and folders', 'Yes · ordinary Markdown files', 'Yes · ordinary Markdown files'],
      ['Navigation', 'Tabs, folder navigation, Quick Open, outline and search', 'File navigation, outline and quick open', 'File navigation and editor modes'],
      ['Recovery features', 'Autosave, local history and crash recovery', 'Not assessed here; see current official docs', 'Not assessed here; see current official docs'],
      ['Math and diagrams', 'KaTeX, Mermaid, PlantUML, Flowchart and Vega-Lite', 'Math and diagrams', 'KaTeX and supported Markdown extensions'],
      ['Export', 'HTML and PDF', 'HTML, PDF and other documented export paths', 'HTML and PDF']
    ],
    sections: [
      {
        title: 'Choose Inkiva if…',
        body: 'You use Windows or macOS, prefer editing directly in the rendered document, want a folder-and-document workflow, and value local history, autosave and crash recovery around ordinary Markdown files.'
      },
      {
        title: 'Choose Typora if…',
        body: 'You want Typora’s established commercial product and are comfortable with its one-time license. Typora also publishes Linux builds, which Inkiva does not currently provide.'
      },
      {
        title: 'Choose MarkText if…',
        body: 'You prefer the MIT license or need Linux packages. MarkText is the upstream project on which Inkiva is based; Inkiva is a separately branded and actively developed derivative with its own product direction and GPL-3.0 project license.'
      }
    ],
    noteTitle: 'Important context',
    note: 'Inkiva does not claim to be universally better than Typora or MarkText. Its current fit is specifically Windows/macOS users who want document-first WYSIWYG editing, standard Markdown portability and additional local document navigation and recovery. Linux, mobile, cloud sync and team collaboration are not current Inkiva release targets.',
    sourcesTitle: 'Primary sources',
    sources: [
      ['Inkiva repository and license', 'https://github.com/Bulls1986/Inkiva'],
      ['Inkiva installation guide', 'https://www.inkiva.net/docs/installation/'],
      ['Typora official website and pricing', 'https://typora.io/'],
      ['Typora purchase and FAQ', 'https://store.typora.io/'],
      ['MarkText official repository', 'https://github.com/marktext/marktext']
    ],
    more: 'Read the installation guide',
    moreHref: '/docs/installation/'
  },
  'zh-CN': {
    eyebrow: 'Markdown 编辑器对比',
    title: 'Inkiva、Typora 与 MarkText 如何选择？',
    lead: '面向希望直接编辑渲染后文档、同时保留普通 Markdown 文件的用户，对三款桌面 Markdown 编辑器进行事实对比。',
    updated: '信息依据 2026 年 10 月 30 日可查的官方产品页面和代码仓库整理。价格、平台和功能可能变化。',
    home: 'Inkiva 首页',
    tableTitle: '核心差异一览',
    headers: ['维度', 'Inkiva（墨映）', 'Typora', 'MarkText'],
    rows: [
      ['产品定位', '文档优先的桌面 Markdown 编辑器', '商业 Markdown 编辑器', '开源桌面 Markdown 编辑器'],
      ['编辑体验', '原位所见即所得，并提供源码模式', '原位实时预览，并提供源码模式', '原位所见即所得，并提供源码模式'],
      ['价格与许可证', '免费 · GPL-3.0', '15 天试用 · 14.99 美元一次性授权', '免费 · MIT'],
      ['桌面平台', 'Windows x64；macOS Intel / Apple Silicon', 'Windows、macOS、Linux', 'Windows、macOS、Linux'],
      ['本地 Markdown 文件', '支持普通 CommonMark/GFM 文件和文件夹', '支持普通 Markdown 文件', '支持普通 Markdown 文件'],
      ['导航能力', '标签、文件夹导航、Quick Open、大纲和搜索', '文件导航、大纲和快速打开', '文件导航和编辑模式'],
      ['恢复能力', '自动保存、本地历史和崩溃恢复', '本次不作结论，请查阅当前官方文档', '本次不作结论，请查阅当前官方文档'],
      ['数学与图表', 'KaTeX、Mermaid、PlantUML、Flowchart、Vega-Lite', '数学公式和图表', 'KaTeX 及支持的 Markdown 扩展'],
      ['导出', 'HTML、PDF', 'HTML、PDF 及其他官方文档列出的导出方式', 'HTML、PDF']
    ],
    sections: [
      {
        title: '适合选择 Inkiva 的情况',
        body: '你使用 Windows 或 macOS，希望直接在渲染后的文档中编辑，需要文件夹与多文档导航，并且重视普通 Markdown 文件周边的自动保存、本地历史和崩溃恢复。'
      },
      {
        title: '适合选择 Typora 的情况',
        body: '你希望使用成熟的商业产品 Typora，并且接受一次性购买授权。Typora 还提供 Linux 版本，而 Inkiva 当前没有 Linux 发布包。'
      },
      {
        title: '适合选择 MarkText 的情况',
        body: '你更倾向 MIT 许可证，或者需要 Linux 安装包。MarkText 是 Inkiva 的上游基础项目；Inkiva 是具有独立品牌、产品方向并采用 GPL-3.0 项目许可证的持续开发衍生项目。'
      }
    ],
    noteTitle: '需要说明的边界',
    note: 'Inkiva 并不宣称在所有方面优于 Typora 或 MarkText。它当前更适合希望获得文档优先的所见即所得编辑、标准 Markdown 可移植性，以及本地文档导航和恢复能力的 Windows/macOS 用户。Linux、移动端、云同步和团队协作不是当前 Inkiva 的发布目标。',
    sourcesTitle: '一手资料来源',
    sources: [
      ['Inkiva 代码仓库与许可证', 'https://github.com/Bulls1986/Inkiva'],
      ['Inkiva 安装指南', 'https://www.inkiva.net/docs/installation/'],
      ['Typora 官方网站与价格', 'https://typora.io/'],
      ['Typora 购买与常见问题', 'https://store.typora.io/'],
      ['MarkText 官方代码仓库', 'https://github.com/marktext/marktext']
    ],
    more: '查看安装指南',
    moreHref: '/docs/installation/'
  }
} as const

export default function EditorComparisonPage({ locale = 'en' }: { locale?: Locale }) {
  const copy = COPY[locale]
  const chinese = locale === 'zh-CN'

  return (
    <main className="quiet-site" lang={chinese ? 'zh-CN' : 'en'}>
      <article style={{ maxWidth: 1120, margin: '0 auto', padding: '48px 24px 88px', lineHeight: 1.75 }}>
        <nav aria-label="Breadcrumb" style={{ marginBottom: 36 }}>
          <Link href={chinese ? '/zh-CN/' : '/'}>{copy.home}</Link>
          <span aria-hidden="true"> / </span>
          <span>{copy.eyebrow}</span>
          <span style={{ float: 'right' }}>
            <Link href={chinese ? '/compare/typora/' : '/zh-CN/compare/typora/'}>
              {chinese ? 'English' : '简体中文'}
            </Link>
          </span>
        </nav>

        <header style={{ maxWidth: 820, marginBottom: 48 }}>
          <p className="quiet-section-kicker">{copy.eyebrow}</p>
          <h1 style={{ fontSize: 'clamp(2.2rem, 5vw, 4rem)', lineHeight: 1.15 }}>{copy.title}</h1>
          <p style={{ fontSize: '1.2rem', marginTop: 20 }}>{copy.lead}</p>
          <p style={{ fontSize: '.9rem', opacity: .7 }}>{copy.updated}</p>
        </header>

        <section style={{ marginBottom: 56 }}>
          <h2>{copy.tableTitle}</h2>
          <div style={{ overflowX: 'auto', marginTop: 20 }}>
            <table style={{ width: '100%', minWidth: 760, borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr>
                  {copy.headers.map((header) => (
                    <th key={header} scope="col" style={{ padding: 14, borderBottom: '2px solid currentColor' }}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {copy.rows.map((row) => (
                  <tr key={row[0]}>
                    {row.map((cell, index) => (
                      <td key={index} style={{ padding: 14, verticalAlign: 'top', borderBottom: '1px solid currentColor', opacity: index === 0 ? .72 : 1 }}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section style={{ display: 'grid', gap: 28, marginBottom: 56 }}>
          {copy.sections.map((section) => (
            <div key={section.title} style={{ maxWidth: 820 }}>
              <h2>{section.title}</h2>
              <p>{section.body}</p>
            </div>
          ))}
        </section>

        <aside style={{ padding: 24, border: '1px solid currentColor', borderRadius: 12, marginBottom: 48 }}>
          <h2>{copy.noteTitle}</h2>
          <p>{copy.note}</p>
        </aside>

        <section style={{ marginBottom: 40 }}>
          <h2>{copy.sourcesTitle}</h2>
          <ul>
            {copy.sources.map(([label, href]) => (
              <li key={href}><a href={href} target="_blank" rel="noopener noreferrer">{label}</a></li>
            ))}
          </ul>
        </section>

        <p><Link href={copy.moreHref}>{copy.more} →</Link></p>
      </article>
    </main>
  )
}
