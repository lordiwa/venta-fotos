// Cada test nombra el dano que previene. Requieren los emuladores Firestore+Storage (npm run test:rules).
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, deleteField, collection, query, where, Timestamp } from 'firebase/firestore'
import { ref, uploadBytes, getBytes, deleteObject } from 'firebase/storage'

let env: RulesTestEnvironment
const bytes = (n = 10) => new Uint8Array(n)

/** emulators:exec exporta host:puerto de cada emulador (puertos no estandar incluidos); por defecto los de firebase.json. */
function hostPort(v: string | undefined, port: number) {
  const [host, p] = (v ?? '').split(':')
  return { host: host || '127.0.0.1', port: p ? Number(p) : port }
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-venta-fotos',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), ...hostPort(process.env.FIRESTORE_EMULATOR_HOST, 8080) },
    storage: { rules: readFileSync('storage.rules', 'utf8'), ...hostPort(process.env.FIREBASE_STORAGE_EMULATOR_HOST, 9199) },
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
    await setDoc(doc(db, 'events/pub/photos/p1'), { visible: true, status: 'ready' })
    await setDoc(doc(db, 'events/pub/photos/hidden'), { visible: false, status: 'ready' })
    await setDoc(doc(db, 'events/pub/photos/proc'), { visible: true, status: 'processing' })
    await setDoc(doc(db, 'events/pub/photos/err'), { visible: true, status: 'error' })
    await setDoc(doc(db, 'events/draft/photos/p2'), { visible: true, status: 'ready' })
    await setDoc(doc(db, 'products/a4'), { name: 'A4', kind: 'print', price: 5 })
    await setDoc(doc(db, 'settings/store'), { shippingCost: 3 })
    await setDoc(doc(db, 'orders/o1'), { total: 5 })
    await setDoc(doc(db, 'users/u1'), { x: 1 })
    const st = ctx.storage()
    for (const p of ['previews/pub/a.jpg', 'thumbs/pub/a.jpg', 'previews/draft/a.jpg', 'thumbs/draft/a.jpg', 'originals/pub/a.jpg', 'covers/pub/a.jpg', 'covers/draft/a.jpg'])
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
    await assertSucceeds(
      getDocs(query(collection(db, 'events/pub/photos'), where('visible', '==', true), where('status', '==', 'ready'))),
    )
    await assertFails(getDocs(query(collection(db, 'events/pub/photos'), where('visible', '==', true)))) // sin filtro status
    await assertFails(getDoc(doc(db, 'events/pub/photos/proc'))) // procesando: no es publica
    await assertFails(getDoc(doc(db, 'events/pub/photos/err'))) // con error: no es publica
    await assertSucceeds(getDoc(doc(admin().firestore(), 'events/pub/photos/err')))
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
    await assertSucceeds(setDoc(doc(db, 'products/b'), { name: 'B', kind: 'print', price: 9 }))
    await assertSucceeds(setDoc(doc(db, 'settings/store'), { shippingCost: 1 }))
    await assertSucceeds(getDoc(doc(db, 'events/draft')))
    await assertSucceeds(getDoc(doc(db, 'events/pub/photos/hidden')))
    await assertSucceeds(deleteDoc(doc(db, 'products/a4')))
    await assertSucceeds(deleteDoc(doc(db, 'events/pub')))
  })
  // Previene: que un comprador se marque fotos como vendibles en digital (o al reves), o un printOnly no booleano que el servidor no reconoce.
  it('TASK-030 printOnly solo lo escribe el admin y debe ser booleano; la lectura publica no cambia', async () => {
    for (const ctx of [anon(), user()]) await assertFails(updateDoc(doc(ctx.firestore(), 'events/pub/photos/p1'), { printOnly: true }))
    const db = admin().firestore()
    await assertSucceeds(updateDoc(doc(db, 'events/pub/photos/p1'), { printOnly: true }))
    await assertFails(updateDoc(doc(db, 'events/pub/photos/p1'), { printOnly: 'si' }))
    await assertSucceeds(getDoc(doc(anon().firestore(), 'events/pub/photos/p1')))
  })
  // Previene: paquetes de 1 foto, fraccionarios o sin cantidad, que el carrito y el servidor no sabrian aplicar.
  it('TASK-029 paquete digital: solo admin, con cantidad entera 2..100', async () => {
    const pk = { name: 'Paquete 5 fotos digitales', kind: 'pack', price: 12, quantity: 5 }
    await assertFails(setDoc(doc(user().firestore(), 'products/pk'), pk))
    const db = admin().firestore()
    await assertSucceeds(setDoc(doc(db, 'products/pk'), pk))
    for (const quantity of [1, 2.5, '5', 101]) await assertFails(setDoc(doc(db, 'products/pk'), { ...pk, quantity }))
    await assertFails(setDoc(doc(db, 'products/pk2'), { name: 'P', kind: 'pack', price: 12 }))
  })
  it('UC12 datos invalidos rechazados - evita productos gratis/negativos y eventos sin nombre o fecha', async () => {
    const db = admin().firestore()
    await assertFails(setDoc(doc(db, 'products/b'), { name: 'B', kind: 'print', price: 0 }))
    await assertFails(setDoc(doc(db, 'products/b'), { name: 'B', kind: 'print', price: '5' }))
    await assertFails(setDoc(doc(db, 'products/b'), { name: 'B', kind: 'poster', price: 5 }))
    await assertFails(setDoc(doc(db, 'products/b'), { name: 'B', price: 5 }))
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
    await assertFails(getDoc(doc(user().firestore(), 'orders/o1')))
    await assertSucceeds(getDoc(doc(admin().firestore(), 'orders/o1')))
  })
  it('TASK-012 consulta de pedidos por evento solo admin - evita borrar eventos con pedidos y que otros espien pedidos', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'orders/o3'), { eventIds: ['pub'], total: 5 })
    })
    const q = (c: ReturnType<typeof admin>) => getDocs(query(collection(c.firestore(), 'orders'), where('eventIds', 'array-contains', 'pub')))
    const snap = await assertSucceeds(q(admin()))
    if (snap.size !== 1) throw new Error('el admin debe ver 1 pedido, vio ' + snap.size)
    await assertFails(q(anon()))
    await assertFails(q(user()))
  })
  it('TASK-017 checkouts y orders no se leen ni escriben desde el cliente - evita espiar pedidos/snapshots o fabricar un pago', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), 'checkouts/c1'), { totalCents: 100 }) })
    for (const ctx of [anon(), user(), admin()]) {
      const db = ctx.firestore()
      await assertFails(getDoc(doc(db, 'checkouts/c1')))
      await assertFails(setDoc(doc(db, 'checkouts/c2'), { totalCents: 1 }))
    }
    await assertFails(getDoc(doc(anon().firestore(), 'orders/o1')))
    await assertFails(getDocs(collection(anon().firestore(), 'orders')))
  })
  it('TASK-019 downloadAttempts cerrada a todos - evita borrar los contadores para seguir adivinando pedidos', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), 'downloadAttempts/a'), { count: 10 }) })
    for (const ctx of [anon(), user(), admin()]) {
      await assertFails(getDoc(doc(ctx.firestore(), 'downloadAttempts/a')))
      await assertFails(setDoc(doc(ctx.firestore(), 'downloadAttempts/a'), { count: 0 }))
      await assertFails(deleteDoc(doc(ctx.firestore(), 'downloadAttempts/a')))
    }
  })
  it('TASK-028 coverPath solo lo escribe la Function - evita apuntar la portada publica a un archivo arbitrario', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'events/c'), { name: 'C', date: Timestamp.now(), published: true, coverPhotoId: 'p1', coverPath: 'covers/c/p1.jpg' })
    })
    const db = admin().firestore()
    await assertFails(setDoc(doc(db, 'events/n'), { name: 'N', date: Timestamp.now(), published: false, coverPath: 'originals/pub/a.jpg' }))
    await assertFails(updateDoc(doc(db, 'events/c'), { coverPath: 'originals/pub/a.jpg' }))
    await assertFails(updateDoc(doc(db, 'events/c'), { coverPath: deleteField() }))
    // la edicion normal del admin sigue funcionando con coverPath presente
    await assertSucceeds(updateDoc(doc(db, 'events/c'), { name: 'C2', coverPhotoId: 'p2' }))
    await assertSucceeds(updateDoc(doc(db, 'events/c'), { coverPhotoId: deleteField() }))
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
    await assertFails(getBytes(ref(st, 'thumbs/draft/a.jpg')))
  })
  it('TASK-028 covers/ legible solo si el evento esta publicado (o admin) y sin escritura de cliente - evita filtrar la portada de borradores', async () => {
    await assertSucceeds(getBytes(ref(anon().storage(), 'covers/pub/a.jpg')))
    await assertFails(getBytes(ref(anon().storage(), 'covers/draft/a.jpg')))
    await assertSucceeds(getBytes(ref(admin().storage(), 'covers/draft/a.jpg')))
    await assertFails(uploadBytes(ref(admin().storage(), 'covers/pub/n.jpg'), bytes(), { contentType: 'image/jpeg' }))
    await assertFails(deleteObject(ref(admin().storage(), 'covers/pub/a.jpg')))
  })
  it('UC16 originales solo admin - evita la fuga de fotos en alta resolucion sin pagar', async () => {
    await assertFails(getBytes(ref(anon().storage(), 'originals/pub/a.jpg')))
    await assertFails(getBytes(ref(user().storage(), 'originals/pub/a.jpg')))
    await assertSucceeds(getBytes(ref(admin().storage(), 'originals/pub/a.jpg')))
  })
  it('UC17 subidas: solo admin, imagen <=50MB, nada en previews/thumbs; admin borra originales - evita subidas hostiles y fotos imborrables', async () => {
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
    await assertFails(deleteObject(ref(user().storage(), 'originals/pub/a.jpg')))
    await assertSucceeds(deleteObject(ref(a, 'originals/pub/a.jpg')))
  }, 120000)
})
