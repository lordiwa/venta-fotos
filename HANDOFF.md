# HANDOFF — venta-fotos (2026-10-11, pausa por contexto)

## Objetivo del loop
`/hivemind:loop` con goal `keys:TASK-014,TASK-016,TASK-017,TASK-018,TASK-019`: prototipo Vue 3 de la tienda de fotos.
Permisos del humano (unattended + auto_push): auto-close, auto-push, UAT delegado al orquestador, auto-consolidate.
Los casos de uso de los 5 tickets ya están APROBADOS por el humano.

## Estado
| Ticket | Estado |
|---|---|
| TASK-011 login | done (cerrado sin UAT por decisión del humano) |
| TASK-014 catálogo admin | done, pusheado |
| TASK-016 carrito | done, pusheado |
| TASK-017 checkout PayPal + "Simular pago" | done, pusheado |
| TASK-018 panel de pedidos + lista de impresión | done, pusheado (997d334) |
| **TASK-019 descargas digitales** | **in_review**, commit local 8c64cff (NO pusheado) |

## TASK-019: dónde quedó
- Developer (teammate `dev-checkout`) entregó 8c64cff: getDownloadLinks, /descargas, DownloadList, límite de intentos en downloadAttempts y DOWNLOAD_TTL_DAYS=7.
- Wargaming en navegador HECHO y registrado en el ticket: CU1–CU8 sobreviven.
  - MEDIUM W-1: el límite por IP se salta con un X-Forwarded-For falso. Arreglo: usar la IP real (`request.rawRequest.ip`, o la entrada de XFF que agrega GFE, no la primera).
  - LOW: sufijos "[404]"/"[429]" en los mensajes al comprador (también en checkout).
- **Review RECIBIDA** (registrada en el ticket): REQUEST-CHANGES por R-1 (falta uat). Antes de cerrar hay que arreglar:
  - M-1: el limitador por IP toma la entrada izquierda de XFF; usar la derecha (la de GFE) y agregar un test. Coincide con W-1 del wargaming.
  - M-2: quitar `email` del resumen de captureOrder; el cliente ya lo tiene del form y lo guarda en saveSummary.
  - LOW: DIGITAL_ID duplicado; filename* UTF-8 y extensión en responseDisposition.
  - M-4: justificar la cantidad de specs en el hand-off.
  - M-5: correr el test de reglas de downloadAttempts y el caso de integración CU8 (paso de verificación final).
  - El vencimiento real (AC3) y la firma v4 solo se verifican desplegados; dejarlo explícito en el uat como pendiente de deploy.
- Luego:
  1. ronda de fix con el developer (W-1, quitar sufijos "[NNN]" y lo que diga el reviewer);
  2. comentario `uat` (los AC de TASK-019 con PASS; CU3 vencimiento solo en UI, porque el emulador no lo aplica) y `[FINDING-RESOLVED]` de los HIGH;
  3. `close_task` con los 4 bloques de PLANTILLA-ENTREGA (el bloque 3 debe nombrar "caminos alternativos/de fallo");
  4. commit `chore: cierre de TASK-019` y push.

## Verificación final pendiente (antes de terminar el loop)
1. Detener los emuladores de desarrollo y vite (corren en background: emuladores en puertos 4000/5001/8080/9099/9199, vite en 5180).
2. `npm run test:rules` (incluye los tests nuevos de checkouts y downloadAttempts) y `npm run test:functions:integration` (casos CU8 de TASK-017 y TASK-019; el puerto de integración es 5101).
   OJO: NO correr rules-tests contra los emuladores vivos, porque borran los datos (ver memoria rules-tests-wipe-emulator).
3. Salir del loop: `loop-ctl set-mode --mode harness` y luego `loop-ctl release`.

## Preguntas abiertas al humano
- ¿Agregar al panel de pedidos la vista de "cobros sin pedido" (checkouts captura_pendiente/captura_no_coincide) con "reintentar captura"? No está aprobada; seguimiento anotado en TASK-018.
- Credenciales sandbox de PayPal: el popup real (pagar/cancelar) no se probó. Van en `functions/.secret.local` (PAYPAL_CLIENT_ID/SECRET) y `.env` (VITE_PAYPAL_CLIENT_ID).

## Datos de prueba en el emulador (se pierden al reiniciar)
- Admin del seed (scripts/seed-admin.mjs).
- Evento "Carrera 10K" CIq6ntKNrb6hdbbhJSbR (3 fotos).
- Productos p10x15, p13x18, p20x25, digital.
- Pedidos de prueba: TYYXUQRC (digital), YC67G9RR (solo impresión), entre otros.
