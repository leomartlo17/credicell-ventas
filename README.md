# CREDICELL · Ventas

Sistema de ventas multi-sede para CREDICELL. Web app con Next.js que lee y escribe directamente en los Google Sheets existentes.

## Stack

- **Next.js 14** (App Router) + **TypeScript** + **Tailwind CSS**
- **NextAuth** para login con Google
- **Google Sheets API** como base de datos
- **Vercel** para hosting (gratis)

## Arquitectura

```
credicell-app/
├── app/                    # Rutas de Next.js (App Router)
│   ├── page.tsx            # Landing + login
│   ├── layout.tsx          # Layout raíz + PWA manifest
│   └── globals.css         # Tailwind
├── lib/
│   ├── google-sheets.ts    # Cliente de Google Sheets API
│   └── sedes.ts            # Configuración de sedes y permisos
├── components/             # Componentes reutilizables (próximamente)
├── .env.example            # Plantilla de variables de entorno
└── package.json
```

## Setup local

```bash
# 1. Instalar dependencias
npm install

# 2. Copiar .env.example a .env.local y rellenar valores
cp .env.example .env.local

# 3. Correr en desarrollo
npm run dev

# 4. Abrir http://localhost:3000
```

## Variables de entorno requeridas

Ver [`.env.example`](./.env.example) para la lista completa con instrucciones.

## Agregar una sede nueva

1. Duplicar un libro existente en Google Drive.
2. Agregar entrada en [`lib/sedes.ts`](./lib/sedes.ts).
3. Agregar `LIBRO_NUEVA_SEDE=...` en las variables de entorno.
4. Compartir el libro con el email de la Service Account como Editor.
5. Agregar emails de los asesores de la sede al array `asesores`.

## Deploy a Vercel

```bash
# Primera vez:
# 1. Push del código a GitHub
# 2. En vercel.com, "New Project" → importar repo de GitHub
# 3. Agregar variables de entorno en Settings
# 4. Deploy automático

# Siguientes deploys: automático en cada push a main
```

## Roadmap

- [ ] FASE 1: Setup + Auth con Google
- [ ] FASE 2: PASO 1 Cliente
- [ ] FASE 3: PASO 2 Producto
- [ ] FASE 4: PASO 3 Pago + PASO 4 Guardar
- [ ] FASE 5: Multi-sede + Panel admin
- [ ] FASE 6: Fotos + Cartera
- [ ] FASE 7: PWA instalable

## Mantenimiento

Cualquier desarrollador de Next.js/React puede mantener este proyecto. Contratar freelance en Colombia ~$15-30/hora.

**Archivos clave a revisar antes de modificar:**

- `lib/sedes.ts` — agregar/quitar sedes y asesores
- `app/venta/page.tsx` (próximamente) — formulario de nueva venta
- `lib/google-sheets.ts` — no tocar sin revisar las quotas de Google Sheets API
