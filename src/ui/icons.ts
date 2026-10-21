/** Paths SVG (viewBox 24, trazo currentColor) del set de iconos de Estudio. */
export const ICONS = {
  carrito: '<path d="M5 8h14l-1.2 12H6.2L5 8z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>',
  'flecha-derecha': '<path d="M5 12h14M13 6l6 6-6 6"/>',
  'flecha-izquierda': '<path d="M19 12H5M11 18l-6-6 6-6"/>',
  cerrar: '<path d="M6 6l12 12M18 6L6 18"/>',
  anterior: '<path d="M15 6l-6 6 6 6"/>',
  siguiente: '<path d="M9 6l6 6-6 6"/>',
  quitar: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  descargar: '<path d="M12 4v12M6 10l6 6 6-6M4 20h16"/>',
  subir: '<path d="M12 16V5M6 11l6-6 6 6M4 20h16"/>',
  check: '<path d="M5 12l5 5L19 7"/>',
  telefono: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
  correo: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  instagram: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".6"/>',
  ubicacion: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  mas: '<path d="M12 5v14M5 12h14"/>',
  menos: '<path d="M5 12h14"/>',
  externo: '<path d="M14 4h6v6M20 4l-9 9M19 14v6H5V6h6"/>',
  salir: '<path d="M10 4H5v16h5M14 8l4 4-4 4M18 12H9"/>',
  panel: '<path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/>',
  eventos: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 15l5-5 4 4 3-3 6 6"/><circle cx="16" cy="9" r="1.5"/>',
  productos: '<path d="M3 12V4h8l9 9-8 8-9-9z"/><circle cx="7.5" cy="8.5" r="1.5"/>',
  pedidos: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  impresion: '<path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v7H6z"/>',
  configuracion: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
} as const

export type IconName = keyof typeof ICONS
