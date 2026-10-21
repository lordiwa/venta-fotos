type ScrollBox = Pick<HTMLElement, 'scrollWidth' | 'clientWidth' | 'querySelector'> & { scrollTo?: HTMLElement['scrollTo'] }

/**
 * Centra el enlace activo desplazando SOLO el contenedor del nav (nunca la ventana: nada de
 * scrollIntoView). No hace nada si el nav no desborda (escritorio) o no hay `scrollTo` (jsdom).
 */
export function centerActiveItem(nav: ScrollBox | null | undefined): void {
  if (!nav || typeof nav.scrollTo !== 'function' || nav.scrollWidth <= nav.clientWidth) return
  const on = nav.querySelector<HTMLElement>('.es-rail-item.on')
  if (!on) return
  nav.scrollTo({ left: on.offsetLeft - (nav.clientWidth - on.offsetWidth) / 2 })
}
