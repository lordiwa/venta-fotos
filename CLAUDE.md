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