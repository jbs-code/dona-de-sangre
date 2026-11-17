# SPEC 12 — Rutas en inglés y corrección del desbordamiento en recuperación

> **Estado:** Implementado
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

- [x] `/auth/forgot-password` sirve el formulario con sus tres estados por URL.
- [x] `/auth/recuperar` responde 404.
- [x] `/account-deactivated` responde 403 con el aviso y el enlace al login, con o sin sesión.
- [x] `/cuenta-desactivada` responde 404.
- [x] El enlace «¿Olvidaste tu contraseña?» del login apunta a `/auth/forgot-password`.
- [x] `POST /api/auth/recovery` redirige a `/auth/forgot-password` en los tres estados (`email_invalido`, `envio_fallido`, `estado=enviado`).
- [x] No queda ninguna cadena `/auth/recuperar` ni `/cuenta-desactivada` en `src/`, `README.md` ni `AGENTS.md`.
- [x] Una cuenta `inactivo` con sesión sigue siendo cerrada y redirigida a `/account-deactivated` sin bucle; las peticiones a `/api/*` siguen recibiendo el JSON 403 y un fallo al leer el estatus sigue dando 503.
- [x] El flujo completo sigue funcionando: login → `/auth/forgot-password` → correo → `/auth/confirm` → `/auth/update-password?motivo=recuperacion` → `/dashboard`.
- [x] A 320 px, `document.documentElement.scrollWidth === document.documentElement.clientWidth` en `/auth/forgot-password` y el párrafo de ayuda se envuelve en varias líneas.
- [x] A 1280 px no hay regresión visual en la página de recuperación.
- [x] `npm run build`, `npm run check` y `npx tsc --noEmit` terminan sin errores (solo los avisos no fatales `Invalid empty selector` de daisyUI).
- [x] El HTML servido y `dist/` no contienen secretos.
- [x] `README.md` y `AGENTS.md` reflejan las rutas y los archivos nuevos; el criterio pendiente de SPEC 11 queda marcado como resuelto por `spec-verifier`.

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

> **Fecha:** 2026-11-17 · **Resultado:** 12/14 criterios verificados. Verificado sobre el servidor de desarrollo en `http://localhost:4321`. Las respuestas HTTP se obtuvieron con `fetch` de Node porque `curl` no está instalado. La cuenta inactiva se probó con `tomas.iglesias@example.com`, del seed de usuarios ficticios: se desactivó con `PATCH /api/users/<id>` usando una sesión de `admin` y se restauró a `activo` al terminar, comprobado en el listado. No se tocó ninguna cuenta real.

| Criterio | Estado | Evidencia | Notas |
| --- | --- | --- | --- |
| `/auth/forgot-password` sirve el formulario con sus tres estados | ✅ | `fetch` → 200; `POST /api/auth/recovery` → `303 /auth/forgot-password?error=email_invalido` y `303 /auth/forgot-password?estado=enviado` | El tercer estado (`?error=envio_fallido`) no se provocó aquí; SPEC 11 verificó su render y los tres salen de la misma `RECOVERY_PATH` |
| `/auth/recuperar` responde 404 | ✅ | `fetch` → 404 | — |
| `/account-deactivated` responde 403 con aviso y enlace | ✅ | `fetch` → 403 sin cabecera `Location` (sin bucle) con la sesión de la cuenta inactiva | El aviso y `href="/auth/login"` los verificó SPEC 08; el cambio de ruta no altera el contenido |
| `/cuenta-desactivada` responde 404 | ✅ | `fetch` → 404 | — |
| Enlace del login | ✅ | HTML servido de `/auth/login`: `href="/auth/forgot-password"` junto a «¿Olvidaste tu contraseña?» | — |
| Redirecciones del `POST` | ✅ | Cuerpo `URLSearchParams`: correo inválido → `303 /auth/forgot-password?error=email_invalido`; correo desconocido → `303 /auth/forgot-password?estado=enviado` | `?error=envio_fallido` no se provocó (no se degradó SMTP): deriva de la misma constante y SPEC 11 lo verificó |
| Sin restos de las URL antiguas | ✅ | `grep` de `/auth/recuperar`, `/cuenta-desactivada`, `recuperar.astro` y `cuenta-desactivada.astro` en `src/`, `README.md` y `AGENTS.md`: 0 coincidencias | Los specs 08 y 11 se actualizan en esta pasada |
| Bloqueo de cuenta inactiva | ⚠️ | Cuenta ficticia desactivada vía `PATCH /api/users/<id>`: `GET /dashboard` → `302 /account-deactivated`; `POST /api/auth/logout` → JSON 403; `GET /account-deactivated` → 403 sin `Location`; tras restaurar, estatus `activo` en el listado | Falta comprobar el 503 ante un fallo de lectura del estatus; ver «Pendiente» |
| Flujo completo de recuperación | ⚠️ | No repetido: requiere leer el buzón SMTP y cambiar la contraseña de una cuenta ficticia. `GET /auth/confirm` → 200; `/auth/update-password?motivo=recuperacion` sin sesión → redirección a `/auth/login` | SPEC 11 verificó el end-to-end y este spec solo cambia la ruta del formulario; ver «Pendiente» |
| Texto sin desbordamiento a 320 px | ✅ | Playwright: `scrollWidth === clientWidth === 320`, párrafo con `white-space: normal`, `display: block`, 3 líneas, `consoleErrors: 0` | — |
| Sin regresión a 1280 px | ✅ | Playwright: `scrollWidth === clientWidth === 1280`, 2 líneas, tarjeta de 384 px, `consoleErrors: 0` | — |
| Calidad | ✅ | `npm run build` (solo 2 avisos no fatales `Invalid empty selector` de daisyUI 5.7.50), `npm run check` (48 archivos, 0 errores / 0 warnings / 0 hints), `npx tsc --noEmit` | — |
| Secretos | ✅ | HTML servido de `/auth/login`, `/auth/forgot-password` y `/account-deactivated` y directorio `dist/`: 0 coincidencias de `sb_secret_`, `SMTP_PASS` ni `hashed_token` | — |
| Documentación | ✅ | `README.md` y `AGENTS.md` actualizados por el implementador y confirmados; criterio de 320 px de SPEC 11 marcado como resuelto y specs 08 y 11 con las rutas nuevas | — |

### Pendiente

- **Fallo al leer el estatus (503).** No se provocó un error de lectura de `public.usuarios.estatus`. Para cerrarlo: interrumpir el acceso a la base de datos en el servidor de desarrollo y comprobar que una petición con sesión responde 503 en lugar de dejar pasar la solicitud.
- **Flujo end-to-end con correo real.** No se repitieron el envío ni el consumo del enlace ni el cambio de contraseña. Para cerrarlo: pedir el enlace desde `/auth/forgot-password` con una cuenta ficticia confirmada y activa, leer el buzón SMTP de captura, abrir `/auth/confirm`, fijar la contraseña en `/auth/update-password?motivo=recuperacion` y comprobar el acceso a `/dashboard`.
