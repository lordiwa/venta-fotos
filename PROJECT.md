---
name: venta-fotos
type: web-app
created_at: 2026-10-02T22:00:00.000Z
schema_version: 1
agent_models: {}
---

# venta-fotos

## Description
Plataforma de venta de fotos. Los fotógrafos suben sus fotos y los usuarios las compran. Stack: Vue 3 + TypeScript + Vite + Firebase Hosting + Firestore + Firebase Functions.

## Target users
- Fotógrafos que quieren vender su trabajo
- Compradores que buscan fotografías de calidad

## Primary use cases
- Subir y gestionar fotos
- Navegar galería pública
- Comprar fotos individuales
- Gestionar perfil de usuario

## Success criteria
Un fotógrafo puede subir una foto, un comprador puede navegar la galería, comprar una foto, y recibir el archivo de alta resolución.

## Stack
- Frontend: Vue 3 + TypeScript + Vite
- Backend: Firebase Hosting + Firestore + Firebase Functions (Node.js)
- Autenticación: Firebase Auth
- Pago: PayPal (a decidir en docs/PAYMENT.md)
- Almacenamiento: Firebase Storage (para fotos)

## Scope (in)
- Galería pública con vista de cuadrícula
- Subida de fotos con metadatos (título, precio, descripción)
- Carrito de compras y checkout
- Autenticación de usuarios
- Perfiles de fotógrafo y comprador

## Scope (out)
- Subscripciones mensuales
- Streaming de video
- Red social de fotógrafos
- Aplicación móvil nativa