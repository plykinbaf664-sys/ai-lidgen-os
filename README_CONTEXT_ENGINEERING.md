# Context Engineering — LeadGen OS

This is a navigational context pack for Codex and other coding agents, **not** a replacement for source-code inspection.

| Document | Use |
|---|---|
| `AGENTS.md` | Short always-on router and safety invariants |
| `docs/PROJECT_CONTEXT.md` | Business goal, user journey, quality metrics |
| `docs/ARCHITECTURE.md` | Layers, module ownership, providers, storage |
| `docs/SYSTEM_MAP.md` | Search, research, email and lifecycle flows |
| `docs/VERIFICATION.md` | Tests, live benchmarks, readiness criteria |
| `docs/DECISIONS.md` | Durable decisions and tradeoffs |
| `docs/AGENT_WORK_STYLE.md` | Adaptive, evidence-led engineering guidance |
| `.agent/PLANS.md` | Living plan format for complex changes |

## Using this pack
These files are installed in this repository. Start with `AGENTS.md`, then read only the relevant map and affected code. Research/provider/storage boundaries and verification commands were checked on 2026-10-16. Historical live results remain dated evidence, not current acceptance. Preserve `.ai/current-task.md`, prior reports and uncommitted work; current investigation: `.agent/plans/research-context-quality.md`.

## Maintenance
Keep `AGENTS.md` short. Update product/architecture docs only for durable changes. Keep transient incidents in `.ai/current-task.md` or execution plans. Move repeatable hard rules into tests, schemas, runtime guards or constraints instead of accumulating prose. Never include secrets, raw personal datasets or hidden reasoning.
