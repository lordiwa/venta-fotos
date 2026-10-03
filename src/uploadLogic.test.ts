import { describe, it, expect } from 'vitest'
import { MAX_BYTES, requeueFailed, runQueue, validateFile, type UploadItem } from './uploadLogic'

const item = (key: number, name: string): UploadItem => ({
  key, file: { name, type: 'image/jpeg', size: 10 }, photoId: `p${key}`, status: 'queued', progress: 0,
})

describe('uploadLogic', () => {
  // Previene: subir al bucket un PDF/GIF o un archivo gigante (el servidor lo rechazaria tarde y sin explicar por que).
  it('CU2 solo JPEG/PNG hasta 50 MB', () => {
    expect(validateFile({ name: 'a.jpg', type: 'image/jpeg', size: MAX_BYTES })).toBeNull()
    expect(validateFile({ name: 'a.png', type: 'image/png', size: 1 })).toBeNull()
    expect(validateFile({ name: 'a.gif', type: 'image/gif', size: 1 })).toContain('a.gif')
    expect(validateFile({ name: 'a.pdf', type: 'application/pdf', size: 1 })).toBeTruthy()
    expect(validateFile({ name: 'big.jpg', type: 'image/jpeg', size: MAX_BYTES + 1 })).toContain('50 MB')
  })

  // Previene: que un fallo frene el lote, o que reintentar vuelva a subir las fotos que ya subieron (CU3).
  it('CU3 un fallo no frena al resto y el reintento sube solo la fallida', async () => {
    const items = [item(1, 'a.jpg'), item(2, 'b.jpg'), item(3, 'c.jpg')]
    const calls: string[] = []
    let failB = true
    const upload = async (i: UploadItem) => {
      calls.push(i.photoId)
      if (i.photoId === 'p2' && failB) throw new Error('red caida')
    }
    await runQueue(items, upload)
    expect(items.map((i) => i.status)).toEqual(['uploaded', 'failed', 'uploaded'])
    expect(items[1].error).toContain('b.jpg')

    failB = false
    requeueFailed(items)
    await runQueue(items, upload)
    expect(calls.filter((c) => c !== 'p2')).toEqual(['p1', 'p3']) // a y c no se volvieron a subir
    expect(calls.filter((c) => c === 'p2')).toHaveLength(2)
    expect(items.every((i) => i.status === 'uploaded')).toBe(true)
  })
})
