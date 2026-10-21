/** Cliente minimo de PayPal Orders v2 por fetch (sin SDK). La configuracion se inyecta para poder probarlo. */
import { centsToString, CheckoutError, CheckoutSnapshot, PaypalCaptureResponse, toCents } from "./checkout";

export interface PaypalConfig { baseUrl: string; clientId: string; clientSecret: string; fetchFn?: typeof fetch }

async function token(c: PaypalConfig): Promise<string> {
  const f = c.fetchFn ?? fetch;
  const res = await f(`${c.baseUrl}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${c.clientId}:${c.clientSecret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`PayPal OAuth ${res.status}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

/** Crea la orden CAPTURE con un purchase_unit: items + envio, total = el calculado por el servidor. Devuelve el id de PayPal. */
export async function createPaypalOrder(c: PaypalConfig, snap: CheckoutSnapshot): Promise<string> {
  const f = c.fetchFn ?? fetch;
  const shippingCents = snap.delivery.method === "envio" ? toCents(snap.delivery.cost) : 0;
  // Los items van a precio suelto; el ahorro por paquetes (TASK-029) es el descuento que cuadra con el total del servidor.
  const itemCents = snap.lines.reduce((s, l) => s + toCents(l.unitPrice) * l.quantity, 0);
  const discountCents = itemCents + shippingCents - snap.totalCents;
  const body = {
    intent: "CAPTURE",
    purchase_units: [{
      amount: {
        currency_code: snap.currency,
        value: centsToString(snap.totalCents),
        breakdown: {
          item_total: { currency_code: snap.currency, value: centsToString(itemCents) },
          shipping: { currency_code: snap.currency, value: centsToString(shippingCents) },
          ...(discountCents > 0 ? { discount: { currency_code: snap.currency, value: centsToString(discountCents) } } : {}),
        },
      },
      items: snap.lines.map((l) => ({
        name: l.productName.slice(0, 127),
        quantity: String(l.quantity),
        unit_amount: { currency_code: snap.currency, value: centsToString(toCents(l.unitPrice)) },
      })),
    }],
  };
  const res = await f(`${c.baseUrl}/v2/checkout/orders`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await token(c)}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PayPal create ${res.status}`);
  return ((await res.json()) as { id: string }).id;
}

/** Captura con PayPal-Request-Id = id de la orden (idempotente). Rechazo del medio de pago -> CheckoutError; ya capturada -> la lee. */
export async function capturePaypalOrder(c: PaypalConfig, paypalOrderId: string): Promise<PaypalCaptureResponse> {
  const f = c.fetchFn ?? fetch;
  const bearer = `Bearer ${await token(c)}`;
  const id = encodeURIComponent(paypalOrderId);
  const res = await f(`${c.baseUrl}/v2/checkout/orders/${id}/capture`, {
    method: "POST",
    headers: { Authorization: bearer, "Content-Type": "application/json", "PayPal-Request-Id": paypalOrderId },
    body: "{}",
  });
  if (res.ok) return (await res.json()) as PaypalCaptureResponse;
  const err = (await res.json().catch(() => ({}))) as { details?: { issue?: string }[] };
  if ((err.details ?? []).some((d) => d.issue === "ORDER_ALREADY_CAPTURED")) {
    const again = await f(`${c.baseUrl}/v2/checkout/orders/${id}`, { headers: { Authorization: bearer } });
    if (again.ok) return (await again.json()) as PaypalCaptureResponse;
  }
  if (res.status === 422) throw new CheckoutError("failed-precondition", "El pago fue rechazado. Prueba con otro medio de pago.");
  throw new Error(`PayPal capture ${res.status}`);
}
