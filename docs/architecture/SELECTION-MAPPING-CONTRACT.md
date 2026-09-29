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

A native offset on an Element is a **child boundary index**, not a character count. That does **not** mean every Element boundary should be globally reinterpreted through source-length projection.

The default contract preserves Muya's established Element-boundary semantics. A renderer may override that mapping only when its DOM topology intentionally diverges from the source model and the renderer can identify the atomic boundary unambiguously.

Therefore:

- ordinary wrapper boundaries such as `.mu-plain-text` keep the legacy DOM-boundary offset behavior;
- hard-break and inline-image boundaries opt into explicit source projection;
- never apply a generic "sum all preceding child source lengths" rule to every Element endpoint.

This restriction is required because generic projection changes unrelated selections such as Find/Escape restoration: a plain-text wrapper boundary `offset=1` must not suddenly become the full paragraph source length.

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
3. add a negative-control regression proving ordinary Element boundaries keep legacy semantics;
4. run regressions for other atomic tokens, especially inline images;
5. run an unrelated real selection workflow such as Find/Escape restoration;
6. compare unexpected failures against the exact untouched baseline before classifying them as pre-existing;
7. require real Electron coverage for browser focus/caret behavior; happy-dom alone is not acceptance evidence.

Do not repair selection correctness with delayed focus, forced cursor-to-end, table-specific retries, or browser-specific patches when the violated invariant belongs to the mapper.

## Origin

This contract was made explicit by the P0 Table Hard Break Caret Correctness repair. The initial hard-break fix first exposed an inline-image regression and then, during PR CI, a Find/Escape selection-restoration regression. The second regression proved that atomic-token source projection must be explicit and opt-in: solving renderer divergence must not redefine ordinary Element-boundary semantics globally.
