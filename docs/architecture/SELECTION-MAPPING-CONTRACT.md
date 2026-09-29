# Selection Mapping Contract

[Back to architecture index](README.md)

## Purpose

Muya keeps a logical selection in Markdown/source offsets while the WYSIWYG surface exposes browser DOM Range endpoints. Those coordinate systems are not interchangeable.

The durable rule is:

> **Source offset ≠ blind DOM text offset.**

Any renderer whose source representation differs from its visible DOM topology must define explicit source ↔ DOM caret semantics.

## Contract

### Text nodes

A native offset inside a text node is a character offset and may be added to that node's source-prefix offset after legal clamping.

### Element Range endpoints

A native offset on an Element is a **child boundary index**, not a character count. Mapping it back to source must project all preceding children into their source lengths.

Do not use:

`sourceOffset = elementPrefix + domChildIndex`

unless a renderer can prove every preceding child has source length exactly one.

### Hidden source syntax

Hidden syntax may remain in the DOM to preserve Markdown round-trip and source-length accounting, but hidden/output-only nodes are not automatically valid native caret targets.

For a token rendered as hidden source syntax plus visible atomic output, source → DOM mapping must land on a visible boundary rather than inside the hidden marker.

Current example:

`<br>` source token → hidden `<br>` marker + real DOM `<br>`.

The source positions at the token boundary map to caret-before / caret-after the rendered hard break.

### Atomic rendered tokens

Atomic visual tokens expose two stable editing boundaries:

- caret before the token → token source start;
- caret after the token → token source end.

The visual implementation may contain zero text characters and still span a non-zero source range.

Current protected examples:

- hard break `<br>`;
- inline image whose `<img>` contributes no DOM text but whose `data-raw` spans the complete Markdown image token.

## Regression discipline

When changing generic selection mapping:

1. establish a focused Red for the target token;
2. test both source → DOM and DOM → source where the browser may return Element boundaries;
3. run regressions for other atomic tokens, especially inline images;
4. compare unexpected failures against the exact untouched baseline before classifying them as pre-existing;
5. require real Electron coverage for browser focus/caret behavior; happy-dom alone is not acceptance evidence.

Do not repair selection correctness with delayed focus, forced cursor-to-end, table-specific retries, or browser-specific patches when the violated invariant belongs to the mapper.

## Origin

This contract was made explicit by the P0 Table Hard Break Caret Correctness repair. The initial hard-break fix exposed an inline-image regression, demonstrating that hidden-source and zero-text atomic renderers are one architectural problem, not independent special cases.
