/** Logica pura de gestion de eventos (sin Firebase): validacion, normalizacion y baja protegida. */

export interface EventForm {
  name: string
  date: string // yyyy-mm-dd (input type=date)
  place: string
  description: string
}

export type EventErrors = Partial<Record<'name' | 'date', string>>

/** yyyy-mm-dd -> Date local a medianoche; null si no es una fecha real. */
export function parseDateInput(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const date = new Date(y, mo - 1, d)
  return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d ? date : null
}

export function formatDateInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** CU2: nombre y fecha obligatorios. */
export function validateEventForm(f: EventForm): EventErrors {
  const errors: EventErrors = {}
  if (!f.name.trim()) errors.name = 'El nombre es obligatorio.'
  if (!f.date.trim()) errors.date = 'La fecha es obligatoria.'
  else if (!parseDateInput(f.date)) errors.date = 'La fecha no es válida.'
  return errors
}

/** Campos editables ya normalizados (sin `published`: editar nunca cambia el estado). */
export function editableFields(f: EventForm) {
  return { name: f.name.trim(), date: parseDateInput(f.date) as Date, place: f.place.trim(), description: f.description.trim() }
}

/** CU1: un evento nuevo siempre nace como borrador. */
export function newEventData(f: EventForm) {
  return { ...editableFields(f), published: false }
}

export interface DeleteDeps {
  countOrders(eventId: string): Promise<number>
  deletePhotos(eventId: string): Promise<void>
  deleteEvent(eventId: string): Promise<void>
}

export const DELETE_BLOCKED_MESSAGE = 'No se puede eliminar: el evento tiene pedidos asociados. Puedes despublicarlo.'

/** CU7: con pedidos asociados no se borra nada (ni fotos ni evento). Sin pedidos: fotos primero, luego el evento. */
export async function deleteEventGuarded(id: string, deps: DeleteDeps): Promise<{ ok: true } | { ok: false; message: string }> {
  if ((await deps.countOrders(id)) > 0) return { ok: false, message: DELETE_BLOCKED_MESSAGE }
  await deps.deletePhotos(id)
  await deps.deleteEvent(id)
  return { ok: true }
}
