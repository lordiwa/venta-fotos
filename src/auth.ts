import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth'
import { reactive } from 'vue'
import { auth } from './firebase'

export const authState = reactive({ isAdmin: false })

/** Lee el claim admin del ID token (CU6). */
async function applyUser(user: User | null, forceRefresh = false) {
  authState.isAdmin = user ? (await user.getIdTokenResult(forceRefresh)).claims.admin === true : false
}

/** Se resuelve cuando Firebase entrego el estado inicial (CU8). */
export const authReady = new Promise<void>((resolve) => {
  onAuthStateChanged(auth, async (user) => {
    try {
      await applyUser(user)
    } catch {
      authState.isAdmin = false
    }
    resolve()
  })
})

/** Devuelve true si entro como admin; false si la cuenta no tiene claim (se cierra la sesion). Lanza si Firebase rechaza. */
export async function login(email: string, password: string): Promise<boolean> {
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password)
  await applyUser(cred.user, true)
  if (!authState.isAdmin) {
    await signOut(auth)
    return false
  }
  return true
}

export async function logout() {
  await signOut(auth)
  authState.isAdmin = false
}
