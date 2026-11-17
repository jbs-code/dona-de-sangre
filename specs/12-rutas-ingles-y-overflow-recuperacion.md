# SPEC 12 — Rutas en inglés y corrección del desbordamiento en recuperación

> **Estado:** Aprobado
> **Depende de:** SPEC 08, SPEC 11
> **Fecha:** 2026-11-17
> **Objetivo:** completar la convención de rutas en inglés renombrando las dos páginas que quedaron en español y corregir el scroll horizontal de la página de recuperación a 320 px.

## Por qué existe este spec

El proyecto usa rutas en inglés (`/auth/login`, `/auth/confirm`, `/auth/update-password`, `/dashboard/admin/users`, `/api/*`), pero dos páginas rompen la regla: `/auth/recuperar` (SPEC 11) y `/cuenta-desactivada` (SPEC 08). Son las únicas excepciones y ya están integradas en enlaces, redirecciones y documentación, así que el cambio hay que hacerlo de una vez y con un barrido de referencias.

Además, SPEC 11 cerró con un criterio de aceptación pendiente: a 320 px la página de recuperación ensancha el documento hasta 583 px. La causa está localizada en `src/pages/auth/recuperar.astro`, línea 45: el párrafo de ayuda usa `class="label"`, y en daisyUI 5 esa clase aplica `white-space: nowrap` y `display: inline-flex`. La frase larga no puede saltar de línea. La verificación de SPEC 11 dejó el arreglo propuesto pero no lo aplicó, porque `spec-verifier` solo edita `specs/**`.

Este spec agrupa las tres correcciones: dos renombrados de ruta y un cambio de clase CSS. No añade funcionalidad.

## Alcance

**Incluido:**

- Renombrar `/auth/recuperar` a `/auth/forgot-password` (archivo `src/pages/auth/recuperar.astro` → `src/pages/auth/forgot-password.astro`).
- Renombrar `/cuenta-desactivada` a `/account-deactivated` (archivo `src/pages/cuenta-desactivada.astro` → `src/pages/account-deactivated.astro`).
- Actualizar todas las referencias internas a esas dos rutas: enlace del login, redirecciones de `POST /api/auth/recovery`, constante y exención del middleware.
- Sustituir `class="label"` por `class="text-sm opacity-70"` en el párrafo de ayuda de la página de recuperación.
- Actualizar `README.md` y `AGENTS.md` con los nuevos nombres.
- Dejar constancia en los specs 08 y 11 de que sus rutas cambiaron de nombre y de que el criterio pendiente de 320 px queda resuelto (lo aplica `spec-verifier` en su pasada, sin tocar código).

**Fuera de alcance (para specs futuros):**

- Traducir los valores de los query params (`motivo=recuperacion`, `estado=enviado`, `error=email_invalido`, `error=envio_fallido`, `error=corta`, etc.). Son códigos internos, no rutas, y no cambian el comportamiento.
- Traducir los textos de la interfaz: la aplicación sigue en español.
- Renombrar columnas de base de datos (`estatus`, `rol`) ni valores de los enums.
- Renombrar rutas de API: `/api/auth/login`, `/api/auth/logout`, `/api/auth/recovery`, `/api/invitations` y `/api/users/**` ya están en inglés.
- Renombrar módulos, features o funciones internas (`recovery.ts`, `sendRecoveryEmail()`, etc.): sus nombres ya están en inglés y describen el dominio, no la URL.
- Redirecciones de compatibilidad desde las URL antiguas: se descartan expresamente (ver «Decisiones tomadas y descartadas»).
- Cambios en la base de datos, RLS, variables de entorno, plantillas de correo ni en el flujo de autenticación.

## Modelo de datos

**No hay cambios en la base de datos.** No se crean tablas, columnas, políticas ni migraciones. No hay cambios en el contrato de la API ni en los correos: los enlaces de invitación y recuperación apuntan a `/auth/confirm` y de ahí a `/auth/update-password?motivo=recuperacion`, rutas que no se tocan.

## Referencias afectadas

| Archivo | Referencia actual | Cambio |
| --- | --- | --- |
| `src/pages/auth/recuperar.astro` | ruta de la página | Se renombra a `src/pages/auth/forgot-password.astro` |
| `src/pages/cuenta-desactivada.astro` | ruta de la página | Se renombra a `src/pages/account-deactivated.astro` |
| `src/pages/auth/login.astro:34` | `href="/auth/recuperar"` | `href="/auth/forgot-password"` |
| `src/pages/api/auth/recovery.ts:14-15` | `RECOVERY_PATH = '/auth/recuperar'` | `RECOVERY_PATH = '/auth/forgot-password'`; arrastra los tres estados (`?estado=enviado`, `?error=email_invalido`, `?error=envio_fallido`) |
| `src/middleware.ts:10` | `DISABLED_ACCOUNT_PATH = '/cuenta-desactivada'` | Ruta nueva `/account-deactivated`; se actualizan su uso en la exención (línea 32) y en la redirección del 403 (línea 76) |
| `src/pages/auth/forgot-password.astro:45` | `<p class="label">` | `<p class="text-sm opacity-70">` |
| `README.md` | `/auth/recuperar` y `/cuenta-desactivada` en estado del proyecto, rutas, árbol de archivos y flujos | Sustituir por los nombres nuevos |
| `AGENTS.md` | `/auth/recuperar` y `/cuenta-desactivada` en Pages, bloqueo de cuentas, árbol de `src/` y seguridad | Sustituir por los nombres nuevos |
| `specs/08-estatus-usuarios.md`, `specs/11-recuperacion-contrasena.md` | Menciones de las rutas antiguas y criterio de 320 px pendiente | Actualización documental a cargo de `spec-verifier` tras la implementación |

El renombrado se hace con `git mv` para conservar el historial de los dos archivos.

## Plan de implementación

1. Renombrar las dos páginas con `git mv`: `src/pages/auth/recuperar.astro` → `src/pages/auth/forgot-password.astro` y `src/pages/cuenta-desactivada.astro` → `src/pages/account-deactivated.astro`. Verificar con `npm run build`.
2. Actualizar las tres referencias de código: enlace en `src/pages/auth/login.astro`, `RECOVERY_PATH` en `src/pages/api/auth/recovery.ts` y ruta exenta/destino en `src/middleware.ts`. Verificar con `npm run build`, `npm run check` y `npx tsc --noEmit`, y con un barrido `grep` de las URL antiguas en `src/`.
3. Quitar `class="label"` del párrafo de ayuda en `src/pages/auth/forgot-password.astro` y dejar `class="text-sm opacity-70"`. Verificar a 320 px y 1280 px con Playwright.
4. Actualizar `README.md` y `AGENTS.md` con las rutas y los nombres de archivo nuevos. Verificar con un `grep` de las URL antiguas en la documentación.
5. Verificación completa: build, type-check, rutas nuevas y antiguas, flujo de recuperación, bloqueo de cuenta inactiva, responsive y secretos. `spec-verifier` refleja el cambio en los specs 08 y 11.

## Criterios de aceptación

- [ ] `/auth/forgot-password` sirve el formulario con sus tres estados por URL.
- [ ] `/auth/recuperar` responde 404.
- [ ] `/account-deactivated` responde 403 con el aviso y el enlace al login, con o sin sesión.
- [ ] `/cuenta-desactivada` responde 404.
- [ ] El enlace «¿Olvidaste tu contraseña?» del login apunta a `/auth/forgot-password`.
- [ ] `POST /api/auth/recovery` redirige a `/auth/forgot-password` en los tres estados (`email_invalido`, `envio_fallido`, `estado=enviado`).
- [ ] No queda ninguna cadena `/auth/recuperar` ni `/cuenta-desactivada` en `src/`, `README.md` ni `AGENTS.md`.
- [ ] Una cuenta `inactivo` con sesión sigue siendo cerrada y redirigida a `/account-deactivated` sin bucle; las peticiones a `/api/*` siguen recibiendo el JSON 403 y un fallo al leer el estatus sigue dando 503.
- [ ] El flujo completo sigue funcionando: login → `/auth/forgot-password` → correo → `/auth/confirm` → `/auth/update-password?motivo=recuperacion` → `/dashboard`.
- [ ] A 320 px, `document.documentElement.scrollWidth === document.documentElement.clientWidth` en `/auth/forgot-password` y el párrafo de ayuda se envuelve en varias líneas.
- [ ] A 1280 px no hay regresión visual en la página de recuperación.
- [ ] `npm run build`, `npm run check` y `npx tsc --noEmit` terminan sin errores (solo los avisos no fatales `Invalid empty selector` de daisyUI).
- [ ] El HTML servido y `dist/` no contienen secretos.
- [ ] `README.md` y `AGENTS.md` reflejan las rutas y los archivos nuevos; el criterio pendiente de SPEC 11 queda marcado como resuelto por `spec-verifier`.

## Decisiones tomadas y descartadas

- **Sí:** `/auth/forgot-password` y `/account-deactivated`. El primero describe la petición del enlace (no el cambio de contraseña, que ya es `/auth/update-password`) y el segundo mantiene la terminología del aviso «Cuenta desactivada».
- **No:** `/auth/recover-password`, `/auth/reset-password`, `/account-disabled` ni `/account-inactive`. Todas son alternativas válidas, pero la primera y la segunda se confunden con `/auth/update-password` y las otras rompen la correspondencia con el texto de la página.
- **No:** redirecciones de compatibilidad en `astro.config.mjs`. El lab es pequeño, las URL antiguas solo pudieron quedar en marcadores o en enlaces internos ya sustituidos, y los correos de la aplicación apuntan a `/auth/confirm`, no a la página de recuperación. Mantener redirecciones obligaría además a eximir la ruta antigua en el middleware para no introducir un bucle con cuentas inactivas.
- **No:** traducir los query params. La regla acordada alcanza a las rutas; los códigos de estado son internos, están documentados en specs anteriores y traducirlos no cambia nada para la persona.
- **Sí:** `text-sm opacity-70` para el párrafo de ayuda. Es el mismo estilo que ya usan los párrafos descriptivos de `login.astro`, `update-password.astro` y `recuperar.astro`, así que se mantiene la apariencia sin heredar `white-space: nowrap` de `.label`.
- **No:** añadir `whitespace-normal` a la clase existente. Dejaría un párrafo con `display: inline-flex` y semántica de etiqueta de daisyUI donde no hay un control asociado; quitar la clase es más claro y evita una excepción CSS.
- **No:** tocar `AuthCard` ni `global.css`. El desbordamiento está causado por una clase concreta en un párrafo, no por el ancho de la tarjeta ni por un tema.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Quede una referencia a una URL antigua en código o documentación | Barrido con `grep` de `/auth/recuperar` y `/cuenta-desactivada` en `src/`, `README.md` y `AGENTS.md` antes de cerrar el spec; los specs 08 y 11 los actualiza `spec-verifier`. |
| El middleware deje de eximir la página de cuenta desactivada y se cree un bucle de redirecciones | La constante `DISABLED_ACCOUNT_PATH` se usa tanto en la exención como en el destino: cambiar una sola vez mantiene ambos valores alineados. Verificar con una cuenta `inactivo` con sesión. |
| Las URL antiguas dejen de funcionar para alguien que las tenga guardadas | Decisión aceptada: corte limpio sin redirecciones. Ningún correo generado por la aplicación apunta a esas URL. |
| El cambio de clase altere el aspecto del formulario | Usar los mismos utilitarios que los párrafos vecinos y comparar a 320 px y 1280 px con Playwright. |
| El flujo de recuperación se rompa al cambiar la ruta del formulario | `RECOVERY_PATH` es la única fuente de las redirecciones del `POST`; verificar los tres estados y el correo completo de principio a fin. |

## Qué **no** entra en este spec

- Query params en inglés.
- Textos de la interfaz en inglés.
- Cambios en esquema, RLS, migrations, variables de entorno ni SMTP.
- Cambios en las plantillas de correo ni en los enlaces que estas generan.
- Redirecciones desde las URL antiguas.
- Renombrado de features, módulos ni funciones internas.
- Nuevos tests automatizados: no hay infraestructura de tests en el proyecto; la verificación es build, type-check y Playwright.

## Verificación

> Pendiente. `spec-verifier` debe registrar aquí los resultados de `npm run build`, `npm run check`, `npx tsc --noEmit`, un servidor de desarrollo (`npx astro dev --port …`), Playwright a 320 px y 1280 px, y `curl` de las rutas nuevas y antiguas. La cuenta inactiva se prueba con el seed ficticio; no se debe mutar una cuenta real.

| Criterio | Cómo verificarlo |
| --- | --- |
| Rutas nuevas y antiguas | `curl -i` de `/auth/forgot-password` (200), `/auth/recuperar` (404), `/account-deactivated` (403) y `/cuenta-desactivada` (404) |
| Enlace del login | HTML servido de `/auth/login`: `href="/auth/forgot-password"` junto a «¿Olvidaste tu contraseña?» |
| Redirecciones del `POST` | `POST /api/auth/recovery` con correo inválido, con correo desconocido y con fallo SMTP → `303` a `/auth/forgot-password?error=…` / `?estado=enviado` |
| Bloqueo de cuenta inactiva | Sesión de una cuenta `inactivo` → `302 /account-deactivated`, petición a `/api/*` → JSON 403, sin bucle de redirecciones |
| Flujo de recuperación | Seguir el correo de prueba hasta `/auth/update-password?motivo=recuperacion` y guardar la contraseña |
| Texto sin desbordamiento | Playwright a 320 px: `scrollWidth === clientWidth`, texto del párrafo partido en varias líneas y `consoleErrors: []`; repetir a 1280 px |
| Sin restos de las URL antiguas | `grep -R '/auth/recuperar\|/cuenta-desactivada' src README.md AGENTS.md` sin coincidencias |
| Calidad | `npm run build`, `npm run check`, `npx tsc --noEmit` |
| Secretos | `grep` de `sb_secret_`, `SMTP_PASS` y `hashed_token` en el HTML servido y en `dist/` |
| Documentación | `README.md`, `AGENTS.md` y los hallazgos de los specs 08 y 11 actualizados |
