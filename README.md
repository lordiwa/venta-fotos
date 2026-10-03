# venta-fotos

Tienda en línea de un fotógrafo: publica las fotos de cada evento, la gente compra impresiones (o el archivo digital) y él las imprime y entrega en persona o por envío.

Stack: Vue 3 + TypeScript + Vite · Firebase (Hosting, Firestore, Storage, Functions, Auth) · PayPal.

## Desarrollo

```sh
npm install
cp .env.example .env   # VITE_USE_EMULATORS=true para usar los emuladores
npm run dev
npm test               # tests unitarios
npm run test:rules     # reglas de Firestore/Storage en emuladores (requiere Java 21)
```

Definición del proyecto: `PROJECT.md`. Backlog: `tasks/`.
