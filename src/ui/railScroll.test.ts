import { afterEach, describe, expect, it, vi } from 'vitest'
import { centerActiveItem } from './railScroll'

// Evita que cambiar de seccion en el admin movil haga saltar la pagina entera (scrollIntoView/window.scrollTo).
describe('centerActiveItem', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('desplaza solo el nav, centrando el activo, sin tocar la ventana ni scrollIntoView', () => {
    const scrollIntoView = vi.fn()
    const windowScroll = vi.fn()
    vi.stubGlobal('window', { scrollTo: windowScroll })
    const on = { offsetLeft: 400, offsetWidth: 100, scrollIntoView }
    const nav = { scrollWidth: 800, clientWidth: 300, querySelector: () => on, scrollTo: vi.fn() }
    centerActiveItem(nav as never)
    expect(nav.scrollTo).toHaveBeenCalledWith({ left: 300 })
    expect(scrollIntoView).not.toHaveBeenCalled()
    expect(windowScroll).not.toHaveBeenCalled()
  })
})
