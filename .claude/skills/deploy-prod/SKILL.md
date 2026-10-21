---
name: deploy-prod
description: Load when deploying venta-fotos to production (Firebase project venta-fotos-estudio) — hosting, Functions, rules — or when a deploy fails with secrets, IAM, quota-project or ADC errors. Carries the credential setup, the filtered Functions deploy while PayPal is off, and the one-time IAM bindings for 2nd-gen Functions.
---

# Deploy a producción (venta-fotos-estudio)

Autorización vigente (humano, 2026-10-16): el orquestador puede lanzar `firebase deploy` y los
`gcloud projects add-iam-policy-binding` del proyecto sin pedir confirmación. Confirmar antes de
cualquier acción destructiva (borrar funciones, datos, force-push).

## Cuentas y credenciales

| Qué | Cuenta | Notas |
|---|---|---|
| Firebase CLI (`npx firebase`) | rmatovelle84@gmail.com | Owner del proyecto. `npx firebase login:list` para comprobar. |
| ADC (`%APPDATA%\gcloud\application_default_credentials.json`) | rmatovelle84@gmail.com | Lo usan `scripts/set-admin.mjs` y cualquier `google-auth-library`. Renovar con `gcloud auth application-default login` marcando TODAS las casillas (si no, "Scope has changed"). |
| gcloud CLI (`gcloud auth list`) | srparca@gmail.com | SIN rol en el proyecto. No sirve para IAM. Usar un token de ADC: `--access-token-file=<archivo>`. |

Token de ADC para gcloud (sin imprimirlo):

```
GOOGLE_CLOUD_QUOTA_PROJECT=venta-fotos-estudio node -e "const {GoogleAuth}=require('google-auth-library');new GoogleAuth({scopes:['https://www.googleapis.com/auth/cloud-platform']}).getClient().then(c=>c.getAccessToken()).then(t=>require('fs').writeFileSync(process.argv[1],t.token))" <ruta-token>
gcloud projects get-iam-policy venta-fotos-estudio --access-token-file=<ruta-token>
```

Claim de admin en producción (el humano lo corre con `!` si el clasificador lo bloquea):

```
GCLOUD_PROJECT=venta-fotos-estudio GOOGLE_CLOUD_QUOTA_PROJECT=venta-fotos-estudio npm run set-admin -- <correo> --prod
```

## Hosting

```
npm run build && npx firebase deploy --only hosting --project venta-fotos-estudio
```

`.env.production.local` define el proyecto; NO debe tener `VITE_PAYPAL_CLIENT_ID` mientras PayPal esté
apagado (TASK-027: sin ese id la tienda queda en modo WhatsApp y /checkout redirige al carrito).

## Functions (PayPal apagado, decisión del humano 2026-10-16)

1. `functions/.env` (gitignored; recrear desde `functions/.env.example`): `PAYPAL_ENABLED=false`,
   `PAYPAL_BASE_URL=https://api-m.paypal.com`, `DOWNLOAD_TTL_DAYS=7`. Sin él, el deploy no interactivo
   falla con "have no value for PAYPAL_BASE_URL, DOWNLOAD_TTL_DAYS".
2. Con `PAYPAL_ENABLED` distinto de `true`, `createOrder`/`captureOrder` no se exportan y la CLI no exige
   los secretos PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET.
3. Deploy filtrado:

```
npm run build:functions && npx firebase deploy --only functions:processPhoto,functions:cleanupPhotoFiles,functions:getDownloadLinks,functions:advanceOrder,functions:syncEventCover,functions:syncPhotoCover --project venta-fotos-estudio --force
```

`syncEventCover` (TASK-028) genera la portada dedicada `covers/{eventId}/{photoId}.{hash}.webp` (TASK-033) al escribirse un evento;
`syncPhotoCover` la regenera o la retira cuando la foto de portada cambia (ocultar/mostrar, reprocesar).
Ambas llevan `retry: true` (TASK-028 M-7): un fallo de Firestore/Storage se relanza y Eventarc reintenta
(hasta ~24 h). Un error que se repite aparece en los logs como `cover.sync failed, se reintenta`; un original
corrupto NO reintenta (`cover.sync: original no valido`).
Se exporta siempre (no depende de PayPal).

## Reglas

Si cambian `firestore.rules` o `storage.rules`, desplegarlas junto con las Functions que las necesitan:

```
npx firebase deploy --only storage,firestore:rules --project venta-fotos-estudio
```

TASK-028 cambia ambas (`covers/` en Storage; `coverPath` no escribible por el cliente): desplegar reglas,
Functions y hosting en el mismo pase.

## Backfill de portadas (TASK-028)

Tras el primer deploy de `syncEventCover`, los eventos que ya tenian portada no tienen aun `coverPath`.
O el admin re-elige la portada (elegir otra foto y volver a la original), o:

```
GCLOUD_PROJECT=venta-fotos-estudio GOOGLE_CLOUD_QUOTA_PROJECT=venta-fotos-estudio npm run backfill:covers -- --prod
```

Idempotente, una sola escritura por evento (`coverPath` a null o borrado; nunca toca `coverPhotoId`): solo eventos cuya `coverPath` no corresponde a su `coverPhotoId`.

## Backfill WebP (TASK-033)

Desde TASK-033 miniaturas, vistas previas y portadas son `{id}.{hash}.webp` con Cache-Control de un año
(`immutable`; el hash del contenido va en el nombre). Las fotos ya subidas siguen en `.jpg` hasta el backfill.
El ORDEN es obligatorio: las Functions viejas siguen escribiendo y borrando `.jpg`, y un `syncEventCover` viejo
desharía la portada webp.

1. Desplegar las Functions (el deploy filtrado de arriba: processPhoto, cleanupPhotoFiles, syncEventCover,
   syncPhotoCover, ...).
2. Esperar a que termine el rollout (la CLI dice "Deploy complete!"; dar unos minutos para que mueran las
   instancias viejas).
3. Ensayo, no escribe nada:

```
GCLOUD_PROJECT=venta-fotos-estudio GOOGLE_CLOUD_QUOTA_PROJECT=venta-fotos-estudio npm run backfill:webp -- --prod --functions-deployed --dry-run
```

4. Corrida real (misma línea sin `--dry-run`; `--event <id>[,<id>]` para limitar a unos eventos). Idempotente:
   si se corta, se vuelve a correr. Sale con código 1 si hubo errores (foto o portada); revisar las líneas `ERROR`.

`--prod` sin `--functions-deployed` se niega a correr. ADC como rmatovelle84@gmail.com (ver Cuentas).

Región: southamerica-east1. Bucket de Storage: `venta-fotos-estudio.firebasestorage.app`.

### Permisos IAM de la primera vez (2nd gen + Eventarc)

Número de proyecto 508685694209. Si el deploy dice "Failed to verify the project has the correct IAM
bindings" o "Permission storage.buckets.get denied ... Eventarc service account", conceder (como Owner;
el clasificador de Claude Code suele bloquear esto, entonces lo corre el humano con `!`):

```
gcloud projects add-iam-policy-binding venta-fotos-estudio --member=serviceAccount:service-508685694209@gs-project-accounts.iam.gserviceaccount.com --role=roles/pubsub.publisher
gcloud projects add-iam-policy-binding venta-fotos-estudio --member=serviceAccount:service-508685694209@gcp-sa-pubsub.iam.gserviceaccount.com --role=roles/iam.serviceAccountTokenCreator
gcloud projects add-iam-policy-binding venta-fotos-estudio --member=serviceAccount:508685694209-compute@developer.gserviceaccount.com --role=roles/run.invoker
gcloud projects add-iam-policy-binding venta-fotos-estudio --member=serviceAccount:508685694209-compute@developer.gserviceaccount.com --role=roles/eventarc.eventReceiver
gcloud projects add-iam-policy-binding venta-fotos-estudio --member=serviceAccount:service-508685694209@gcp-sa-eventarc.iam.gserviceaccount.com --role=roles/eventarc.serviceAgent
```

Reglas de Storage con `firestore.get()` (eventPublished): sin este rol, Storage responde 403 a TODO visitante
anónimo (el admin entra igual por `isAdmin()`, así que probando logueado no se ve). Se notó el 2026-10-21:

```
gcloud projects add-iam-policy-binding venta-fotos-estudio --member=serviceAccount:service-508685694209@gcp-sa-firebasestorage.iam.gserviceaccount.com --role=roles/firebaserules.firestoreServiceAgent --condition=None
```

Tras concederlo hay unos minutos de 403 intermitentes mientras se propaga. Verificar SIEMPRE como anónimo
(curl sin token a `.../o/<thumbPath>`), nunca solo con la sesión de admin.

Añadir `--access-token-file=<ruta-token>` a cada uno si gcloud sigue logueado como srparca. Esperar
1–2 minutos y repetir el deploy. Un 409 "Could not create bucket gcf-v2-sources-…" en el mismo intento
suele resolverse al reintentar tras los permisos.

## Cuando se active PayPal

`PAYPAL_ENABLED=true` en `functions/.env`, habilitar Secret Manager, `npx firebase functions:secrets:set
PAYPAL_CLIENT_ID` y `PAYPAL_CLIENT_SECRET`, `VITE_PAYPAL_CLIENT_ID` en `.env.production.local`, y desplegar
functions sin filtro más hosting. Ambos flags van juntos: front con id y Functions sin PayPal deja un
/checkout que llama a un callable inexistente.
