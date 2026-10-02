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

1. **Simplicidad**: venta-fotos vende fotos digitales individuales — no necesita un carrito de compras completo ni catálogo gestionado externamente. La lógica es: seleccionar foto → pagar → recibir descarga.

2. **Costo**: Sin costo de suscripción mensual. Solo las tarifas de transacción de PayPal (~2.9% + $0.30).

3. **Control**: La lógica de negocio (liberación de archivos, registro de ventas) se queda en Firebase Functions + Firestore, sin depender de un intermediario.

4. **Integración nativa con Firebase**: El SDK de PayPal se integra directamente con Cloud Functions para webhooks de confirmación.

5. **Escalabilidad**: Para un MVP de venta de fotos, PayPal cubre el caso de uso sin over-engineering.

### Implementación

- **Frontend**: Botón de "Comprar con PayPal" usando el SDK JS de PayPal
- **Backend**: Cloud Function `createCheckoutSession` → PayPal Orders API → webhook de confirmación
- **Post-pago**: Firestore actualiza la compra, Firebase Storage genera URL de descarga firmada
- **Protección**: Solo el comprador autenticado puede descargar el archivo original

### Referencias

- [PayPal JS SDK Docs](https://developer.paypal.com/docs/checkout/standard/)
- [PayPal Orders API](https://developer.paypal.com/docs/api/orders/v2/)
- [Firebase Cloud Functions + PayPal](https://firebase.google.com/docs/functions/paypal)

---

*Decisión tomada: 2026-10-02*