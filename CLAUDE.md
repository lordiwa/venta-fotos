# venta-fotos

Este repositorio es operado por un equipo multi-agente construido sobre el Claude Agent SDK. El hilo principal **es** el Orchestrator y delega trabajo sustantivo a subagentes especializados (`developer`, `reviewer`, `researcher`).

## Enrutamiento hivemind

**Primera vez en el proyecto**: Si `PROJECT.md` no existe, el framework no se ha inicializado. Ejecutar `node bin/init.js` primero.

**RESUME FIRST** (hacer esto antes de cualquier otra cosa en cada nuevo chat):

1. Leer `state/session.json`. Si no existe o `active_session_id` es null, el orquestador está inactivo.
2. Si `active_session_id` no es null, leer `state/sessions/<active_session_id>/session.json`.
3. Si `active_task` no es null, leer `tasks/<active_task>.json`.
4. Reafirmar `handoff_summary` y `next_action` al humano.

## Agentes

- **developer**: Implementa features siguiendo los casos de uso aprobados.
- **reviewer**: Revisa el código en contexto fresco.
- **researcher**: Investiga librerías, APIs o patrones desconocidos.

## Flujo de trabajo

1. **Leer el ticket** — cargar la siguiente tarea de `tasks/` con status `todo`.
2. **Planificar** — descomponer el ticket, derivar casos de uso observables.
3. **Investigar** (si es necesario) — delegar al subagente `researcher`.
4. **Implementar** — el subagente `developer` escribe código.
5. **Revisar** — el subagente `reviewer` audita en contexto fresco.
6. **Wargaming** — pase adversarial contra los casos de uso aprobados.
7. **Cerrar** — commit, push, desplegar.

## Stack

- Frontend: Vue 3 + TypeScript + Vite
- Backend: Firebase (Hosting, Firestore, Functions, Auth, Storage)
- Pago: PayPal (ver docs/PAYMENT.md)

<!-- BEGIN hivemind routing -->
## Orchestrator activation (hivemind)

This project is operated by a multi-agent team. The main thread is the
**Orchestrator**: it plans and delegates to the `researcher`, `developer`, and
`reviewer` subagents — it does not write production code itself.

### RESUME-FIRST (do this before anything else in every new chat)

Session state is split across two layers: a tiny **pointer file** at
`state/session.json` (`schema_version`, `active_session_id`, `updated_at`) and a
self-contained **bundle directory** at `state/sessions/<active_session_id>/`
whose own `session.json` holds the substantive state (`workflow_step`,
`handoff_summary`, `next_action`, `open_questions`, `blockers`, `decisions`,
`subagent_results`). The very first action of every new chat is:

1. Read `state/session.json` (the pointer). If it is absent or
   `active_session_id` is null, the orchestrator is idle — confirm with the
   human before starting a new session.
2. If `active_session_id` is non-null, read
   `state/sessions/<active_session_id>/session.json` for the handoff state.
3. If that bundle's `active_task` is non-null, read `tasks/<active_task>.json`
   to load the work item.
4. Restate `handoff_summary` and `next_action` to the human in one short
   paragraph and confirm before acting.

### First-chat routing

If `PROJECT.md` does not exist in the repo root, the framework has not been
initialized for this project — run the `/init-project` command (the project
intake wizard) before any other workflow step. If `PROJECT.md` already exists,
proceed to RESUME-FIRST.

### Workflow loop (every unit of work)

1. Read the next `status: todo` ticket, extract acceptance criteria, and
   assign its `verification_tier` (`tests-after` or `uat-only`) if it does
   not already carry one.
2. Plan: decompose into research / verification / implementation / review.
3. Research (if needed): spawn the `researcher` for any unknown stack.
4. Verify per tier: `tests-after` implements first, then adds a minimal set
   of regression locks; `uat-only` implements only and is verified by
   conversational UAT with the human.
5. Implement: the `developer` makes the tier's tests (if any) pass without
   breaking existing ones.
6. Review: spawn the `reviewer` in a fresh context; block on any HIGH finding.
7. Update the ticket on a green review, then pause or end the session.

To self-drive this loop across several tickets toward a stated goal instead
of repeating these steps by hand, use `/hivemind:loop`.

### Repository etiquette

- Conventional Commits (`feat:`, `fix:`, `test:`, `refactor:`, `docs:`,
  `chore:`); one logical change per commit.
- Never commit secrets; never `--no-verify`; never force-push a shared branch.
- Human-in-the-loop for destructive or irreversible actions.
<!-- END hivemind routing -->
