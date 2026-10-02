# Session State

This directory holds the orchestrator session state for the hivemind workflow.

- `session.json` — Pointer file with `active_session_id` (nullable) and `schema_version`.
- `sessions/` — Self-contained bundle directories, each holding its own `session.json` with full orchestrator state (workflow_step, handoff_summary, next_action, open_questions, blockers, decisions, subagent_results).

## Lifecycle

- **Start**: Set `active_session_id` to a new UUID, create `sessions/<id>/session.json`.
- **Pause**: Write updated state to the bundle; leave `active_session_id` set so resume can find it.
- **Resume**: Read `session.json` for the pointer, read the bundle for the full state.
- **End**: Set `active_session_id` to null.

## Atomic writes

All writes use the two-phase pattern: write to a `.tmp.<pid>-<hex>` sibling, then rename over the target. This guarantees the file is never partially written on crash.