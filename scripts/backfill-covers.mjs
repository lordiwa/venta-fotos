// Uso: node scripts/backfill-covers.mjs [--prod]   (emulador: FIRESTORE_EMULATOR_HOST=127.0.0.1:8080)
// TASK-028: re-dispara syncEventCover en los eventos con portada elegida pero sin su portada dedicada, con UNA sola
// escritura que no toca coverPhotoId: coverPath ausente -> null; coverPath ajeno -> se borra. En ambos casos planCover
// ve que no corresponde y genera covers/{id}/{foto}.{hash}.webp. Admin SDK: no lo frenan las reglas (que impiden al cliente tocar coverPath).
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'

const prod = process.argv.includes('--prod')
const projectId = process.env.GCLOUD_PROJECT || process.env.VITE_FIREBASE_PROJECT_ID || 'demo-venta-fotos'
const host = process.env.FIRESTORE_EMULATOR_HOST
if (!host && !prod) {
  console.error('FIRESTORE_EMULATOR_HOST no esta definido: esto afectaria PRODUCCION. Si es intencional, agrega --prod.')
  process.exit(1)
}
console.log(host ? `Destino: emulador de Firestore (${host})` : `Destino: PRODUCCION, proyecto ${projectId}`)
initializeApp(host ? { projectId } : { projectId, credential: applicationDefault() })
const db = getFirestore()

let n = 0
for (const d of (await db.collection('events').get()).docs) {
  const { coverPhotoId, coverPath } = d.data()
  // TASK-033: la portada vigente es covers/{id}/{foto}.{hash}.webp; el .jpg viejo lo convierte backfill:webp.
  const pre = `covers/${d.id}/${coverPhotoId}.`
  if (typeof coverPhotoId !== 'string' || !coverPhotoId || (typeof coverPath === 'string' && coverPath.startsWith(pre) && /^([0-9a-f]{12}\.webp|jpg)$/.test(coverPath.slice(pre.length)))) continue
  await d.ref.update({ coverPath: coverPath === undefined ? null : FieldValue.delete() })
  console.log(`Portada re-disparada: events/${d.id} (foto ${coverPhotoId})`)
  n++
}
console.log(n ? `${n} evento(s) re-disparado(s). La portada dedicada aparece en unos segundos (coverPath).` : 'Nada que hacer: todas las portadas ya tienen su version dedicada.')
