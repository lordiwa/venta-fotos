// Uso: npm run set-admin -- <correo> [--prod]   (emulador: FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099)
import { adminAuth } from './_admin.mjs'

const args = process.argv.slice(2)
const prod = args.includes('--prod')
const email = args.find((a) => !a.startsWith('--'))
if (!email) {
  console.error('Uso: npm run set-admin -- <correo>')
  process.exit(1)
}
const { auth, emulator, projectId } = adminAuth(prod)
try {
  const user = await auth.getUserByEmail(email)
  await auth.setCustomUserClaims(user.uid, { ...user.customClaims, admin: true })
  console.log(`Claim admin asignado a ${email} (${emulator ? 'emulador' : 'proyecto ' + projectId}). Cierra sesión y vuelve a entrar para que surta efecto.`)
} catch (e) {
  if (e?.code === 'auth/user-not-found') console.error(`No existe una cuenta con el correo ${email}. Créala primero en Firebase Auth.`)
  else console.error(`Error: ${e?.message ?? e}`)
  process.exit(1)
}
