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

`syncEventCover` (TASK-028) genera la portada dedicada `covers/{eventId}/{photoId}.jpg` al escribirse un evento;
`syncPhotoCover` la regenera o la retira cuando la foto de portada cambia (ocultar/mostrar, reprocesar).
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

Añadir `--access-token-file=<ruta-token>` a cada uno si gcloud sigue logueado como srparca. Esperar
1–2 minutos y repetir el deploy. Un 409 "Could not create bucket gcf-v2-sources-…" en el mismo intento
suele resolverse al reintentar tras los permisos.

## Cuando se active PayPal

`PAYPAL_ENABLED=true` en `functions/.env`, habilitar Secret Manager, `npx firebase functions:secrets:set
PAYPAL_CLIENT_ID` y `PAYPAL_CLIENT_SECRET`, `VITE_PAYPAL_CLIENT_ID` en `.env.production.local`, y desplegar
functions sin filtro más hosting. Ambos flags van juntos: front con id y Functions sin PayPal deja un
/checkout que llama a un callable inexistente.
