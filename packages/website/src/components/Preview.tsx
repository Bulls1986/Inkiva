import { SECTIONS } from '@/lib/sections'
import FeatItem from './FeatItem'
import MockWindow from './MockWindow'
import { BoltIcon, GridSmallIcon, LinesIcon } from './Icons'

export default function Preview() {
  return (
    <section className="block" id={SECTIONS.preview}>
      <div className="wrap">
        <div className="split">
          <div className="split-text">
            <div className="sec-head reveal">
              <span className="kicker">WYSIWYG, for real</span>
              <h2 className="sec-title">The page is the preview.</h2>
              <p className="sec-desc">
                Write naturally. Inkiva keeps the rendered document in view and turns Markdown
                structure into readable content as you go.
              </p>
            </div>
            <div className="feat-list">
              <FeatItem
                delay="d1"
                icon={<BoltIcon />}
                title="Render in place"
                description="Headings, emphasis, links and lists become visible without leaving the document."
              />
              <FeatItem
                delay="d2"
                icon={<LinesIcon />}
                title="Source mode when needed"
                description="Drop into raw Markdown only when you need full control."
              />
              <FeatItem
                delay="d3"
                icon={<GridSmallIcon />}
                title="Paste and keep writing"
                description="Paste rich content and continue in one clean, portable Markdown document."
              />
            </div>
          </div>
          <div className="reveal d2">
            <MockWindow title="typing.md" docStyle={{ minHeight: 320 }}>
              <h2 style={{ marginTop: 0 }}>As you type</h2>
              <p>
                <strong>Bold</strong> snaps bold, <em>italics</em> lean, and links become{' '}
                <a className="link" href="#download">
                  clickable
                </a>{' '}
                the instant you finish them.
              </p>
              <p>Lists build themselves:</p>
              <ul>
                <li>One keystroke per bullet</li>
                <li>Nesting just works</li>
                <li>
                  Checkboxes too <span className="cursor" />
                </li>
              </ul>
              <blockquote>Stay in flow — never touch a render button again.</blockquote>
            </MockWindow>
          </div>
        </div>
      </div>
    </section>
  )
}
