'use client'

import { useRef } from 'react'
import { DOWNLOAD } from '@/lib/downloads'
import { EXT_LINK } from '@/lib/links'
import { SECTIONS, hash, revealClass } from '@/lib/sections'
import { useTilt } from '@/hooks/useTilt'
import Nav from './Nav'
import Brand from './Brand'
import PageEffects from './PageEffects'
import MockWindow from './MockWindow'
import FeatureCard from './FeatureCard'
import FeatItem from './FeatItem'
import {
  BoltIcon,
  CheckIcon,
  CodeIcon,
  DiagramIcon,
  DownloadIcon,
  ExportIcon,
  FootnoteIcon,
  FrontmatterIcon,
  GitHubIcon,
  GridSmallIcon,
  LinuxIcon,
  MacIcon,
  MathIcon,
  SunIcon,
  TableIcon,
  TargetIcon,
  WindowsIcon
} from './Icons'

const ZH_MENU = ['文件', '编辑', '段落', '格式', '视图', '主题', '窗口', '帮助']

const SWATCHES = [
  { name: 'Cadmium Light', bg: '#fff', fg: '#333', accent: '#3a86ff', bgBorder: '#ddd' },
  { name: 'Dark', bg: '#161a22', fg: '#d8e3f2', accent: '#3b8dff' },
  { name: 'Graphite Light', bg: '#fdf6e3', fg: '#586e75', accent: '#b58900', bgBorder: '#e8dcc0' },
  { name: 'Material Dark', bg: '#101722', fg: '#b9c9dc', accent: '#6eaefe' },
  { name: 'Ulysses Light', bg: '#f7f3ee', fg: '#5b5147', accent: '#c75e3a', bgBorder: '#e6ddcf' },
  { name: 'One Dark', bg: '#282c34', fg: '#abb2bf', accent: '#61a8ff' }
]

export default function ChineseHomePage() {
  const stageRef = useRef<HTMLDivElement>(null)
  const winRef = useRef<HTMLDivElement>(null)
  useTilt(stageRef, winRef)

  return (
    <>
      <div className="bg-fx" />
      <div className="bg-grid" />
      <Nav locale="zh-CN" />
      <span id="top" />

      <header className="hero">
        <div className="wrap">
          <div className={revealClass(undefined, 'eyebrow')}>
            <span className="tag">v0.1.0-beta1</span> Inkiva · 墨映
          </div>
          <h1 className={revealClass('d1', 'hero-title')}>
            用 Markdown 写作，<span className="grad-text">让内容自然显现。</span>
          </h1>
          <p className={revealClass('d2', 'hero-sub')}>
            一款平静、专注的所见即所得 Markdown 编辑器。写作时文档始终就在眼前，无需分栏、无需预览按钮，让意义在原处呈现。
          </p>
          <div className={revealClass('d3', 'hero-cta')}>
            <a className="btn btn-primary btn-lg" href={DOWNLOAD.releases} {...EXT_LINK}>
              <DownloadIcon />
              免费下载
            </a>
            <a className="btn btn-ghost btn-lg" href={DOWNLOAD.repo} {...EXT_LINK}>
              <GitHubIcon />
              在 GitHub 查看
            </a>
          </div>
          <div className={revealClass('d4', 'hero-note')}>
            <span><CheckIcon /> 所见即所得，实时呈现</span>
            <span><CheckIcon /> Windows · macOS</span>
            <span><CheckIcon /> GPL-3.0 · 开源</span>
          </div>

          <div className={revealClass('d2', 'stage')} id="stage" ref={stageRef}>
            <div className="stage-glow" />
            <MockWindow
              title="发版记录.md"
              showActions
              windowId="heroWin"
              windowRef={winRef}
              menuLabels={ZH_MENU}
            >
              <h1>发版记录 <span className="cursor" /></h1>
              <p className="doc-sub">一份完全使用 Markdown 编写的动态文档。</p>
              <p className="lead">
                Inkiva 会在你 <strong>输入时</strong>实时渲染格式：标题自然展开，<em>强调</em>自动倾斜，
                <code className="inline">代码</code>无需离开当前页面就能清晰呈现。
              </p>
              <h2>本次变化</h2>
              <ul>
                <li>无需预览窗格的实时渲染</li>
                <li>33 个内置主题及完整自定义 CSS</li>
                <li>开箱支持表格、数学公式、脚注和图表</li>
              </ul>
              <blockquote>写一次，看见意义。</blockquote>
            </MockWindow>
          </div>
        </div>
      </header>

      <section className="block block--top-tight">
        <div className="wrap">
          <div className="stats">
            {[
              ['WYSIWYG', '原位编辑', ''],
              ['33+', '内置主题', 'd1'],
              ['3', '编辑模式', 'd2'],
              ['GPL-3.0', '开源许可', 'd3']
            ].map(([value, label, delay]) => (
              <div className={revealClass(delay as 'd1' | 'd2' | 'd3' | undefined, 'stat')} key={label}>
                <div className="n grad-text">{value}</div>
                <div className="l">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="block" id={SECTIONS.preview}>
        <div className="wrap">
          <div className="split">
            <div className="split-text">
              <div className="sec-head reveal">
                <span className="kicker">真正的所见即所得</span>
                <h2 className="sec-title">页面就是预览。</h2>
                <p className="sec-desc">
                  自然地写作。Inkiva 保持渲染后的文档始终可见，让 Markdown 结构随着输入直接变成易读内容。
                </p>
              </div>
              <div className="feat-list">
                <FeatItem icon={<BoltIcon />} delay="d1" title="原位渲染" description="标题、强调、链接和列表会直接显现，无需离开文档。" />
                <FeatItem icon={<CodeIcon />} delay="d2" title="需要时切换源码" description="只有需要完全控制时，才进入原始 Markdown 模式。" />
                <FeatItem icon={<GridSmallIcon />} delay="d3" title="粘贴后继续写作" description="粘贴富文本内容，在一份干净、可移植的 Markdown 文档中继续创作。" />
              </div>
            </div>
            <div className="reveal d2">
              <MockWindow title="输入时.md" docStyle={{ minHeight: 320 }} menuLabels={ZH_MENU}>
                <h2 style={{ marginTop: 0 }}>输入时</h2>
                <p>
                  <strong>粗体</strong>会立即变成粗体，<em>斜体</em>会自然倾斜，链接在完成后立即变为
                  <a className="link" href="#download">可点击</a>。
                </p>
                <p>列表会自动构建：</p>
                <ul>
                  <li>每个项目只需一次按键</li>
                  <li>嵌套列表自然工作</li>
                  <li>复选框同样支持 <span className="cursor" /></li>
                </ul>
                <blockquote>保持写作流，不再寻找渲染按钮。</blockquote>
              </MockWindow>
            </div>
          </div>
        </div>
      </section>

      <section className="block" id={SECTIONS.extensions}>
        <div className="wrap">
          <div className="sec-head center reveal">
            <span className="kicker">Markdown，能力扩展</span>
            <h2 className="sec-title">不止 CommonMark。</h2>
            <p className="sec-desc">表格、数学公式、图表、脚注和 Front matter，全部原生支持并实时渲染。</p>
          </div>
          <div className="grid-3">
            <FeatureCard icon={<TableIcon />} title="表格" description="可以可视化创建，也可以直接使用 Markdown 输入。">
              <div className="mini"><div className="tbl">
                <span className="h">功能</span><span className="h">免费</span><span className="h">专业</span>
                <span>预览</span><span>✓</span><span>✓</span><span>主题</span><span>✓</span><span>✓</span>
              </div></div>
            </FeatureCard>
            <FeatureCard icon={<MathIcon />} delay="d1" title="数学公式与 LaTeX" description="使用 KaTeX 即时渲染行内和块级数学公式。">
              <div className="mini"><div className="katex">e<sup>iπ</sup> + 1 = 0&nbsp;&nbsp;·&nbsp;&nbsp;∫<sub>0</sub><sup>∞</sup> x² dx</div></div>
            </FeatureCard>
            <FeatureCard icon={<DiagramIcon />} delay="d2" title="图表" description="通过 Mermaid、Vega 和 Vega-Lite 创建流程图与数据图表。">
              <div className="mini"><div className="mermaid-flow"><span className="node">编写</span><span className="arrow">→</span><span className="node">渲染</span><span className="arrow">→</span><span className="node">发布</span></div></div>
            </FeatureCard>
            <FeatureCard icon={<FootnoteIcon />} title="脚注" description="双向引用脚注，会自动重新编号。">
              <div className="mini">起草于 2024 年。<sup style={{ color: 'var(--accent)' }}>[1]</sup><br /><span style={{ color: 'var(--muted)' }}>[1]：Inkiva 诞生十周年。</span></div>
            </FeatureCard>
            <FeatureCard icon={<CodeIcon />} delay="d1" title="代码块" description="支持数百种语言的语法高亮。">
              <div className="mini"><span className="c">// fib.js</span><br /><span style={{ color: 'var(--a1)' }}>const</span> fib = n =&gt;<br />&nbsp;&nbsp;n &lt; 2 ? n : fib(n-1)+fib(n-2);</div>
            </FeatureCard>
            <FeatureCard icon={<FrontmatterIcon />} delay="d2" title="Front matter" description="为博客和静态网站提供 YAML、TOML、JSON 元数据。">
              <div className="mini"><span style={{ color: 'var(--muted)' }}>---</span><br /><span style={{ color: 'var(--accent)' }}>标题</span>: 你好，世界<br /><span style={{ color: 'var(--accent)' }}>标签</span>: [markdown, notes]<br /><span style={{ color: 'var(--muted)' }}>---</span></div>
            </FeatureCard>
          </div>
        </div>
      </section>

      <section className="block" id={SECTIONS.themes}>
        <div className="wrap">
          <div className="split rev">
            <div className="split-text">
              <div className="sec-head reveal">
                <span className="kicker">主题</span>
                <h2 className="sec-title">做成你的样子。</h2>
                <p className="sec-desc">33 个内置主题，支持浅色和深色。每个主题都只是 CSS，也可以从零编写自己的主题。</p>
              </div>
              <div className="feat-list">
                <FeatItem delay="d1" icon={<SunIcon />} title="浅色与深色即时切换" description="使用快捷键切换，也可以跟随系统外观。" />
                <FeatItem delay="d2" icon={<CodeIcon />} title="使用纯 CSS 定制" description="没有私有格式。只要了解 CSS，就能制作自己的主题。" />
              </div>
            </div>
            <div className="reveal d2">
              <div className="theme-grid">
                {SWATCHES.map((swatch) => (
                  <div className="swatch" key={swatch.name}>
                    <div className="pv" style={{ background: swatch.bg, color: swatch.fg }}>
                      <div className="t" style={{ color: swatch.accent }}>{swatch.name.split(' ')[0]}</div>
                      # Heading<br />**bold** _italic_<br />&gt; quote
                    </div>
                    <div className="meta">
                      <b>{swatch.name}</b>
                      <div className="dots">
                        <i style={{ background: swatch.bg, border: swatch.bgBorder ? '1px solid ' + swatch.bgBorder : undefined }} />
                        <i style={{ background: swatch.accent }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="theme-more reveal d1"><span>+27 个内置主题</span></div>
            </div>
          </div>
        </div>
      </section>

      <section className="block">
        <div className="wrap">
          <div className="grid-3 grid-2">
            <FeatureCard variant="lg" icon={<TargetIcon />} title="专注模式与打字机模式" description="淡化除当前行之外的内容，并将当前行锁定在中央。为专注写作而设计。">
              <div className="mini mini--lg">
                <span style={{ opacity: 0.3 }}>上方段落逐渐淡出。</span><br />
                <span style={{ color: 'var(--text)' }}>当前行保持清晰并位于中央。<span className="cursor" /></span><br />
                <span style={{ opacity: 0.3 }}>下一行等待你的输入。</span>
              </div>
            </FeatureCard>
            <FeatureCard variant="lg" delay="d1" icon={<ExportIcon />} title="随处导出" description={<>将任意文档导出为精致的 <strong>PDF</strong> 或自包含的 <strong>HTML</strong> 文件，并保留你的主题。</>}>
              <div className="platforms platforms--start">
                <div className="plat plat--compact"><b>PDF</b></div>
                <div className="plat plat--compact"><b>HTML</b></div>
                <div className="plat plat--compact"><b>.md</b></div>
              </div>
            </FeatureCard>
          </div>
        </div>
      </section>

      <section className="block" id={SECTIONS.download}>
        <div className="wrap">
          <div className="cta reveal">
            <div className="cta-glow" />
            <span className="kicker kicker--center">免费下载</span>
            <h2>两分钟内开始<span className="grad-text">专注写作</span>。</h2>
            <p>一次下载，无需账号，无需订阅。在每台桌面设备上自由写作。</p>
            <div className="platforms">
              {[
                { icon: <MacIcon />, label: 'macOS', sub: '.dmg · Apple Silicon 与 Intel' },
                { icon: <WindowsIcon />, label: 'Windows', sub: '.exe · x64 与 ARM64' },
                { icon: <LinuxIcon />, label: 'Linux', sub: '打包流程完善中' }
              ].map((platform) => (
                <a className="plat" key={platform.label} href={DOWNLOAD.releases} {...EXT_LINK}>
                  {platform.icon}<div><b>{platform.label}</b><span>{platform.sub}</span></div>
                </a>
              ))}
            </div>
            <div className="hero-note hero-note--cta"><span>也可以通过 Homebrew 安装： <code className="inline">brew install --cask inkiva</code></span></div>
          </div>
        </div>
      </section>

      <footer className="site-footer">
        <div className="wrap">
          <div className="foot-grid">
            <div className="foot-brand"><Brand /><p>Inkiva · 墨映是一款平静、开源的所见即所得 Markdown 编辑器。写一次，看见意义。</p></div>
            <div className="foot-col"><h5>产品</h5><a href={hash(SECTIONS.preview)}>实时预览</a><a href={hash(SECTIONS.themes)}>主题</a><a href={hash(SECTIONS.extensions)}>Markdown 支持</a><a href={hash(SECTIONS.download)}>下载</a></div>
            <div className="foot-col"><h5>资源</h5><a href="/docs">文档</a><a href={DOWNLOAD.releases} {...EXT_LINK}>发布版本</a><a href={DOWNLOAD.contributing} {...EXT_LINK}>参与贡献</a><a href={DOWNLOAD.issues} {...EXT_LINK}>问题反馈</a></div>
            <div className="foot-col"><h5>社区</h5><a href={DOWNLOAD.repo} {...EXT_LINK}>GitHub</a></div>
          </div>
          <div className="foot-bot"><span>© 2017–2026 Inkiva · 以 GPL-3.0 许可证发布</span><div className="foot-social"><a className="icon-btn" href={DOWNLOAD.repo} {...EXT_LINK} aria-label="GitHub"><GitHubIcon /></a></div></div>
        </div>
      </footer>
      <PageEffects />
    </>
  )
}
