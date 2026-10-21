// Uso: npm run backfill:webp -- [--dry-run] [--event <id>[,<id>...]] [--prod --functions-deployed]
//   emulador:   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9199
//   produccion: GCLOUD_PROJECT=venta-fotos-estudio GOOGLE_CLOUD_QUOTA_PROJECT=venta-fotos-estudio + ADC del dueno, y --prod
// ORDEN en produccion (R-1): 1) desplegar las Functions actuales (TASK-033 + TASK-035; processPhoto, cleanupPhotoFiles,
// syncEventCover, syncPhotoCover); 2) esperar a que termine el rollout (las instancias viejas siguen escribiendo y borrando .jpg, y
// syncEventCover viejo desharia la portada webp); 3) --dry-run; 4) la corrida real. --prod exige --functions-deployed.
//   bucket: STORAGE_BUCKET (por defecto {proyecto}.firebasestorage.app en produccion, {proyecto}.appspot.com en emulador)
// TASK-033: convierte a WebP versionado las fotos listas (miniatura + vista previa) y la portada dedicada de cada evento,
// con el MISMO codigo de las Functions (functions/lib, compilado por el npm script): publishDerivatives sube, actualiza
// el documento en una transaccion y recien despues borra el .jpg viejo; la portada la regenera syncCover (mismas
// invariantes que el trigger). Idempotente: lo ya convertido se salta. Sin bucles: cambiar thumbPath/previewPath no
// dispara syncPhotoCover (no cambia visible/status/originalPath) y el coverPath webp deja planCover en "none".
// TASK-035: tambien regenera las vistas previas hechas con otra marca de agua (watermarkVersion distinto del actual
// o ausente). Los originales solo se leen. La miniatura no cambia (mismo contenido -> misma ruta, no se borra).
// En produccion, --functions-deployed = ya estan desplegadas las Functions con la marca actual (si no, un reproceso
// de las viejas volveria a escribir la marca anterior; una nueva corrida lo corrige).
import { createRequire } from 'node:module'

const fail = (msg) => { console.error(msg); process.exit(1) }
const args = process.argv.slice(2)
const prod = args.includes('--prod')
const dry = args.includes('--dry-run')
const evArg = args.find((a) => a.startsWith('--event='))?.slice(8) ?? (args.includes('--event') ? args[args.indexOf('--event') + 1] ?? '' : undefined)
const only = evArg === undefined ? undefined : evArg.split(',').map((s) => s.trim()).filter(Boolean)
if (only && (!only.length || only.some((id) => id.startsWith('--')))) fail('--event necesita uno o mas ids: --event <id>[,<id>...]')
const CONCURRENCY = 4

const projectId = process.env.GCLOUD_PROJECT || process.env.VITE_FIREBASE_PROJECT_ID || 'demo-venta-fotos'
const fsHost = process.env.FIRESTORE_EMULATOR_HOST
const stHost = process.env.FIREBASE_STORAGE_EMULATOR_HOST
if (!!fsHost !== !!stHost) {
  console.error('Define FIRESTORE_EMULATOR_HOST y FIREBASE_STORAGE_EMULATOR_HOST juntos (o ninguno): no se mezcla emulador y produccion.')
  process.exit(1)
}
if (!fsHost && !prod) fail('Sin emuladores definidos: esto afectaria PRODUCCION. Si es intencional, agrega --prod.')
if (!fsHost && !args.includes('--functions-deployed')) {
  fail('Produccion: primero desplegar las Functions actuales (TASK-033 webp + TASK-035 logo, variante final) y esperar el rollout; despues agregar --functions-deployed, ensayar con --dry-run y recien entonces la corrida real (ver deploy-prod).')
}

// Todo desde functions/node_modules: un solo firebase-admin (FieldValue/Firestore del mismo paquete que functions/lib).
const require = createRequire(new URL('../functions/package.json', import.meta.url))
const { initializeApp, applicationDefault } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')
const { getStorage } = require('firebase-admin/storage')
const { publishDerivatives } = require('./lib/process.js')
const { syncCover } = require('./lib/cover.js')
const { planCover } = require('./lib/coverLogic.js')
const { webpReason, legacyToDelete } = require('./lib/derived.js')
const { WATERMARK_VERSION } = require('./lib/watermark.js')
const bucketName = process.env.STORAGE_BUCKET || (fsHost ? `${projectId}.appspot.com` : `${projectId}.firebasestorage.app`)
console.log(fsHost ? `Destino: emuladores (${fsHost}, ${stHost}), bucket ${bucketName}` : `Destino: PRODUCCION, proyecto ${projectId}, bucket ${bucketName}`)
if (dry) console.log('--dry-run: no se sube, escribe ni borra nada.')
initializeApp(fsHost ? { projectId, storageBucket: bucketName } : { projectId, credential: applicationDefault(), storageBucket: bucketName })
const db = getFirestore()
const bucket = getStorage().bucket()

/** Ejecuta fn sobre items con a lo sumo n en paralelo. */
async function pool(items, n, fn) {
  let i = 0
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) await fn(items[i++]) }))
}

const events = only
  ? (await Promise.all(only.map((id) => db.doc(`events/${id}`).get()))).filter((d) => d.exists || void console.warn(`events/${d.id} no existe`))
  : (await db.collection('events').get()).docs
const totals = { converted: 0, skipped: 0, failed: 0, covers: 0, coversSkipped: 0, legacy: 0, format: 0, watermark: 0 }

for (const e of events) {
  const photos = (await e.ref.collection('photos').get()).docs
  const reasons = photos.map((d) => webpReason(d.data(), e.id, d.id))
  const todo = photos.filter((_, i) => reasons[i])
  const nFormat = reasons.filter((r) => r === 'format').length
  const nMark = reasons.filter((r) => r === 'watermark').length
  totals.format += nFormat
  totals.watermark += nMark
  console.log(`events/${e.id}: ${todo.length} de ${photos.length} foto(s): ${nFormat} por convertir a webp, ${nMark} por regenerar la marca (${WATERMARK_VERSION})`)
  let done = 0
  if (!dry) {
    await pool(todo, CONCURRENCY, async (d) => {
      const { originalPath } = d.data()
      let res
      try {
        const [original] = await bucket.file(originalPath).download()
        // Solo si la foto sigue lista con el mismo original (no se pisa un reproceso en curso).
        const ok = await publishDerivatives(db, bucket, e.id, d.id, original, undefined, (cur) => cur.status === 'ready' && cur.originalPath === originalPath)
        res = ok ? 'convertida' : 'saltada (cambio mientras se convertia)'
        totals[ok ? 'converted' : 'skipped']++
      } catch (err) {
        res = `ERROR ${err?.message ?? err}`
        totals.failed++
      }
      console.log(`  [${++done}/${todo.length}] ${d.id}: ${res}`)
    })
  }

  if (planCover(e.id, e.data()).kind === 'generate') {
    if (dry) console.log(`  portada: se regeneraria en WebP (foto ${e.get('coverPhotoId')})`)
    else {
      try {
        const r = await syncCover(db, bucket, e.id, e.data())
        console.log(`  portada: ${r}`)
        // "error": original corrupto o error permanente (syncCover no relanza); "skipped": foto oculta/no lista/sin original.
        if (r === 'error') totals.failed++
        else if (r === 'skipped') totals.coversSkipped++
        else totals.covers++
      } catch (err) {
        console.log(`  portada: ERROR ${err?.message ?? err}`)
        totals.failed++
      }
    }
  }

  // .jpg sin referencia (conversion cortada entre la publicacion y el borrado): se releen los documentos.
  const lists = await Promise.all(['thumbs', 'previews', 'covers'].map((dir) => bucket.getFiles({ prefix: `${dir}/${e.id}/` })))
  const names = lists.flatMap(([files]) => files.map((f) => f.name))
  const fresh = dry ? photos : (await e.ref.collection('photos').get()).docs
  const evNow = dry ? e : await e.ref.get()
  const referenced = new Set([evNow.get('coverPath'), ...fresh.flatMap((d) => [d.get('thumbPath'), d.get('previewPath')])])
  // En --dry-run las fotos por convertir aun referencian su .jpg: se informa solo lo ya huerfano.
  const orphans = legacyToDelete(names, referenced)
  if (orphans.length) {
    console.log(`  ${orphans.length} .jpg sin referencia ${dry ? 'se borrarian' : 'borrado(s)'}`)
    if (!dry) await pool(orphans, CONCURRENCY, (n) => bucket.file(n).delete({ ignoreNotFound: true }))
    totals.legacy += orphans.length
  }
}

console.log(`Plan: ${totals.format} foto(s) por convertir a webp, ${totals.watermark} por regenerar la marca (${WATERMARK_VERSION}).`)
console.log(`Listo${dry ? ' (dry-run)' : ''}: ${totals.converted} convertida(s), ${totals.skipped} saltada(s), ${totals.failed} error(es), ${totals.covers} portada(s) procesada(s), ${totals.coversSkipped} portada(s) retirada(s) (foto no apta), ${totals.legacy} .jpg huerfano(s).`)
if (totals.failed) process.exitCode = 1
