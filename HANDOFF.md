# HANDOFF — venta-fotos (2026-10-21, pausa por contexto)

## Estado general
Producción: https://venta-fotos-estudio.web.app. Evento rVDKr5GlXJELAIMzr8NE, con 501 fotos.
PayPal APAGADO por decisión del humano. Su cuenta es personal (reino182@hotmail.com), no puede crear PayPal.me y no quiere pagar Business. Todos los pedidos van por WhatsApp hasta nuevo aviso.

Cerrados hoy:
- TASK-031: zoom en el visor.
- TASK-032: links de Eventos.
- TASK-033: WebP con caché.
- TASK-034: texto de paquetes.
- TASK-035: logo de círculo blanco en mosaico.
- TASK-036: WhatsApp en la misma pestaña en móvil. El humano confirmó "si funciona!".

Precios en producción, cargados en el admin: digital 5.00, paquete de 3 a 12.00, paquete de 5 a 20.00. No hay tamaños de impresión cargados.

IAM: el humano concedió roles/firebaserules.firestoreServiceAgent al service agent de Storage. Antes, los visitantes anónimos recibían 403 en todas las imágenes. Ver la memoria verify-as-anonymous: siempre verificar sin sesión.

## En curso: 2 developers en background, en el mismo working tree
### TASK-038: marca de agua al 35%
Lo pidió el humano. Dev agent a22a485f4eb8693b8.
- Cambia la opacidad en functions/src/watermark.ts y sube la versión (logo-dark-2).
- Deja una muestra en scratchpad/wm/sample1-dark-35.jpg.

Después:
1. Review.
2. Mostrar la muestra al humano.
3. El humano despliega functions con el comando del skill deploy-prod. Al orquestador el clasificador le bloquea `firebase deploy --only functions`.
4. Backfill:
   - `GCLOUD_PROJECT=venta-fotos-estudio GOOGLE_CLOUD_QUOTA_PROJECT=venta-fotos-estudio npm run backfill:webp -- --prod --functions-deployed --dry-run` (se esperan ~501 "por regenerar la marca").
   - Con el OK del humano, la misma corrida sin `--dry-run`.
5. Verificar como anónimo y cerrar.

### TASK-037: pedidos por WhatsApp registrados
Dev agent a89ea6d77d4e32156. Los casos de uso CU1–CU11 están aprobados y registrados en el ticket.
- Callable createWhatsappOrder (nombre, WhatsApp y correo si hay digitales), con precio calculado en el servidor.
- orders con estado pendiente_pago y expiresAt a las 24 h.
- Admin con pestañas Activos e Historial.
- Badge "recordar pago" a las 12 h, con un botón que abre wa.me al cliente. El recordatorio lo envía el admin a mano: la API de WhatsApp Business queda descartada por costo.
- expireOrders programada cada 15 min: pasa a anulado.
- OrderView enmascara los datos.

Después:
1. Review en contexto fresco.
2. Deploy: functions nuevas (createWhatsappOrder, expireOrders y lo que reporte el dev), índices, reglas y hosting. Puede requerir habilitar la API de Cloud Scheduler.
3. UAT del humano en el teléfono.

## Pendientes del humano
- Cargar al menos un tamaño de impresión (las fotos printOnly lo necesitan).
- Decidir el precio del paquete de 10, si lo quiere.
- Confirmar si el mensaje de WhatsApp llegó con el detalle completo, para cerrar TASK-025 y la UAT de TASK-022/023/024.

## Notas operativas
- Deploy de hosting: el orquestador puede (`--account rmatovelle84@gmail.com`).
- Deploy de functions y gcloud IAM: el clasificador los bloquea; los corre el humano con `!`.
- Nunca correr `npm run test:rules` contra el emulador vivo.
- close_task exige:
  - un comentario con author "reviewer" que empiece con `[WARGAMING]`;
  - linked_commits;
  - el estado in_review;
  - los 4 bloques, con CUn nombrados y la palabra "caminos alternativos/de fallo", y la UAT con PASS o "UAT no solicitado".
- Mobile check: pestaña de Chrome 502991348 con el iframe 'm' (390px), con `?nc=` para evitar caché.
