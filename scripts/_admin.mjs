import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

const projectId = process.env.GCLOUD_PROJECT || process.env.VITE_FIREBASE_PROJECT_ID || 'demo-venta-fotos'

/** Sin FIREBASE_AUTH_EMULATOR_HOST se exige --prod explicito; siempre imprime el destino antes de mutar. */
export function adminAuth(allowProd) {
  const host = process.env.FIREBASE_AUTH_EMULATOR_HOST
  if (!host && !allowProd) {
    console.error('FIREBASE_AUTH_EMULATOR_HOST no esta definido: esto afectaria PRODUCCION. Si es intencional, agrega --prod.')
    process.exit(1)
  }
  console.log(host ? `Destino: emulador de Auth (${host})` : `Destino: PRODUCCION, proyecto ${projectId}`)
  initializeApp(host ? { projectId } : { projectId, credential: applicationDefault() })
  return { auth: getAuth(), emulator: !!host, projectId }
}
