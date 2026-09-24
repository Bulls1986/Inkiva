# US02 / Crash Recovery Engineering Lessons

## 1. Recovery ownership is a durability boundary

A crash-recovery revision is not merely another editor tab. Once a previous-session dirty buffer is identified as protected recovery data, the next editor session must not reuse that recovery source as its normal persistence target. Hiding the dirty tab from the initial UI is insufficient: if the new renderer keeps the old buffer id/file, an ordinary state flush can erase the only V2 recovery copy before the user makes a decision.

The correct contract is therefore two-layered: keep the complete previous-session state as durable recovery data, derive a separate automatic restore state for safe/saved tabs, and give the new session a fresh persistence identity while unresolved recovery items exist.

## 2. Compare-time state is not commit-time state

Showing disk V1 beside recovery V2 does not make replacement safe. The disk may become V3 after the dialog opens. Recovery replacement must carry a disk revision token from preview, reread the file immediately before write, compare revisions, and abort on mismatch. Only an unchanged file can proceed to Local History backup followed by atomic replacement.

This converts recovery replacement from a UI confirmation into an optimistic-concurrency transaction.

## 3. Safe mode must expose user decisions, not just alter startup behavior

The existing three-failure guard already knew when automatic workspace restore was unsafe. US02 showed that correctness also requires a product-level decision surface: safe blank startup, recovery inspection, continued blank use, and explicit discard of prior workspace recovery state. A safety mechanism is incomplete when its state is visible only in logs or implicit startup behavior.

## 4. Real Electron E2E is required for component semantics

The first recovery comparison UI used Element Plus radio behavior that compiled successfully but did not switch the preview in the actual Electron runtime. Replacing the ambiguous binding with explicit button clicks fixed the interaction. Build/type checks can validate syntax and static contracts, but they do not prove component-version interaction semantics. User-critical recovery decisions require at least one real Electron path test.

## 5. Preserve the existing product surface

The prototype was useful for the decision model, not as a visual source of truth. Recovery UI was integrated through existing Element Plus controls, Inkiva theme variables, the current File menu, and the existing editor layout. Reliability work should minimize unrelated visual churn so that correctness changes remain reviewable and do not regress established editing ergonomics.
