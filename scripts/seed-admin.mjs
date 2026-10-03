// Crea (o reutiliza) el usuario admin de prueba en el emulador de Auth. Nunca toca produccion.
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099'
const { adminAuth } = await import('./_admin.mjs')

const EMAIL = 'admin@example.test'
const PASSWORD = 'admin1234'
const { auth } = adminAuth(false)
let user
try {
  user = await auth.getUserByEmail(EMAIL)
} catch {
  user = await auth.createUser({ email: EMAIL, password: PASSWORD })
}
await auth.setCustomUserClaims(user.uid, { admin: true })
console.log(`Admin de prueba listo en el emulador: ${EMAIL} / ${PASSWORD}`)
