// Cada test nombra el dano que previene. Requieren los emuladores Firestore+Storage (npm run test:rules).
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { doc, getDoc, getDocs, setDoc, deleteDoc, collection, query, where, Timestamp } from 'firebase/firestore'
import { ref, uploadBytes, getBytes } from 'firebase/storage'

let env: RulesTestEnvironment
const bytes = (n = 10) => new Uint8Array(n)

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-venta-fotos',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
    storage: { rules: readFileSync('storage.rules', 'utf8'), host: '127.0.0.1', port: 9199 },
  })
})
afterAll(async () => {
  await env.cleanup()
})

beforeEach(async () => {
  await env.clearFirestore()
  await env.clearStorage()
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    const date = Timestamp.now()
    await setDoc(doc(db, 'events/pub'), { name: 'Pub', date, published: true })
    await setDoc(doc(db, 'events/draft'), { name: 'Draft', date, published: false })
    await setDoc(doc(db, 'events/pub/photos/p1'), { visible: true })
    await setDoc(doc(db, 'events/pub/photos/hidden'), { visible: false })
    await setDoc(doc(db, 'events/draft/photos/p2'), { visible: true })
    await setDoc(doc(db, 'products/a4'), { name: 'A4', price: 5 })
    await setDoc(doc(db, 'settings/store'), { shippingCost: 3 })
    await setDoc(doc(db, 'orders/o1'), { total: 5 })
    await setDoc(doc(db, 'users/u1'), { x: 1 })
    const st = ctx.storage()
    for (const p of ['previews/pub/a.jpg', 'thumbs/pub/a.jpg', 'previews/draft/a.jpg', 'originals/pub/a.jpg'])
      await uploadBytes(ref(st, p), bytes(), { contentType: 'image/jpeg' })
  })
})

const anon = () => env.unauthenticatedContext()
const user = () => env.authenticatedContext('u')
const admin = () => env.authenticatedContext('adm', { admin: true })

describe('Firestore', () => {
  it('UC6 publico lista/lee solo publicados - evita exponer borradores', async () => {
    const db = anon().firestore()
    await assertSucceeds(getDoc(doc(db, 'events/pub')))
    await assertSucceeds(getDocs(query(collection(db, 'events'), where('published', '==', true))))
  })
  it('UC7 no publicado o lista sin filtro denegado - evita filtrar eventos no publicados', async () => {
    const db = anon().firestore()
    await assertFails(getDoc(doc(db, 'events/draft')))
    await assertFails(getDocs(collection(db, 'events')))
  })
  it('UC8 fotos: solo visibles de eventos publicados - evita exponer fotos ocultas o de borradores', async () => {
    const db = anon().firestore()
    await assertSucceeds(getDocs(query(collection(db, 'events/pub/photos'), where('visible', '==', true))))
    await assertSucceeds(getDoc(doc(db, 'events/pub/photos/p1')))
    await assertFails(getDoc(doc(db, 'events/pub/photos/hidden')))
    await assertFails(getDoc(doc(db, 'events/draft/photos/p2')))
    await assertFails(getDocs(collection(db, 'events/pub/photos')))
  })
  it('UC9 products y settings/store publicos - la tienda debe poder mostrar precios y envio', async () => {
    const db = anon().firestore()
    await assertSucceeds(getDoc(doc(db, 'products/a4')))
    await assertSucceeds(getDoc(doc(db, 'settings/store')))
  })
  it('UC10 no-admin no escribe catalogo - evita que un anonimo cambie precios o eventos', async () => {
    for (const ctx of [anon(), user()]) {
      const db = ctx.firestore()
      await assertFails(setDoc(doc(db, 'events/x'), { name: 'X', date: Timestamp.now(), published: true }))
      await assertFails(setDoc(doc(db, 'events/pub/photos/x'), { visible: true }))
      await assertFails(setDoc(doc(db, 'products/a4'), { name: 'A4', price: 1 }))
      await assertFails(setDoc(doc(db, 'settings/store'), { shippingCost: 0 }))
      await assertFails(deleteDoc(doc(db, 'events/pub')))
    }
  })
  it('UC11 admin escribe y lee todo - el fotografo debe administrar y previsualizar borradores', async () => {
    const db = admin().firestore()
    await assertSucceeds(setDoc(doc(db, 'events/new'), { name: 'N', date: Timestamp.now(), published: false }))
    await assertSucceeds(setDoc(doc(db, 'events/new/photos/x'), { visible: false }))
    await assertSucceeds(setDoc(doc(db, 'products/b'), { name: 'B', price: 9 }))
    await assertSucceeds(setDoc(doc(db, 'settings/store'), { shippingCost: 1 }))
    await assertSucceeds(getDoc(doc(db, 'events/draft')))
    await assertSucceeds(getDoc(doc(db, 'events/pub/photos/hidden')))
    await assertSucceeds(deleteDoc(doc(db, 'products/a4')))
  })
  it('UC12 datos invalidos rechazados - evita productos gratis/negativos y eventos sin nombre o fecha', async () => {
    const db = admin().firestore()
    await assertFails(setDoc(doc(db, 'products/b'), { name: 'B', price: 0 }))
    await assertFails(setDoc(doc(db, 'products/b'), { name: 'B', price: '5' }))
    await assertFails(setDoc(doc(db, 'events/n'), { date: Timestamp.now(), published: true }))
    await assertFails(setDoc(doc(db, 'events/n'), { name: 'N', published: true }))
  })
  it('UC13 orders nunca escribibles desde cliente - evita pedidos falsos o cambios de estado', async () => {
    for (const ctx of [anon(), user(), admin()]) {
      const db = ctx.firestore()
      await assertFails(setDoc(doc(db, 'orders/o2'), { total: 1 }))
      await assertFails(setDoc(doc(db, 'orders/o1'), { total: 0 }))
      await assertFails(deleteDoc(doc(db, 'orders/o1')))
    }
    await assertFails(getDoc(doc(anon().firestore(), 'orders/o1')))
    await assertSucceeds(getDoc(doc(admin().firestore(), 'orders/o1')))
  })
  it('UC14 colecciones no declaradas denegadas - evita reabrir users/purchases del modelo viejo', async () => {
    const db = admin().firestore()
    await assertFails(getDoc(doc(db, 'users/u1')))
    await assertFails(setDoc(doc(db, 'purchases/p'), { a: 1 }))
  })
})

describe('Storage', () => {
  it('UC15 thumbs/previews solo de eventos publicados - evita filtrar vistas de borradores', async () => {
    const st = anon().storage()
    await assertSucceeds(getBytes(ref(st, 'previews/pub/a.jpg')))
    await assertSucceeds(getBytes(ref(st, 'thumbs/pub/a.jpg')))
    await assertFails(getBytes(ref(st, 'previews/draft/a.jpg')))
  })
  it('UC16 originales solo admin - evita la fuga de fotos en alta resolucion sin pagar', async () => {
    await assertFails(getBytes(ref(anon().storage(), 'originals/pub/a.jpg')))
    await assertFails(getBytes(ref(user().storage(), 'originals/pub/a.jpg')))
    await assertSucceeds(getBytes(ref(admin().storage(), 'originals/pub/a.jpg')))
  })
  it('UC17 subidas: solo admin, imagen <=50MB, nada en previews/thumbs - evita subidas hostiles', async () => {
    const a = admin().storage()
    await assertSucceeds(uploadBytes(ref(a, 'originals/pub/n.png'), bytes(), { contentType: 'image/png' }))
    await assertSucceeds(uploadBytes(ref(a, 'originals/pub/n.jpg'), bytes(), { contentType: 'image/jpeg' }))
    await assertFails(uploadBytes(ref(user().storage(), 'originals/pub/m.jpg'), bytes(), { contentType: 'image/jpeg' }))
    await assertFails(uploadBytes(ref(anon().storage(), 'originals/pub/m.jpg'), bytes(), { contentType: 'image/jpeg' }))
    await assertFails(uploadBytes(ref(a, 'originals/pub/x.pdf'), bytes(), { contentType: 'application/pdf' }))
    await assertFails(
      uploadBytes(ref(a, 'originals/pub/big.jpg'), new Uint8Array(50 * 1024 * 1024 + 1), { contentType: 'image/jpeg' }),
    )
    await assertFails(uploadBytes(ref(a, 'previews/pub/n.jpg'), bytes(), { contentType: 'image/jpeg' }))
    await assertFails(uploadBytes(ref(a, 'thumbs/pub/n.jpg'), bytes(), { contentType: 'image/jpeg' }))
  })
})
