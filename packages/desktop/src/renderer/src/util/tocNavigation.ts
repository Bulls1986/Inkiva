// Maps a sidebar TOC entry (its slug) onto the matching heading element in the
// live editor DOM, so the caller can scroll it into view.
//
// `@muyajs/core` slugs are stable per-block ids that are NOT stamped onto the
// heading DOM, so a `#slug` selector never matches. `getTOC` instead enumerates
// the headings in document order, so we resolve the slug to its index in that
// list and pick the heading at the same index in the DOM.
//
// The DOM query MUST match the exact set `getTOC` enumerates. `getTOC` only
// walks top-level `scrollPage` children (it does not recurse). Small documents
// mount those blocks directly under `.mu-container`; virtualized documents group
// the same top-level blocks one level deeper under `.mu-virtual-segment` roots.
// The selector therefore accepts exactly those two shapes while still excluding
// headings nested in blockquotes, list items, or raw-HTML blocks. An unscoped
// `querySelectorAll('h1..h6')` would count nested headings and shift later TOC
// indexes, scrolling to the wrong heading.
export const TOP_LEVEL_HEADINGS_SELECTOR =
  '.mu-container > h1, .mu-container > h2, .mu-container > h3, .mu-container > h4, .mu-container > h5, .mu-container > h6, .mu-container > .mu-virtual-segment > h1, .mu-container > .mu-virtual-segment > h2, .mu-container > .mu-virtual-segment > h3, .mu-container > .mu-virtual-segment > h4, .mu-container > .mu-virtual-segment > h5, .mu-container > .mu-virtual-segment > h6'

export const TOC_HEADING_SLUG_ATTRIBUTE = 'data-inkiva-toc-slug'
export const VIRTUAL_BLOCK_INDEX_ATTRIBUTE = 'data-virtual-block-index'

export const resolveTocHeadingElement = (
  container: Element,
  listToc: ReadonlyArray<{ slug?: unknown; blockIndex?: unknown }>,
  slug: unknown
): Element | null => {
  const index = listToc.findIndex((item) => item.slug === slug)
  if (index < 0) return null
  const headings = container.querySelectorAll(TOP_LEVEL_HEADINGS_SELECTOR)
  const runtimeHeading = Array.from(headings).find(
    (heading) => heading.getAttribute(TOC_HEADING_SLUG_ATTRIBUTE) === slug
  )
  if (runtimeHeading) return runtimeHeading

  const blockIndex = listToc[index]?.blockIndex
  if (typeof blockIndex === 'number' && Number.isInteger(blockIndex)) {
    return Array.from(headings).find(
      (heading) => heading.getAttribute(VIRTUAL_BLOCK_INDEX_ATTRIBUTE) === String(blockIndex)
    ) ?? null
  }

  return headings[index] ?? null
}
