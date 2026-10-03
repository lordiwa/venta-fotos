import { describe, it, expect, vi } from 'vitest'
import { deleteEventGuarded, editableFields, newEventData, validateEventForm } from './eventsLogic'

const ok = { name: ' Boda ', date: '2026-05-04', place: ' Lima ', description: '' }

describe('eventsLogic', () => {
  // Previene: guardar un evento sin nombre/fecha (o con fecha imposible) que luego rompe la galeria publica (CU2).
  it('CU2 rechaza nombre vacio, fecha vacia y fecha inexistente', () => {
    expect(validateEventForm(ok)).toEqual({})
    expect(validateEventForm({ ...ok, name: '   ' }).name).toBeTruthy()
    expect(validateEventForm({ ...ok, date: '' }).date).toBeTruthy()
    expect(validateEventForm({ ...ok, date: '2026-02-31' }).date).toBeTruthy()
  })

  // Previene: publicar por accidente un evento recien creado, o que editar cambie el estado de publicacion (CU1/CU4).
  it('CU1/CU4 el evento nuevo es borrador y editar no toca published', () => {
    expect(newEventData(ok)).toMatchObject({ name: 'Boda', place: 'Lima', published: false })
    expect(editableFields(ok)).not.toHaveProperty('published')
  })

  // Previene: perder el historial de pedidos de un cliente al borrar su evento (CU7).
  it('CU7 con pedidos no borra nada', async () => {
    const deps = { countOrders: vi.fn().mockResolvedValue(2), deletePhotos: vi.fn(), deleteEvent: vi.fn() }
    const res = await deleteEventGuarded('e1', deps)
    expect(res.ok).toBe(false)
    expect(deps.deletePhotos).not.toHaveBeenCalled()
    expect(deps.deleteEvent).not.toHaveBeenCalled()
  })

  // Previene: dejar fotos huerfanas (con archivos en Storage) al borrar un evento sin pedidos (CU7).
  it('CU7 sin pedidos borra fotos y luego el evento', async () => {
    const calls: string[] = []
    const deps = {
      countOrders: async () => 0,
      deletePhotos: async () => void calls.push('photos'),
      deleteEvent: async () => void calls.push('event'),
    }
    expect(await deleteEventGuarded('e1', deps)).toEqual({ ok: true })
    expect(calls).toEqual(['photos', 'event'])
  })
})
