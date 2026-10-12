import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from './firebase'
import type { StoreSettings } from './types'
import { settingsFields, type SettingsForm } from './productsLogic'

export async function getSettings(): Promise<StoreSettings | null> {
  const s = await getDoc(doc(db, 'settings', 'store'))
  return s.exists() ? (s.data() as StoreSettings) : null
}

/** CU7/CU8: merge para no pisar watermarkText. */
export const saveSettings = (f: SettingsForm) => setDoc(doc(db, 'settings', 'store'), settingsFields(f), { merge: true })
