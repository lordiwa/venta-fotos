import { addDoc, collection, doc, getDoc, getDocs, orderBy, query, setDoc, updateDoc, where } from 'firebase/firestore'
import { db } from './firebase'
import type { Product } from './types'
import { DIGITAL_ID, DIGITAL_NAME, productFields, type ProductForm } from './productsLogic'

const toProduct = (id: string, d: Record<string, unknown>) => ({ id, ...d }) as Product

/** Admin: todos los productos (activos e inactivos). */
export async function listProducts(): Promise<Product[]> {
  const snap = await getDocs(query(collection(db, 'products'), orderBy('name')))
  return snap.docs.map((d) => toProduct(d.id, d.data()))
}

/** CU9: consulta publica (la usara la tienda de TASK-016): solo productos con active == true. */
export async function listActiveProducts(): Promise<Product[]> {
  const snap = await getDocs(query(collection(db, 'products'), where('active', '==', true)))
  return snap.docs.map((d) => toProduct(d.id, d.data()))
}

export async function createPrint(f: ProductForm): Promise<string> {
  return (await addDoc(collection(db, 'products'), { ...productFields(f), kind: 'print', active: true })).id
}

export const updateProduct = (id: string, f: ProductForm) => updateDoc(doc(db, 'products', id), productFields(f))
export const setProductActive = (id: string, active: boolean) => updateDoc(doc(db, 'products', id), { active })

/** CU6: un unico producto digital (id fijo). Si ya existe solo cambia el precio (conserva `active`); si no, nace activo. */
export async function saveDigital(f: ProductForm) {
  const ref = doc(db, 'products', DIGITAL_ID)
  const { price } = productFields(f)
  if ((await getDoc(ref)).exists()) await updateDoc(ref, { price })
  else await setDoc(ref, { name: DIGITAL_NAME, price, kind: 'digital', active: true })
}
