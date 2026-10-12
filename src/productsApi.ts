import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore'
import { db } from './firebase'
import type { Product } from './types'
import { DIGITAL_ID, DIGITAL_NAME, productFields, sortByName, type ProductForm } from './productsLogic'

const toProduct = (id: string, d: Record<string, unknown>) => ({ id, ...d }) as Product

/** Admin: todos los productos (activos e inactivos). */
export async function listProducts(): Promise<Product[]> {
  const snap = await getDocs(collection(db, 'products'))
  return sortByName(snap.docs.map((d) => toProduct(d.id, d.data())))
}

/** CU9: consulta publica (la usara la tienda de TASK-016): solo productos con active == true. */
export async function listActiveProducts(): Promise<Product[]> {
  const snap = await getDocs(query(collection(db, 'products'), where('active', '==', true)))
  return snap.docs.map((d) => toProduct(d.id, d.data()))
}

/** Id generado en el cliente: reintentar el mismo formulario pendiente reutiliza el id y no duplica el producto. */
export const newProductId = () => doc(collection(db, 'products')).id

export async function createPrint(f: ProductForm, id: string = newProductId()): Promise<string> {
  await setDoc(doc(db, 'products', id), { ...productFields(f), kind: 'print', active: true })
  return id
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

let catalog: Promise<Product[]> | null = null
/** Catalogo activo en cache de sesion (lo usa el selector de la foto, que se monta/desmonta al navegar). Un fallo no se cachea. */
export function getActiveCatalog(refresh = false): Promise<Product[]> {
  if (!catalog || refresh) {
    const p = listActiveProducts().then(sortByName)
    p.catch(() => { if (catalog === p) catalog = null })
    catalog = p
  }
  return catalog
}
