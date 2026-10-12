/* @ds-bundle: {"format":4,"namespace":"Estudio","components":[{"name":"Wordmark"},{"name":"Icon"},{"name":"Button"},{"name":"Badge"},{"name":"Eyebrow"},{"name":"Field"},{"name":"Stepper"},{"name":"OptionCard"},{"name":"PhotoTile"},{"name":"Card"},{"name":"Alert"},{"name":"OrderNumber"},{"name":"Dropzone"},{"name":"TopBar"},{"name":"SideNav"}]} */
(function () {
  var React = window.React, h = React.createElement;
  var ICONS = {
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
    mas: '<path d="M12 5v14M5 12h14"/>',
    menos: '<path d="M5 12h14"/>',
    externo: '<path d="M14 4h6v6M20 4l-9 9M19 14v6H5V6h6"/>',
    salir: '<path d="M10 4H5v16h5M14 8l4 4-4 4M18 12H9"/>',
    panel: '<path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/>',
    eventos: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 15l5-5 4 4 3-3 6 6"/><circle cx="16" cy="9" r="1.5"/>',
    productos: '<path d="M3 12V4h8l9 9-8 8-9-9z"/><circle cx="7.5" cy="8.5" r="1.5"/>',
    pedidos: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
    impresion: '<path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v7H6z"/>',
    configuracion: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>'
  };
  function cx() { return Array.prototype.slice.call(arguments).filter(Boolean).join(' '); }

  function Icon(p) {
    var size = p.size || 18;
    return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: p.strokeWidth || 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': p.label ? undefined : 'true', role: p.label ? 'img' : undefined, 'aria-label': p.label, className: cx('es-icon', p.className), dangerouslySetInnerHTML: { __html: ICONS[p.name] || '' } });
  }
  Icon.names = Object.keys(ICONS);

  function Wordmark(p) {
    var Tag = p.href ? 'a' : 'span';
    return h(Tag, { href: p.href, className: cx('es-wordmark', p.onRail && 'es-wordmark-rail', p.className) },
      h('span', { className: 'es-wordmark-dot', 'aria-hidden': 'true' }), p.children || 'Venta de Fotos');
  }

  function Button(p) {
    var variant = p.variant || 'secondary', size = p.size || 'md';
    var cls = cx('es-btn', 'es-btn-' + variant, 'es-btn-' + size, p.iconOnly && 'es-btn-icon', p.className);
    var inner = [p.icon ? h(Icon, { key: 'i', name: p.icon, size: size === 'lg' ? 18 : 16 }) : null, p.iconOnly ? null : p.children];
    if (p.href) return h('a', { href: p.href, className: cls, 'aria-label': p.iconOnly ? p.children : p['aria-label'] }, inner);
    return h('button', { type: p.type || 'button', className: cls, disabled: p.disabled, onClick: p.onClick, 'aria-label': p.iconOnly ? p.children : p['aria-label'] }, inner);
  }

  var TONES = { publicado: 'success', activo: 'success', entregado: 'success', borrador: 'neutral', inactivo: 'neutral', pagado: 'amber', impreso: 'info', listo: 'teal', enviado: 'violet' };
  var LABELS = { publicado: 'Publicado', activo: 'Activo', entregado: 'Entregado', borrador: 'Borrador', inactivo: 'Inactivo', pagado: 'Pagado', impreso: 'Impreso', listo: 'Listo para retiro', enviado: 'Enviado' };
  function Badge(p) {
    var tone = p.tone || (p.status && TONES[p.status]) || 'neutral';
    return h('span', { className: cx('es-badge', 'es-badge-' + tone, p.className) }, h('span', { className: 'es-badge-dot', 'aria-hidden': 'true' }), p.children || (p.status && LABELS[p.status]) || '');
  }

  function Eyebrow(p) { return h('span', { className: cx('es-eyebrow', p.muted && 'es-eyebrow-muted', p.className) }, p.children); }

  function Field(p) {
    var id = p.id || ('f-' + Math.random().toString(36).slice(2, 7));
    var as = p.as || 'input';
    var base = { id: id, className: cx('es-input', p.mono && 'es-input-mono', p.error && 'es-input-invalid'), 'aria-invalid': p.error ? 'true' : undefined, 'aria-describedby': p.error ? id + '-err' : (p.hint ? id + '-hint' : undefined), placeholder: p.placeholder, value: p.value, defaultValue: p.defaultValue, onChange: p.onChange, type: p.type, inputMode: p.inputMode, autoComplete: p.autoComplete, rows: p.rows };
    var control = as === 'select'
      ? h('select', base, (p.options || []).map(function (o) { return h('option', { key: o }, o); }))
      : as === 'textarea' ? h('textarea', base) : h('input', base);
    if (p.prefix) control = h('span', { className: 'es-input-group' }, h('span', { className: 'es-input-prefix' }, p.prefix), control);
    return h('div', { className: cx('es-field', p.className) },
      h('label', { htmlFor: id, className: 'es-field-label' }, p.label, p.optional ? h('span', { className: 'es-field-optional' }, ' ', p.optional) : null),
      control,
      p.error ? h('span', { id: id + '-err', role: 'alert', className: 'es-field-error' }, p.error) : null,
      !p.error && p.hint ? h('span', { id: id + '-hint', className: 'es-field-hint' }, p.hint) : null);
  }

  function Stepper(p) {
    var min = p.min == null ? 1 : p.min, max = p.max == null ? 99 : p.max, v = p.value == null ? 1 : p.value;
    var set = function (n) { if (p.onChange) p.onChange(Math.min(max, Math.max(min, n))); };
    return h('div', { className: cx('es-stepper', p.className) },
      h('button', { type: 'button', className: 'es-stepper-btn', 'aria-label': 'Una menos', onClick: function () { set(v - 1); } }, h(Icon, { name: 'menos', size: 16 })),
      h('input', { className: 'es-stepper-val', 'aria-label': p.label || 'Cantidad', value: v, readOnly: true, inputMode: 'numeric' }),
      h('button', { type: 'button', className: 'es-stepper-btn', 'aria-label': 'Una más', onClick: function () { set(v + 1); } }, h(Icon, { name: 'mas', size: 16 })));
  }

  function OptionCard(p) {
    return h('label', { className: cx('es-option', p.checked && 'on', p.className) },
      h('input', { type: 'radio', name: p.name, checked: !!p.checked, onChange: p.onChange || function () {}, className: 'es-radio' }),
      h('span', { className: 'es-option-body' }, h('span', { className: 'es-option-label' }, p.label), p.meta ? h('span', { className: 'es-option-meta' }, p.meta) : null),
      p.price != null ? h('span', { className: 'es-option-price' }, p.price) : null);
  }

  function PhotoTile(p) {
    var inner = [h('img', { key: 'img', src: p.src, alt: p.alt || '' }), h('span', { key: 'veil', className: 'es-tile-veil', 'aria-hidden': 'true' }, h('span', null, p.label), h('span', { className: 'es-tile-cta' }, p.cta || 'Ver'))];
    var cls = cx('es-tile', p.span === 'big' && 'es-tile-big', p.span === 'wide' && 'es-tile-wide', p.className);
    if (p.href) return h('a', { href: p.href, className: cls, 'aria-label': p['aria-label'] || ('Ver ' + (p.label || 'foto')) }, inner);
    return h('div', { className: cls }, inner);
  }

  function Card(p) {
    return h(p.as || 'section', { className: cx('es-card', p.sunken && 'es-card-sunken', p.className), 'aria-label': p['aria-label'] },
      p.title ? h('div', { className: 'es-card-head' }, h('h2', { className: 'es-card-title' }, p.title), p.aside ? h('div', { className: 'es-card-aside' }, p.aside) : null) : null,
      p.children);
  }

  function Alert(p) {
    var tone = p.tone || 'neutral';
    return h('p', { role: tone === 'danger' ? 'alert' : 'status', className: cx('es-alert', 'es-alert-' + tone, p.className) },
      tone === 'success' ? h(Icon, { name: 'check', size: 16 }) : null, h('span', null, p.children),
      p.action ? h('span', { className: 'es-alert-action' }, p.action) : null);
  }

  function OrderNumber(p) {
    return h('div', { className: cx('es-ordernum', p.size === 'sm' && 'es-ordernum-sm', p.className) },
      p.caption !== false ? h('span', { className: 'es-eyebrow es-eyebrow-muted' }, p.caption || 'Número de pedido') : null,
      h('strong', { className: 'es-ordernum-value' }, p.children));
  }

  function Dropzone(p) {
    return h('label', { className: cx('es-dropzone', p.className) },
      h('span', { className: 'es-dropzone-icon' }, h(Icon, { name: 'subir', size: 20 })),
      h('strong', null, p.title || 'Arrastra fotos aquí o toca para elegirlas'),
      h('small', null, p.hint || 'JPEG o PNG, hasta 50 MB cada una'),
      h('input', { type: 'file', multiple: true, accept: p.accept || 'image/jpeg,image/png' }));
  }

  function TopBar(p) {
    var links = p.links || [{ label: 'Eventos', href: '#' }, { label: 'Mis descargas', href: '#' }];
    return h('header', { className: cx('es-topbar', p.className) },
      h(Wordmark, { href: p.homeHref || '#' }, p.brand),
      h('nav', { 'aria-label': 'Principal', className: 'es-topbar-nav' },
        links.map(function (l) { return h('a', { key: l.label, href: l.href, className: 'es-topbar-link' }, l.label); }),
        h('a', { href: p.cartHref || '#', className: 'es-cart', 'aria-label': 'Carrito, ' + (p.cartCount ? p.cartCount + ' productos' : 'vacío') }, h(Icon, { name: 'carrito' }), 'Carrito', h('span', { className: 'es-cart-count' }, p.cartCount || 0))));
  }

  function SideNav(p) {
    var items = p.items || [];
    return h('aside', { className: cx('es-rail', p.className) },
      h('a', { href: p.homeHref || '#', className: 'es-rail-brand' }, h(Wordmark, { onRail: true }, p.brand), h('span', { className: 'es-rail-sub' }, p.subtitle || 'Administración')),
      h('nav', { className: 'es-rail-nav', 'aria-label': 'Secciones' }, items.map(function (it) {
        return h('a', { key: it.label, href: it.href || '#', className: cx('es-rail-item', it.active && 'on'), 'aria-current': it.active ? 'page' : undefined }, it.icon ? h(Icon, { name: it.icon }) : null, it.label);
      })),
      h('div', { className: 'es-rail-foot' },
        h('a', { href: p.storeHref || '#', className: 'es-rail-item es-rail-item-sm' }, h(Icon, { name: 'externo' }), 'Ver tienda'),
        h('a', { href: p.logoutHref || '#', className: 'es-rail-item es-rail-item-sm' }, h(Icon, { name: 'salir' }), 'Cerrar sesión')));
  }

  var ns = window.Estudio = window.Estudio || {};
  Object.assign(ns, { Wordmark: Wordmark, Icon: Icon, Button: Button, Badge: Badge, Eyebrow: Eyebrow, Field: Field, Stepper: Stepper, OptionCard: OptionCard, PhotoTile: PhotoTile, Card: Card, Alert: Alert, OrderNumber: OrderNumber, Dropzone: Dropzone, TopBar: TopBar, SideNav: SideNav });
})();
