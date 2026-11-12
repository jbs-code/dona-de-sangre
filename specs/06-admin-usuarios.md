# SPEC 06 — Acceso de administración de usuarios en el panel

> **Estado:** Aprobado
> **Depende de:** SPEC 01, SPEC 02, SPEC 05
> **Fecha:** 2026-11-11
> **Objetivo:** Mostrar a los administradores una opción «Administrar usuarios» en el panel que lleva a la ruta protegida `/dashboard/admin/users`, visible solo para el rol `admin`.

## Por qué existe este spec

Hoy el rol `admin` solo se distingue en un endpoint de API (`POST /api/invitations`) que todavía no tiene interfaz. El panel muestra el perfil y el rol, pero no ofrece ninguna acción según el rol: un `admin` y un `capturador` ven exactamente lo mismo.

Este spec abre la puerta al panel administrativo: un punto de entrada visible solo para `admin` y una ruta ya protegida que hoy solo muestra un texto genérico. La gestión real (registrar, actualizar, eliminar y suspender usuarios) queda para un spec posterior, pero la estructura, la visibilidad y la autorización se fijan ahora.

## Alcance

**Incluido:**

- Tarjeta «Administrar usuarios» en el cuerpo de `/dashboard`, renderizada solo cuando el rol del usuario es `admin`.
- Nueva página `/dashboard/admin/users` (`src/pages/dashboard/admin/users.astro`).
- Guarda de autorización en la página: si la sesión no es de un `admin`, la respuesta es 403.
- Texto genérico en la página indicando que la gestión de usuarios llegará en una entrega posterior.
- Reutilización del navbar del panel en la nueva página.
- Verificación con `npm run build`, `npx tsc --noEmit`, `curl -i` y Playwright.

**Fuera de alcance (para specs futuros):**

- Listado de usuarios, formularios de alta y edición, baja y suspensión.
- Integración con `POST /api/invitations` (ya existe) en la interfaz.
- Cualquier cambio en Supabase: tablas, RLS, triggers o migraciones. Hoy no existe ningún campo para «suspender» una cuenta.
- Cambios en la autenticación, en `src/middleware.ts` o en el modelo de datos.
- Menú lateral, reorganización del panel o nuevo sistema de navegación.
- Temas de daisyUI (`dona` / `dona-dark`): no se toca `src/styles/global.css`.

## Modelo de datos

No se introducen datos nuevos. Se reutiliza `public.usuarios` (SPEC 02) con su RLS: un usuario autenticado puede leer su propia fila, así que el servidor consulta el rol del solicitante sin privilegios adicionales.

| Dato | Origen | Uso |
| --- | --- | --- |
| `rol` | `public.usuarios.rol` (`admin` \| `supervisor` \| `capturador`) | Decide la visibilidad de la tarjeta y autoriza la ruta |
| `claims.sub` | `getClaims()` (middleware) | Identifica la fila de `public.usuarios` que se consulta |

El proyecto tiene ya un helper de lectura por rol en la base de datos, `private.current_user_rol()`, pero es `security definer` y no es accesible desde el cliente de Supabase; este spec usa la lectura normal de la propia fila.

## Especificación visual y de accesibilidad

- La tarjeta usa el patrón daisyUI `card` > `card-body` > `card-title` + `card-actions`, en línea con la tarjeta de perfil existente.
- Título: «Administrar usuarios». Descripción: «Registra, actualiza, elimina o suspende las cuentas del laboratorio».
- La acción es un enlace `<a href="/dashboard/admin/users" class="btn btn-primary btn-sm">Administrar usuarios</a>`: es una navegación, no una acción de formulario.
- Para un usuario que no es `admin`, la tarjeta no se renderiza: no aparece en el HTML, no ocupa espacio y no deja ningún enlace.
- El enlace tiene texto explícito (no un icono suelto) para que su destino sea comprensible fuera de contexto.
- La página de destino mantiene el navbar del panel y una tarjeta con el mismo patrón.

## Comportamiento y autorización

1. `/dashboard` carga el perfil como hoy. Si `rol === 'admin'`, muestra debajo de la tarjeta «Tu perfil» la tarjeta «Administrar usuarios».
2. Al pulsar el enlace se pide `/dashboard/admin/users`; la sesión viaja en la cookie `httpOnly`.
3. El middleware ya protege `/dashboard/*` por sesión (`isProtectedPath` cubre el prefijo `/dashboard/`): sin sesión válida responde 302 a `/auth/login?next=%2Fdashboard%2Fadmin%2Fusers`.
4. La página consulta la fila del solicitante en `public.usuarios`:
   - Si `rol === 'admin'` → 200 con el navbar y la tarjeta de texto genérico.
   - Si `rol !== 'admin'` → 403 con el navbar y un mensaje de acceso denegado (`AlertError`).
5. La autorización se decide siempre en el servidor, en el frontmatter de la página: ocultar el enlace nunca es la única barrera.
6. Si la consulta del perfil falla o no devuelve fila, el rol se trata como `null` y la ruta responde 403 (fail closed).
7. La página no acepta parámetros, no escribe en la base de datos y no envía correos.

## Estructura de archivos

```text
src/
├── lib/
│   └── current-user.ts                     # NUEVO: fetch del perfil del solicitante
├── components/ui/
│   ├── BaseLayout.astro
│   ├── AlertError.astro
│   └── AppNavbar.astro                    # MOVED desde features/dashboard/components/
└── features/
    ├── dashboard/components/
    │   └── AdminUsersShortcutCard.astro   # NUEVO: tarjeta con el enlace (solo admin)
    └── users/components/
        └── AdminUsersPanel.astro          # NUEVO: panel de la página destino
```

Página nueva:

```text
src/pages/dashboard/admin/users.astro      # NUEVO: ruta protegida por rol
```

### Contrato de los nuevos archivos

| Archivo | Responsabilidad |
| --- | --- |
| `src/lib/current-user.ts` | Exporta el tipo `CurrentUser` (`nombre`, `email`, `rol`) y `getCurrentUser(supabase, claims)` → `{ data, error }`. Es la única consulta del perfil del solicitante. |
| `src/features/dashboard/components/AdminUsersShortcutCard.astro` | Sin props. Tarjeta con el título, la descripción y el enlace a `/dashboard/admin/users`. |
| `src/features/users/components/AdminUsersPanel.astro` | Prop `denied?: boolean`. Con `denied` muestra el aviso de acceso denegado; sin él, el texto genérico de la función pendiente. |
| `src/pages/dashboard/admin/users.astro` | Solo enrutado y frontmatter: guarda de sesión, consulta del rol, `Astro.response.status = 403` si no es admin y render del panel. |

## Plan de implementación

1. Crear `src/lib/current-user.ts` con `getCurrentUser()` y usarlo en `src/pages/dashboard.astro`, conservando la consulta y el mensaje de error tal cual. Verificar con `npm run build` y `npx tsc --noEmit`.
2. Mover `src/features/dashboard/components/AppNavbar.astro` a `src/components/ui/AppNavbar.astro` (ahora lo usan dos features) y actualizar el import en `dashboard.astro`. Verificar que el HTML del navbar no cambia.
3. Crear `src/features/dashboard/components/AdminUsersShortcutCard.astro` y renderizarlo en `dashboard.astro` solo cuando `rol === 'admin'`, ajustando `main` a una columna para alojar las dos tarjetas. Verificar con build y con el HTML servido.
4. Crear `src/features/users/components/AdminUsersPanel.astro` con los dos estados: acceso permitido y acceso denegado.
5. Crear `src/pages/dashboard/admin/users.astro` con la guarda de sesión, la consulta del rol, el 403 y el panel. Verificar con build, `npx tsc --noEmit` y `curl -i` (302 sin cookie, 403 con sesión no admin, 200 con sesión admin).
6. Verificar con Playwright: el enlace aparece para el `admin` y lleva a la página correcta; para el resto de roles el enlace no existe; sin scroll horizontal a 320 px y sin errores de consola.
7. Actualizar `README.md` (tabla de rutas y estado del proyecto) y `AGENTS.md` (árbol de `src/`).

## Criterios de aceptación

- [ ] `npm run build` termina correctamente (solo los avisos no fatales `Invalid empty selector` de daisyUI).
- [ ] `npx tsc --noEmit` no reporta errores.
- [ ] Con sesión de `admin`, `/dashboard` muestra la tarjeta «Administrar usuarios» con un enlace `<a href="/dashboard/admin/users">`.
- [ ] Con sesión de `admin`, `/dashboard/admin/users` responde 200, muestra el navbar y el texto genérico, y no contiene ninguna tabla, formulario ni botón de acción sobre usuarios.
- [ ] Con sesión de un usuario que no es `admin`, el HTML servido de `/dashboard` no contiene ni el enlace a `/dashboard/admin/users` ni el texto «Administrar usuarios».
- [ ] Con sesión de un usuario que no es `admin`, `GET /dashboard/admin/users` responde 403.
- [ ] Sin sesión, `GET /dashboard/admin/users` responde 302 a `/auth/login?next=%2Fdashboard%2Fadmin%2Fusers`.
- [ ] El navbar conserva su markup y su formulario `POST /api/auth/logout` en las dos pantallas.
- [ ] El contenido de la tarjeta «Tu perfil» (nombre, correo, rol y el aviso de error) no cambia.
- [ ] La página de destino no escribe en la base de datos ni envía correos.
- [ ] A 320 px no hay scroll horizontal en `/dashboard` ni en `/dashboard/admin/users`.
- [ ] No hay errores de consola en `/dashboard` ni en `/dashboard/admin/users`.
- [ ] `README.md` documenta la ruta `/dashboard/admin/users` y `AGENTS.md` refleja el árbol final de `src/`.

## Decisiones tomadas y descartadas

- **Sí:** la opción vive en el cuerpo de `/dashboard`, no en el navbar. El navbar es el chrome común del panel y no debe depender del rol.
- **No:** enlace en el navbar. Exigiría pasar el rol como prop a `AppNavbar` y mantenerlo correcto en cada pantalla futura del panel.
- **Sí:** ruta `/dashboard/admin/users`. Ya queda dentro de la protección por sesión del middleware (`/dashboard/*`) y mantiene la URL bajo el panel.
- **No:** ruta `/admin/usuarios`. Obligaría a ampliar `isProtectedPath()` en el middleware y a definir una segunda raíz protegida.
- **Sí:** 403 con la página renderizada. Es la semántica HTTP correcta; una redirección a `/dashboard` enmascararía el motivo real del bloqueo.
- **No:** redirección a `/dashboard` con un mensaje en la query. Más amable, pero el 302 se confunde con el flujo normal de navegación.
- **Sí:** la guarda de rol vive en el frontmatter de la página. El middleware comprueba sesión, no rol; consultar el rol en cada request penalizaría todas las peticiones del sitio.
- **No:** guarda de rol en el middleware. Además del coste anterior, el middleware no debería decidir autorización de negocio.
- **Sí:** el enlace no aparece en el HTML para quien no es `admin`. La visibilidad se resuelve en el servidor; no hay comprobación en el cliente.
- **Sí:** mover `AppNavbar` a `src/components/ui/`. Lo usan ahora dos features, que es el criterio de ubicación de `AGENTS.md`.
- **No:** mover la tarjeta de acceso denegado a `src/components/ui/`. La usa una sola feature.
- **Sí:** extraer `getCurrentUser()` a `src/lib/current-user.ts`. Dos features consultan la fila del solicitante y la regla sitúa en `src/lib/` el código compartido.
- **No:** dejar la consulta duplicada en cada página.
- **Sí:** `Astro.response.status = 403` con la página renderizada, en lugar de devolver una `Response` suelta con HTML plano, que perdería el layout y el navbar.
- **No:** tocar `src/middleware.ts`. La ruta nace dentro de `/dashboard/*`, que ya está protegido.
- **No:** arreglar el parámetro `next` del login. Hoy `POST /api/auth/login` siempre redirige a `/dashboard` e ignora `next`; es un hueco previo y ajeno a este spec.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| El 403 no se aplica porque el middleware no conoce el rol | El middleware no se toca; la comprobación vive en el frontmatter de la página y se verifica con `curl -i` esperando 403. |
| La tarjeta se muestra a un no-admin por un fallo de la consulta | Si la consulta falla o no devuelve fila, `rol` es `null` y la tarjeta no se renderiza (fail closed). |
| Mover `AppNavbar` rompe alguna página | Se actualiza el único import y se compara el HTML servido del navbar antes y después. |
| Verificar el caso «no admin» exige tocar datos reales | Requiere autorización para cambiar temporalmente el rol del usuario de prueba y restaurarlo después; mientras tanto, el criterio queda pendiente, igual que se hizo en SPEC 05. |
| `/dashboard/admin/users` no está en la lista de rutas protegidas | `isProtectedPath()` ya cubre el prefijo `/dashboard/`; se verifica con un `curl` sin cookie esperando 302. |
| El texto genérico se queda corto cuando llegue el spec de gestión | La URL y el texto son deliberadamente provisionales; el spec futuro los ajusta. |

## Qué **no** entra en este spec

- Gestión real de usuarios: listar, registrar, actualizar, eliminar o suspender.
- Campos de suspensión en `public.usuarios` y migraciones asociadas.
- Interfaz de las invitaciones (`POST /api/invitations` ya responde; la pantalla no existe).
- Recuperación de contraseña y registro público.
- Menú lateral, breadcrumbs o cualquier otro sistema de navegación.
- Cambios en Supabase, RLS, variables de entorno, `src/middleware.ts` y `src/styles/global.css`.

## Verificación

> **Pendiente de ejecutar tras la implementación.**

| Criterio | Estado | Evidencia | Notas |
| --- | --- | --- | --- |
| `npm run build` termina correctamente | ⬜ | — | Solo los avisos no fatales de daisyUI |
| `npx tsc --noEmit` no reporta errores | ⬜ | — | — |
| El `admin` ve la tarjeta y el enlace | ⬜ | — | Playwright + HTML servido |
| La ruta responde 200 para el `admin` | ⬜ | — | `curl -i` con cookie de sesión |
| Un no-admin no ve la tarjeta | ⬜ | — | HTML servido sin «Administrar usuarios» |
| Un no-admin recibe 403 | ⬜ | — | `curl -i` con cookie de no-admin |
| Sin sesión, 302 al login | ⬜ | — | `curl -i` sin cookie |
| Sin scroll horizontal a 320 px | ⬜ | — | Playwright a 320×720 |
| Sin errores de consola | ⬜ | — | Playwright en las dos pantallas |
| `README.md` y `AGENTS.md` al día | ⬜ | — | Diff de los dos archivos |
