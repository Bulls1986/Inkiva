# Inkiva documentation map

This directory uses **progressive disclosure**. Put documents where their lifetime and loading behavior belong; do not place new topic documents directly under `docs/`.

| Area | Purpose | Loading rule |
|---|---|---|
| [`agent/`](agent/) | durable agent rules, workflow contracts, environment/testing/performance guidance | first-load only when the task needs that guide; troubleshooting recipes are on demand |
| [`architecture/`](architecture/README.md) | architecture audits, durable subsystem contracts, governance closure | open for architecture/governance work only |
| [`performance/`](performance/README.md) | performance baselines, optimization stages, historical investigations | open for performance work only; history stays under `performance/history/` |
| [`benchmark/`](benchmark/README.md) | benchmark inventory, trustworthiness and measurement provenance | open when benchmark behavior/evidence is involved |
| [`correctness/`](correctness/README.md) | correctness/readiness stages and product functional gates | open for the affected correctness domain |
| [`i18n/`](i18n/) | translated user-facing README documents | not part of agent task startup |
| [`assets/`](assets/) | documentation assets | load only when referenced |

## Placement rules

- **Reusable rule/constraint** → `docs/agent/`.
- **Low-frequency environment diagnosis/recovery** → `docs/agent/ENVIRONMENT_RECIPES.md`.
- **Task/stage evidence** → the matching domain directory (`architecture/`, `performance/`, `benchmark/`, `correctness/`).
- **Long historical ledger** → a domain-specific `history/` directory, not `docs/` root and not a first-load agent guide.
- **New domain** → create a domain directory plus a small `README.md` index before adding multiple standalone root files.

Root `AGENTS.md` should navigate primarily to quick contracts and domain indexes, not every historical document.
