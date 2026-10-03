---
project_name: venta-fotos
project_type: web-saas
generated_at: 2026-10-03T18:46:52.196Z
schema_version: 1
---

## Problem
Después de cada evento, el fotógrafo no tiene una forma ordenada de mostrar las fotos, cobrar los pedidos de impresión y llevar el control de qué imprimir y a quién entregar.

Tienda en línea de un fotógrafo: publica las fotos de cada evento que cubre, la gente compra impresiones (y/o el archivo digital) y él las imprime y las entrega en persona o por envío.

### Goals
- El fotógrafo crea un evento y sube sus fotos en lote
- Los asistentes navegan la galería pública del evento, eligen fotos, tamaño de impresión y cantidad de copias, y las agregan al carrito
- El pago se hace en línea con PayPal; sin cuota mensual, solo las comisiones de PayPal
- El fotógrafo tiene un panel de pedidos con lo que debe imprimir, cómo se entrega (retiro o envío) y en qué estado está cada pedido
- Si se compró el archivo digital, el comprador lo descarga en alta resolución tras pagar

### Scope (in)
- Galería pública organizada por eventos (lista de eventos → cuadrícula de fotos)
- Vistas previas con marca de agua y resolución reducida; los originales nunca son públicos
- Subida en lote de fotos a un evento (solo el fotógrafo)
- Catálogo de productos configurable: tamaños de impresión con precio y archivo digital
- Carrito con varias fotos, tamaño y cantidad por línea
- Checkout con PayPal; datos de contacto del comprador y elección de entrega: retiro en persona o envío a domicilio (con dirección)
- Panel del fotógrafo: pedidos pagados, lista de impresión, estados (pagado → impreso → listo para retiro / enviado → entregado)
- Notificación por correo al comprador (confirmación y cambios de estado)
- Descarga del archivo digital mediante un enlace firmado con vencimiento
- Firebase Auth para el fotógrafo (administrador)

### Scope (out)
- Varios fotógrafos o marketplace
- Impresión automática o integración con laboratorios de impresión
- Reconocimiento facial o búsqueda de fotos por persona
- Cálculo automático de costos de envío o integración con transportistas
- Suscripciones mensuales
- Video
- Aplicación móvil nativa

## Stack
- frontend_framework: vue3-typescript-vite
- backend_framework: firebase-functions-node
- database: firestore
- web_deployment_target: firebase-hosting

## Testing conventions
Use the testing tool that fits this stack — the project standard is to keep a fast unit suite runnable via the project's default test command, and to write a failing test before any new behavior lands. Tests live next to the code they exercise (or under a top-level tests/ tree, whichever already exists in this repo); follow the local convention rather than introducing a new one.

## Linting and formatting
Run the project's linter and formatter before every commit. If the repo ships a config (e.g., .eslintrc, ruff.toml, .prettierrc, gofmt defaults), defer to it without arguing; if no config exists yet, use the ecosystem-standard tool and add a minimal config rather than reformatting the whole tree in a drive-by change.

## Type-specific guidance
- Treat the browser and the backend as separate trust boundaries — never assume client-supplied data is well-formed at HTTP entry points.
- Reach for end-to-end tests sparingly; cover routing and frontend state-transition logic with focused integration tests at the boundary.
- Sessions and auth tokens are sensitive — never log them, and isolate any HTTP middleware that touches them behind a small, reviewable surface.
- Performance budgets matter: measure both server latency and browser time-to-interactive when changing data-fetch patterns.
