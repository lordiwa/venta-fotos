# Decisión de Plataforma de Pago

## Opciones Evaluadas

### PayPal (SDK)
- **Ventajas**:
  - Integración directa vía SDK de JavaScript
  - Amplia adopción global
  - Firestore + Cloud Functions compatible
  - Sin comisiones adicionales por plataforma (solo las de PayPal: ~2.9% + $0.30)
  - Webhooks para confirmación de pagos
  - Sandbox para pruebas
- **Desventajas**:
  - Experiencia de checkout que redirige a PayPal (no embedded)
  - No maneja comisiones del vendedor automáticamente
  - Requiere manejar la lógica de liberación de archivos post-pago

### Ecwid
- **Ventajas**:
  - Tienda completa gestionada con carrito, catálogo, y checkout
  - Maneja impuestos, facturación, y envío (digital o físico)
  - Integración con múltiples pasarelas de pago (PayPal, Stripe, etc.)
  - Panel de administración para gestionar productos
  - Embeddable vía iframe o API
- **Desventajas**:
  - Costo adicional (plan gratuito limitado a 10 productos)
  - Planes de pago desde $15/mes
  - Comisión por transacción en plan gratuito
  - Más complejidad de la necesaria para fotos individuales
  - Dependencia externa para la lógica core del negocio

## Decisión: **PayPal SDK**

Se elige PayPal SDK por las siguientes razones:

1. **Simplicidad**: venta-fotos es la tienda de un solo fotógrafo. El comprador arma un carrito con fotos de un evento (tamaño de impresión, copias y/o archivo digital) y paga el total en una sola orden de PayPal. El catálogo y el carrito viven en nuestra app; no hace falta una tienda gestionada externamente como Ecwid.

2. **Costo**: Sin costo de suscripción mensual. Solo las tarifas de transacción de PayPal (~2.9% + $0.30).

3. **Control**: La lógica de negocio (registro del pedido, lista de impresión, estados de entrega, liberación del archivo digital) se queda en Firebase Functions + Firestore, sin depender de un intermediario.

4. **Integración nativa con Firebase**: El SDK de PayPal se integra directamente con Cloud Functions para webhooks de confirmación.

5. **Escalabilidad**: Para un MVP de venta de fotos, PayPal cubre el caso de uso sin over-engineering.

### Implementación

- **Frontend**: Botón de "Comprar con PayPal" usando el SDK JS de PayPal
- **Backend**: Cloud Function `createOrder` recalcula el total del carrito en el servidor a partir del catálogo (nunca confía en el precio que manda el cliente) → PayPal Orders API (una orden con varias líneas; el envío va como línea aparte si aplica) → `captureOrder` + webhook de confirmación
- **Post-pago**: Firestore marca el pedido como `pagado` y aparece en el panel del fotógrafo con su método de entrega (retiro o envío). Se manda un correo de confirmación al comprador
- **Archivo digital**: si el pedido incluye el digital, Firebase Storage genera una URL firmada con vencimiento que se envía por correo al comprador
- **Protección**: los originales en alta resolución nunca son públicos; la galería solo sirve vistas previas con marca de agua

### Referencias

- [PayPal JS SDK Docs](https://developer.paypal.com/docs/checkout/standard/)
- [PayPal Orders API](https://developer.paypal.com/docs/api/orders/v2/)
- [Firebase Cloud Functions + PayPal](https://firebase.google.com/docs/functions/paypal)

---

*Decisión tomada: 2026-10-02 · Actualizada: 2026-10-03 (tienda de eventos con impresiones, carrito y entrega física)*