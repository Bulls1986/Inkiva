# US10 — Inline Markdown Syntax Visibility & Fidelity

[Back to Correctness index](README.md) · [Testing contract](../agent/TESTING.md)

Status: merged to `develop` via PR #197  
Branch: `feat/v0.5-us10`  
Base: `develop@e7e41b0`  
Feature commit: `5711f880848b33378cb55be73ca1378e5110981f`  
Squash merge: `0e1daf82018e9e0903ce2177b811e94d216f8a0b`

## Scope

US10 closes the inline Markdown reveal/hide correctness contract for Inkiva v0.5.0. The supplied prototype is interaction reference only. Existing Inkiva editor layout, controls and visual language remain authoritative; this task introduces no parallel toolbar, styling system, or UI redesign.

Acceptance focus:

- **AC-45** — Inline syntax markers such as `**` are revealed only while the caret/selection is inside the semantic token range, and hide immediately after the closing delimiter without shifting the logical caret/text order.
- **AC-46** — Reveal/hide is a render concern only: moving the caret in/out of syntax must not mutate Markdown or create undo history.
- **AC-47** — Incomplete Markdown is authoritative intermediate input. Single markers, incomplete links and unclosed fenced code blocks must survive parsing/serialization without silent repair.

## Stage 1 — RED / root-cause diagnosis

Focused regression coverage was added in `packages/muya/src/__tests__/inlineSyntaxVisibility.spec.ts`.

Two product defects were reproduced:

1. Inline token ranges are half-open `[start, end)`, but both render-conflict paths treated `end` as inclusive. A caret immediately after `**hello**` therefore kept the strong token's markers revealed.
2. An unclosed fenced code block such as `\`\`\`ts\nconst value = 1;` was parsed as a fenced code block and always serialized with a synthetic closing fence. This changed the user's incomplete source without an edit action.

Initial runner/bootstrap issues caused by worktree dependency topology were classified as environment evidence and were not used as product-red proof. The known-good dependency path was reused before interpreting test results.

## Stage 2 — Inline range semantics

The two inline visibility consumers now use the same half-open boundary semantics:

- `Format.checkNeedRender()` keeps the existing one-character lead-in tolerance but excludes `token.range.end`.
- `Renderer._checkConflicted()` treats a caret as inside only when `start <= offset < end`.

This removes the inclusive-end ambiguity without changing CSS, layout, toolbar behavior, or the existing reveal/hide visual treatment.

## Stage 3 — Incomplete fenced-code fidelity

Code-block state now records `meta.fenceClosed = false` only when the source fenced block has no closing fence. Existing/legacy state leaves the field undefined and therefore preserves the previous closed-fence serialization behavior.

The Markdown serializer omits the closing fence only for that explicit incomplete state. Closed fences, long-fence preservation, info strings, diagram handling and indented code remain on their existing paths.

This keeps syntactic incompleteness as document state instead of canonicalizing it during a read/render round trip.

## Stage 4 — Validation

Focused and related regression evidence:

- US10 focused Vitest: **5/5 PASS**.
- Related inline/state regression set (`inlineSyntaxVisibility`, code-fence length, code-fence info string, blur/null-cursor): **16/16 PASS**.
- Existing inline Playwright interaction coverage (format toolbar + marker arrow/hold): **7/7 PASS**.
- Muya TypeScript check: initial run correctly caught an unused `conflict` import after the range refactor; the import was removed and the rerun passed.
- Targeted ESLint: **0 errors**. Four `regexp/optimal-lookaround-quantifier` warnings remain in unchanged `format.ts` regex definitions; the US10 code adds no new lint warnings after extracting fenced-code source parsing from the large leaf-token switch.

The focused tests additionally verify that reveal/hide does not create undo history and that incomplete single-marker/link/fence source remains readable rather than producing a blank editor.

## Learning review

Reusable conclusions:

1. Parser/token offsets must be consumed with their declared interval semantics. Converting half-open ranges into generic inclusive interval helpers creates one-character boundary defects that are especially visible in WYSIWYG marker reveal/hide.
2. Markdown editor rendering must not canonicalize incomplete syntax merely because the parser can form a semantic block. Intermediate source is user-authored authoritative state.
3. Visibility assertions should protect the user contract (inside reveals, outside hides, source/history unchanged) rather than introduce a new visual implementation.

Existing `AGENTS.md`, `docs/agent/TESTING.md`, and `docs/agent/WORKFLOW.md` already cover red/green discipline, environment-vs-product evidence and stage recording. No new agent-level rule is needed for this task.
## Stage 5 — PR / merge closeout

- PR: **#197**
- PR state: **MERGED**
- Required CI: **all passed** — Desktop PR fast hard gate, build, circular, Chromium E2E, lint, spec, and unit.
- Squash merge commit: `0e1daf82018e9e0903ce2177b811e94d216f8a0b`.
- After merge, GitHub reported PR #197 as `MERGED`, and the remote `develop` ref resolved to the same commit at verification time.
- A post-merge `git fetch origin develop` transport attempt timed out; merge verification therefore used the documented GitHub API fallback instead of retrying the same stalled transport path.

Workflow closeout lesson: local commit is not task completion. For an authorized full closeout, the evidence chain is push → PR → required CI → squash merge → remote PR/ref verification → final stage record.