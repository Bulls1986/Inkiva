# Correctness documents

[Back to AGENTS.md](../../AGENTS.md) · [Testing contract](../agent/TESTING.md)

Use this index for correctness/readiness contracts and product-functional gates.

- [CORRECTNESS-01 — Command Focus Readiness](CORRECTNESS-01-COMMAND-FOCUS-READINESS.md)
- [US04 — Local History Safe Restore](US04-LOCAL-HISTORY-SAFE-RESTORE.md) — Read-only snapshot preview, open-as-copy, confirmed in-place restore, and automatic rollback point.
- [US08 — Input / IME Continuity](US08-INPUT-IME-CONTINUITY.md) — Continuous typing, Markdown trigger conversion, auto-pair, and CJK IME correctness for v0.5.0.
- [US10 — Inline Markdown Syntax Visibility & Fidelity](US10-INLINE-SYNTAX-VISIBILITY.md) — Half-open inline marker visibility, render-only reveal/hide, and incomplete Markdown source fidelity.
- [Settings functional gate](SETTINGS-FUNCTIONAL-GATE.md) — Settings UI → store → live effect → reopen/restart persistence contract.
- [US06 — Settings Effect Closure](US06-SETTINGS-EFFECT-CLOSURE.md) — acknowledged preference writes, effect timing, retry/rollback, delayed-effect feedback, autosave bounds and Settings search targeting.
- [v0.5 US01-US10 compliance closure](V0.5-US01-10-COMPLIANCE-CLOSURE.md) — Latest-`develop` re-audit, architecture debt closure, combined-state validation, and final acceptance record.

Correctness stage records belong here; reusable testing discipline remains in `docs/agent/TESTING.md`.
