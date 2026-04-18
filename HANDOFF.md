# HANDOFF — Retomar proyecto CREDICELL Ventas

> **Para Claude Code:** Esto es la entrega de un proyecto que ya está en marcha. Lee todo este archivo antes de hacer nada. El usuario se llama **Leonardo Martínez** (email `leomartlo17@gmail.com`). Es de **CREDICELL**, una empresa colombiana con varias tiendas de celulares. No es desarrollador — le hablas en español, sin jerga técnica, y siendo directo sin filtros. Él prefiere verdades incómodas a respuestas agradables.

---

## Qué estamos construyendo

**Sistema de ventas web multi-sede para CREDICELL.**

- Stack: **Next.js 14** (App Router) + TypeScript + Tailwind CSS + NextAuth + Google Sheets API
- Hosting: **Vercel** (free tier)
- Base de datos: **Google Sheets** (los libros existentes de cada sede) — NO migramos a PostgreSQL
- Auth: **Google Sign-in** (cada asesor con su cuenta Google)
- Modelo: **PWA instalable** en móvil

### Flujo del usuario final

Un asesor entra a `credicell-ventas.vercel.app`, se loguea con Google, el sistema detecta su sede, hace una venta en 4 pasos:

1. **Cliente** (buscar por cédula o crear)
2. **Producto** (marca → modelo → IMEI del inventario real)
3. **Pago** (financiera + valor + % cuota + desglose medios)
4. **Confirmar** (escribe en 4-5 hojas de Google Sheets a la vez)

---

## Lo que YA ESTÁ HECHO

### Fase 0 — Apps Script (funcional pero descartado)

Probamos Apps Script primero. El backend funcionó (respuesta 2.3s del test), pero el sidebar HTML complejo tenía un bug con cache. Decidimos migrar a Next.js propio.

### Fase 1 — Esqueleto Next.js (está en este proyecto)

Archivos creados:

- `package.json` — deps: next, react, next-auth, googleapis, zod, tailwind
- `tsconfig.json`, `tailwind.config.ts`, `postcss.config.js`, `next.config.js`
- `.gitignore`, `.env.example` (plantilla con IDs de libros y variables necesarias)
- `app/layout.tsx` — layout raíz con PWA manifest
- `app/page.tsx` — landing con botón de login (aún no funcional)
- `app/globals.css` — Tailwind base
- `lib/google-sheets.ts` — helper de Sheets API (leerRango, agregarFila, actualizarCelda, listarHojas)
- `lib/sedes.ts` — configuración multi-sede (SEDES[], sedeDelUsuario, esAdmin)
- `public/manifest.json` — PWA manifest
- `README.md` — documentación del proyecto

### GitHub

- Repo creado: **https://github.com/leomartlo17/credicell-ventas** (público por ahora)
- Usuario: `leomartlo17`
- SSH key agregada al usuario (pero el sandbox anterior no tenía red a GitHub, por eso el push nunca se hizo — **ahora desde la Mac sí se puede**)

### IDs de recursos ya conocidos

```
LIBRO_SAN_ESTEBAN   = 1k6Wr4wjFmiuAUSj26Uqi61DV7vaBu6h7ugt-pOpYSZM  (copia de prueba)
LIBRO_PITALITO      = 1ELtLc0qGDQiUCCAtOgKG-vKxCpvOs8XMgvqqP5kcBcg  (libro real)
LIBRO_CARTERA       = 1nZ8p7IE7FaCrJ5Yi_mgpLvvfxDeO_AWkEKKUMMOGdDs  (libro de AppSheet)
DRIVE_FOLDER_CARTERA = 1Xegl4mcFt_6KK1wXUls_LWCrrpKZ5-ZP  (fotos de cartera)
```

---

## Lo que FALTA

### Paso 1 — Push del código a GitHub (1 min desde la Mac)

```bash
cd "ruta/a/credicell-app"
git init -b main
git add -A
git commit -m "Initial: Next.js skeleton"
git remote add origin git@github.com:leomartlo17/credicell-ventas.git
git push -u origin main
```

La SSH key ya está configurada en GitHub del usuario. Si Claude Code tiene acceso al ssh-agent del usuario, funciona directo. Si no, usar HTTPS con un PAT nuevo (el viejo `github_pat_11CCC5B4I01F43...` dio "Bad credentials" — probablemente mal copiado o revocado; **genera uno nuevo si hace falta**).

### Paso 2 — Credenciales Google Cloud Console (15 min — requiere que Leonardo apruebe en cada pantalla)

Seguir los pasos detallados en **`../SIGUIENTES_PASOS.md`** (carpeta padre). Resumen:

1. Crear proyecto Google Cloud: `credicell-ventas`
2. Habilitar **Google Sheets API** y **Google Drive API**
3. OAuth consent screen: External, nombre "CREDICELL Ventas"
4. Crear **OAuth 2.0 Client ID** (Web):
   - Redirect URIs: `http://localhost:3000/api/auth/callback/google` y `https://credicell-ventas.vercel.app/api/auth/callback/google`
5. Crear **Service Account** → descargar JSON
6. Compartir los 3 libros (San Esteban copia, Pitalito, cartera) con el email de la Service Account como **Editor**

### Paso 3 — Llenar `.env.local` con las credenciales

Copiar `.env.example` → `.env.local` y llenar:
- `NEXTAUTH_SECRET` (generar con `openssl rand -base64 32`)
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (del paso 2.4)
- `GOOGLE_SHEETS_CLIENT_EMAIL`, `GOOGLE_SHEETS_PRIVATE_KEY` (del JSON de la Service Account)

### Paso 4 — Implementar auth con NextAuth

Crear `app/api/auth/[...nextauth]/route.ts` con Google Provider. Validar que el email esté en `SEDES[].asesores` o `SEDES[].admins`. Guardar la sede del usuario en la sesión.

### Paso 5 — Deploy a Vercel

```bash
npm install -g vercel
vercel login
vercel link
# Agregar variables de entorno desde el dashboard de Vercel
vercel --prod
```

Actualizar redirect URI en Google Cloud con la URL real de Vercel.

### Paso 6 — Probar login end-to-end

Leonardo abre la URL, se loguea, confirma que ve un mensaje tipo "Hola Leonardo, tu sede es X".

---

## Roadmap post-FASE 1 (ya discutido con Leonardo, él aprobó)

- **FASE 2:** formulario PASO 1 Cliente (buscar/crear en `CLIENTES ESTUDIO`)
- **FASE 3:** formulario PASO 2 Producto (leer `Inventario android`, filtro color, atajo IMEI)
- **FASE 4:** formulario PASO 3 Pago + PASO 4 Guardar (escribe en financiera + Caja + Inventario)
- **FASE 5:** multi-sede + panel admin (gestionar asesores, autorizar valores J.A/J.D)
- **FASE 6:** fotos a Drive + escritura en `cartera`
- **FASE 7:** PWA instalable + pulido

---

## Contexto de negocio importante (no lo olvides)

**Reglas de datos:**
- Solo considerar datos desde **2026 en adelante** — los históricos están sucios
- IMEIs deben ser **exactamente 15 dígitos** — rechazar otros tamaños
- `Samsung A17` ≠ `Samsung A17 5G` — son referencias distintas, nunca mezclar
- En `+KUPO` con iPhone: cuota real = valor del % (fórmula distinta a Android)
- En `+KUPO` con Android: cuota real es libre (puede ser distinta al %)

**Columnas reales del Inventario San Esteban (estructura 2026):**
```
A: FECHA INGRESO | B: MARCA | C: EQUIPO | D: IMEI 1 | E: IMEI 2 |
F: COLOR | G: PRECIO COSTO | H: FECHA VENTA | I: ESTADO | J: PROVEEDOR
```

**Financieras por sede:**
- San Esteban: KREDIYA, ADELANTOS, +KUPO, BOGOTA, ADDI, SU+PAY, RENTING, ALCANOS, Contado
- Pitalito: igual pero sin RENTING ni ALCANOS

**Asesora activa hoy en San Esteban:** solo PAULA

**Admins que autorizan valores (J.A, J.D):** son los jefes que por teléfono le dicen a los asesores los precios. Nombres reales no confirmados — tratar como `J.A` y `J.D` simples por ahora.

---

## Lo que NO debes hacer

- ❌ **No modificar los Google Sheets viejos sin avisar.** Los auxiliares contables trabajan ahí.
- ❌ **No migrar datos a otra DB.** Se quedan en Sheets.
- ❌ **No borrar filas existentes.** Solo actualizar celdas específicas (fecha venta, estado).
- ❌ **No pedirle a Leonardo crear cuentas.** Solo guiar.
- ❌ **No escribir en `cartera` en FASE 1.** Eso va en FASE 6.

---

## Formato de interacción con Leonardo

- Español colombiano, tono directo
- "Verdades incómodas" sobre decisiones técnicas (él lo prefiere)
- Sin emojis excesivos, sin sugar-coating
- Cuando le pidas que haga algo, especifica EXACTAMENTE qué clic, qué texto, qué botón
- Si algo falla, admite la verdad sin dar vueltas

---

**Siguiente acción recomendada cuando Leonardo te diga "arranquemos":**

Hacer el `git push` a GitHub (Paso 1). Es lo más rápido y valida que todo el setup local funciona. Con eso ya ves el código en `github.com/leomartlo17/credicell-ventas`.

Después, guíalo al Paso 2 (Google Cloud). Con calma, un clic a la vez.
