# venta-fotos

Tienda en línea de un fotógrafo: publica las fotos de cada evento, la gente compra impresiones (o el archivo digital) y él las imprime y entrega en persona o por envío.

Stack: Vue 3 + TypeScript + Vite · Firebase (Hosting, Firestore, Storage, Functions, Auth) · PayPal.

## Desarrollo

```sh
npm install
cp .env.example .env   # VITE_USE_EMULATORS=true para usar los emuladores
npm run dev
npm test               # tests unitarios
npm run test:rules     # reglas de Firestore/Storage en emuladores (requiere Java 21)
```

### Administrador (login del fotógrafo)

El panel `/admin` exige una cuenta de Firebase Auth (correo y contraseña) con el custom claim `admin: true`. No hay registro ni recuperación de contraseña.

- **Asignar el claim** a una cuenta ya creada en Firebase Auth: `npm run set-admin -- fotografo@correo.com`. Contra el emulador define `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099`. Contra producción hay que pasar `--prod` explícitamente (`npm run set-admin -- fotografo@correo.com --prod`) y tener credenciales de aplicación (`gcloud auth application-default login`, y `GCLOUD_PROJECT=<id-del-proyecto>`); sin el flag y sin la variable del emulador, el script se niega. Siempre imprime el destino antes de modificar. Si la cuenta no existe, falla con un mensaje claro. La persona debe cerrar sesión y volver a entrar para que el claim surta efecto.
- **Admin de prueba en emuladores**: con el emulador de Auth corriendo (`npx firebase emulators:start --only auth,firestore,storage --project demo-venta-fotos`), ejecuta `npm run seed:admin`. Crea `admin@example.test` / `admin1234` con el claim admin (idempotente; solo apunta al emulador). Usa `VITE_USE_EMULATORS=true` en `.env`.

### Pagos con PayPal (checkout)

El checkout usa Cloud Functions `createOrder`/`captureOrder` (PayPal Orders v2, sin SDK). Las credenciales **nunca** van al cliente ni al repo:

- **Secretos de Functions** (credenciales REST de una app de PayPal, sandbox para pruebas): `firebase functions:secrets:set PAYPAL_CLIENT_ID` y `firebase functions:secrets:set PAYPAL_CLIENT_SECRET`.
- **Emuladores**: crea `functions/.secret.local` (ignorado por git, ver `*.local`) con `PAYPAL_CLIENT_ID=...` y `PAYPAL_CLIENT_SECRET=...` para probar contra el sandbox real.
- **Cliente**: `VITE_PAYPAL_CLIENT_ID` en `.env` (solo el client id público). Si falta, el checkout muestra "Pago con PayPal no configurado".
- **Producción**: el parámetro `PAYPAL_BASE_URL` es sandbox (`https://api-m.sandbox.paypal.com`) por defecto; para cobrar de verdad se define `https://api-m.paypal.com` y se usan credenciales live. La moneda es la constante `CURRENCY` (`USD`) de `functions/src/checkout.ts` (y `src/checkoutLogic.ts`).
- **Pago simulado**: con `npm run dev` y los emuladores aparece el botón "Simular pago" (solo `import.meta.env.DEV`); la Function solo lo acepta con `FUNCTIONS_EMULATOR=true`. Usa el mismo recálculo y creación de pedido, con `paypalOrderId` `SIMULADO-<id>`.

Definición del proyecto: `PROJECT.md`. Backlog: `tasks/`.
