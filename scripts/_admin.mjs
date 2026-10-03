import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

const projectId = process.env.GCLOUD_PROJECT || process.env.VITE_FIREBASE_PROJECT_ID || 'demo-venta-fotos'

export function adminAuth() {
  const emulator = !!process.env.FIREBASE_AUTH_EMULATOR_HOST
  initializeApp(emulator ? { projectId } : { projectId, credential: applicationDefault() })
  return { auth: getAuth(), emulator, projectId }
}
