# Dona de Sangre

Aplicación web para gestionar el registro de donadores de sangre de un laboratorio de investigación biomédica enfocado principalmente en cáncer de mama.

El acceso a la aplicación está protegido: solo las cuentas creadas por el laboratorio pueden entrar, y cada una tiene un rol (`admin`, `supervisor` o `capturador`) que determina qué puede hacer.

## Estado del proyecto

**Implementado**

- Inicio y cierre de sesión con Supabase Auth y sesión en cookies `httpOnly`.
- Panel protegido (`/dashboard`) que muestra el perfil y el rol del usuario.
- Acceso de administración (`/dashboard/admin/users`), visible solo para el rol `admin` y protegido con un 403 en el servidor.
- Listado de los usuarios registrados con búsqueda por nombre o correo, filtro por estatus y paginación de 10 por página, resuelto en el servidor (sin JavaScript).
- Estatus de cada cuenta (`activo` / `inactivo`): una cuenta inactiva no puede iniciar sesión ni usar la aplicación, y el `admin` ve el estatus de cada persona en el listado.
- Flujo de invitación: el administrador genera un enlace, la aplicación envía el correo, el invitado confirma su correo y define su propia contraseña.
- Esquema de base de datos con tabla de perfiles, roles, estatus y políticas RLS por tabla.
- Estructura del proyecto organizada por funcionalidad (`src/features/`) con componentes reutilizables.
- Tema propio de daisyUI (`dona` claro y `dona-dark` oscuro) y diseño responsive verificado a 320 px.

**Pendiente**

- Formulario de captura de donadores (el objetivo principal del producto).
- Gestión de usuarios dentro del panel: registrar, actualizar, eliminar y cambiar el estatus de las cuentas. El listado y el bloqueo de las cuentas inactivas ya están implementados; faltan la pantalla para cambiar el estatus y el resto de acciones.
- Interfaz de las invitaciones (`POST /api/invitations` ya existe, falta la pantalla).
- Recuperación de contraseña («¿Olvidaste tu contraseña?»).

## Stack tecnológico

| Pieza | Tecnología |
| ----- | ---------- |
| Framework | Astro 7 en modo SSR (`output: 'server'`) |
| Adaptador de despliegue | `@astrojs/netlify` |
| Estilos | Tailwind CSS 4 (plugin de Vite) + daisyUI 5, sin framework UI |
| Base de datos y autenticación | Supabase (Postgres + Auth) |
| Cliente de Supabase | `@supabase/ssr` con cookies de servidor |
| Correo | `nodemailer` contra el SMTP de Gmail |
| Lenguaje | TypeScript (`strict`) |

## Requisitos previos

- **Node.js ≥ 22.23.4** (declarado en `package.json`; `netlify.toml` fija la versión 22 en el despliegue).
- **npm** 10 o superior.
- Una **cuenta de Supabase** con un proyecto creado.
- Una **cuenta de Gmail** con verificación en dos pasos activada (para poder generar una contraseña de aplicación).

## Instalación

```sh
git clone <url-del-repositorio>
cd dona-de-sangre
npm install
cp .env.template .env   # y rellénalo con la sección "Variables de entorno"
```

## Variables de entorno

Todas se declaran en `astro.config.mjs` con `context: 'server'` y `access: 'secret'`, así que **solo existen en el servidor**: nunca llegan al HTML ni al JS que se envía al navegador, y nunca aparecen en `dist/`. Por eso ninguna lleva el prefijo `PUBLIC_`.

El archivo `.env` está en `.gitignore` y es local; `.env.template` está versionado y solo contiene placeholders.

| Variable | Para qué sirve | Dónde se obtiene | Obligatoria |
| -------- | -------------- | ---------------- | ----------- |
| `SUPABASE_URL` | URL del proyecto (`https://<ref>.supabase.co`). | Supabase → Project Settings → API → Project URL | Sí |
| `SUPABASE_KEY` | Clave publicable (`sb_publishable_…`) o clave `anon` heredada. Se usa como clave de cliente en el servidor. | Supabase → Project Settings → API → Publishable keys | Sí |
| `SUPABASE_SECRET_API_KEY` | Clave secreta (`sb_secret_…`), sustituta actual de `service_role`. Solo la usa `auth.admin.generateLink` para generar invitaciones. | Supabase → Project Settings → API → Secret keys | Sí |
| `SUPABASE_DB_PASSWORD` | Contraseña de la base de datos. La usan la CLI y el MCP de Supabase; el sitio no la necesita. | Supabase → Project Settings → Database | Solo si usas la CLI/MCP |
| `SMTP_HOST` | Servidor SMTP de Gmail. | `smtp.gmail.com` | Sí |
| `SMTP_PORT` | Puerto SMTP con TLS directo. | `465` | Sí |
| `SMTP_USER` | Cuenta de Gmail que envía los correos; también es la dirección «De». | Tu dirección de Gmail | Sí |
| `SMTP_PASS` | Contraseña de aplicación de Google (16 caracteres). | myaccount.google.com → Contraseñas de aplicación | Sí |

> `SUPABASE_SECRET_API_KEY` y las variables `SMTP_*` son secretos de servidor: no deben usarse en páginas, scripts de cliente ni en el repositorio.

## Configuración de Supabase

### 1. Crear el proyecto

En [supabase.com](https://supabase.com), crea un proyecto y **guarda la contraseña de la base de datos**: es el valor de `SUPABASE_DB_PASSWORD` y solo se muestra una vez.

### 2. Aplicar las migraciones

El esquema de la aplicación está versionado en dos archivos de `supabase/migrations/`:

- `20261107235752_create_usuarios.sql` — enum `rol_usuario`, tabla `public.usuarios`, RLS, políticas de lectura y triggers sobre `auth.users`.
- `20261112185401_add_estatus_usuario.sql` — enum `estatus_usuario`, columna `public.usuarios.estatus` y el trigger que sincroniza el estatus con `auth.users.banned_until`.

Aplícalos una sola vez, en ese orden, con cualquiera de estas vías:

- **Dashboard** → SQL Editor: pega el contenido de cada archivo y ejecuta.
- **MCP de Supabase**: `apply_migration` con el mismo SQL.
- **CLI** (no hay `supabase/config.toml` en el repositorio; habría que inicializarlo):

  ```sh
  npx supabase init
  npx supabase link --project-ref <ref-del-proyecto>
  npx supabase db push
  ```

La primera migración crea el enum `rol_usuario`, la tabla `public.usuarios`, activa RLS sobre ella, define las políticas de lectura y añade los triggers `on_auth_user_created` y `on_auth_user_email_updated` sobre `auth.users`. La segunda añade el enum `estatus_usuario`, la columna `estatus` (obligatoria, por defecto `activo`) y el trigger `on_usuarios_estatus_changed`, que deja la cuenta baneada en Supabase Auth mientras el estatus sea `inactivo`.

### 3. Configurar la autenticación

En el panel de Supabase:

- **Authentication → URL Configuration**
  - *Site URL*: `http://localhost:4321` en desarrollo; la URL pública (`https://<sitio>.netlify.app`) en producción.
  - *Redirect URLs*: `http://localhost:4321/**` y `https://<sitio>.netlify.app/**`.
- **Authentication → Sign In / Providers → Email**: activa el proveedor de correo y deja **«Confirm email» activado**.
- **Authentication → Policies → Password Settings**: longitud mínima de contraseña de **8 caracteres**.

El correo no lo envía Supabase: la aplicación genera el enlace con `auth.admin.generateLink` y lo manda por su propio SMTP. Por eso **no se debe usar el botón «Invite user» del Dashboard**, que provocaría un segundo correo desde Supabase.

### 4. Copiar las claves

En **Project Settings → API**:

- *Publishable keys* → `SUPABASE_KEY`.
- *Secret keys* → `SUPABASE_SECRET_API_KEY` (empieza por `sb_secret_`).

### 5. Crear la primera cuenta y promoverla a administrador

No hay registro público: las cuentas las crea el laboratorio. La primera cuenta debe nacerse con permisos, porque **el endpoint de invitaciones solo puede usarse con un `admin` ya existente**.

1. Crea la cuenta en **Authentication → Users → Add user → Create new user**, con correo, contraseña y la casilla **«Auto Confirm User»** marcada. El trigger `on_auth_user_created` inserta automáticamente la fila en `public.usuarios` con `rol = 'capturador'`.
2. Promuévela a administrador, desde el Table Editor o desde el SQL Editor:

   ```sql
   update public.usuarios
   set rol = 'admin'
   where email = 'admin@laboratorio.org';
   ```

Con esa cuenta ya puedes entrar en `/dashboard` e invitar al resto del equipo.

### 6. Probar la API de invitaciones

Todavía no hay interfaz para las invitaciones, así que la invitación se hace por HTTP. Ejemplo desde la raíz del proyecto:

```sh
# 1. Iniciar sesión y guardar las cookies de sesión
curl -c cookies.txt -X POST http://localhost:4321/api/auth/login \
  -d 'email=admin@laboratorio.org' -d 'password=tu-contrasena'

# 2. Invitar a un nuevo usuario (solo admin)
curl -b cookies.txt -X POST http://localhost:4321/api/invitations \
  -H 'Content-Type: application/json' \
  -d '{"email":"nuevo@laboratorio.org"}'
```

La respuesta es `{"ok":true}` si el correo se envió. `401` indica que falta la sesión y `403` que el usuario no es `admin`.

## Configuración de Gmail (SMTP)

Los correos de invitación los envía la propia aplicación con `nodemailer`, usando el SMTP de Gmail:

1. Activa la **verificación en dos pasos** en la cuenta de Google.
2. Entra en [myaccount.google.com](https://myaccount.google.com) → **Seguridad** → **Verificación en dos pasos** → **Contraseñas de aplicación**.
3. Crea una contraseña de aplicación (por ejemplo con el nombre «Dona de Sangre»). Google muestra 16 caracteres en una sola vez.
4. Rellena las variables:

   ```sh
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=465
   SMTP_USER=tu-cuenta@gmail.com
   SMTP_PASS=la-contrasena-de-aplicacion
   ```

Consideraciones importantes:

- **Usa siempre una contraseña de aplicación**, nunca la contraseña real de Google: la contraseña real no funciona con SMTP.
- El remitente es `SMTP_USER`. Si el correo acaba en spam, añade el remitente a los contactos del laboratorio.
- Gmail permite alrededor de **500 correos al día** (menos en cuentas nuevas), suficiente para el caso del laboratorio. Si el volumen crece, hay que migrar a otro proveedor (Resend, SendGrid…).
- Si la contraseña de aplicación se revoca o caduca, los envíos fallan: el error queda registrado en el servidor (`[invitations] fallo SMTP:`) y `POST /api/invitations` responde con un mensaje genérico. Para rotarla, genera una nueva en Google y actualiza `SMTP_PASS`.
- El enlace de invitación **caduca en 1 hora** y solo puede usarse una vez. Si caduca, hay que volver a invitar al mismo correo.

## Puesta en marcha

```sh
npm install
cp .env.template .env    # rellena los valores
npm run dev
```

La aplicación queda en `http://localhost:4321`; la ruta `/` redirige a `/auth/login`.

## Scripts y comandos

Todos se ejecutan desde la raíz del proyecto.

| Comando | Qué hace |
| ------- | -------- |
| `npm install` | Instala las dependencias. |
| `npm run dev` | Levanta el servidor de desarrollo en `http://localhost:4321`. |
| `npm run build` | Compila el sitio SSR en `./dist/`. Es la verificación principal. |
| `npm run check` | `astro check`: comprueba los tipos del frontmatter de los `.astro`. |
| `npm run preview` | Sirve localmente el build de producción. |
| `npx tsc --noEmit` | Comprueba los tipos sin emitir archivos. |
| `npx astro dev --background` | Servidor de desarrollo en segundo plano (`status`, `logs --follow` y `stop` lo gestionan). |

No hay scripts de test, lint ni formateo. `astro` no está en el `PATH`: usa siempre `npx astro ...`.

## Estructura del proyecto

```text
src/
├── middleware.ts                          # refresco de sesión, protección de /dashboard y bloqueo por estatus
├── env.d.ts                               # tipos de astro:env y App.Locals
├── styles/global.css                      # Tailwind 4 + daisyUI y los temas dona / dona-dark
├── lib/                                   # infraestructura compartida entre features
│   ├── current-user.ts                    # perfil del solicitante (nombre, correo, rol, estatus)
│   ├── database.types.ts                  # tipos de Supabase generados desde el MCP
│   ├── estatus.ts                         # tipo Estatus y mapa ESTATUS_INFO (etiqueta, clase del badge)
│   ├── roles.ts                           # tipo Rol y mapa ROL_INFO (etiqueta, clase del badge)
│   └── supabase.ts                        # cliente de servidor (@supabase/ssr) con cookies
├── components/
│   └── ui/                                # componentes usados por varias features
│       ├── BaseLayout.astro               # <head>, <body>, importa global.css
│       ├── AlertError.astro               # aviso de error accesible
│       └── AppNavbar.astro                # navbar del panel y «Cerrar sesión»
├── features/
│   ├── auth/components/                   # AuthCard, FormField, PasswordInput
│   ├── dashboard/components/              # AdminUsersShortcutCard
│   ├── users/
│   │   ├── components/                    # AdminUsersPanel, UsersSearchForm, UsersTable, UsersPagination
│   │   └── lib/                           # users-list.ts (consulta, saneado y paginación)
│   └── invitations/lib/                   # email.ts (nodemailer) y supabase-admin.ts
└── pages/
    ├── cuenta-desactivada.astro           # 403 para una cuenta desactivada
    ├── dashboard/index.astro              # panel protegido
    ├── dashboard/admin/users.astro        # listado de usuarios (solo admin)
    ├── auth/{login,confirm,update-password}.astro
    └── api/
        ├── invitations.ts
        └── auth/{login,logout}.ts
```

Reglas de organización:

- `src/pages/` solo contiene enrutado y frontmatter; el marcado vive en componentes.
- Un componente compartido por varias features va en `src/components/ui/`; uno de una sola feature, en `src/features/<feature>/components/`.
- `src/lib/` es infraestructura común; el código de una sola feature va en `src/features/<feature>/lib/`.

## Rutas de la aplicación

**Páginas**

| Ruta | Descripción |
| ---- | ----------- |
| `/` | Redirige a `/auth/login`. |
| `/auth/login` | Formulario de inicio de sesión. |
| `/auth/confirm` | Verifica el token de invitación, crea la sesión y redirige a la elección de contraseña. |
| `/auth/update-password` | `GET`: formulario de contraseña nueva. `POST`: valida y guarda la contraseña. |
| `/dashboard` | Panel protegido: muestra el perfil y el rol del usuario. Solo el `admin` ve además la tarjeta «Administrar usuarios». |
| `/dashboard/admin/users` | Listado de los usuarios registrados, solo para `admin`: responde 403 si la sesión no es de un administrador. Admite `?q=` (búsqueda por nombre o correo), `?estatus=` (`activo` o `inactivo`) y `?page=` (paginación de 10). |
| `/cuenta-desactivada` | Aviso de cuenta desactivada. Responde 403 y no requiere sesión. |

**API**

| Ruta | Descripción |
| ---- | ----------- |
| `POST /api/auth/login` | Inicia sesión con correo y contraseña. |
| `POST /api/auth/logout` | Cierra la sesión. |
| `POST /api/invitations` | Solo para `admin`: genera el enlace de invitación y envía el correo. |

El flujo de invitación es: **invitar → correo → confirmar el enlace → elegir contraseña → entrar al panel**.

### Búsqueda, filtro y paginación de usuarios

La pantalla de administración resuelve la búsqueda, el filtro y la paginación **en el servidor**, con la query string: cada URL es compartible y la pantalla funciona sin JavaScript.

- `?q=término` filtra por nombre o correo, sin distinguir mayúsculas. El término se sanea antes de llegar al filtro de PostgREST (solo se conservan letras, dígitos, espacio y `@ . - _`, y el guion bajo deja de actuar como comodín). El valor saneado es el que se muestra en el campo de búsqueda y en los enlaces de paginación: lo que se ve es lo que se busca.
- `?estatus=activo` o `?estatus=inactivo` filtra por el estatus de la cuenta. Es una lista blanca: cualquier otro valor equivale a «Todos». El filtro se aplica en la consulta, tanto en el total como en las filas, de modo que ambos siempre coinciden.
- `?page=n` indica el número de página, con 10 usuarios por página. Si la página no existe, se recorta a la última válida en lugar de fallar. Los enlaces de página arrastran `q` y `estatus`.
- El formulario de búsqueda combina `q` y `estatus` y no incluye el número de página, así que al enviarlo el listado vuelve a la primera página.
- «Quitar filtros» borra a la vez el texto de búsqueda y el filtro de estatus.
- El listado se lee con la sesión del solicitante, de modo que es RLS quien decide qué filas se ven. La clave secreta (`sb_secret_…`) no interviene.
- Limitación conocida: `ILIKE` no ignora los acentos, así que buscar `jose` no encuentra a `José`.

## Estatus de las cuentas

Cada cuenta de `public.usuarios` tiene un estatus: `activo` (por defecto) o `inactivo`. El estatus se aplica en dos capas.

**En la base de datos.** Un trigger (`on_usuarios_estatus_changed`) mantiene `auth.users.banned_until` sincronizado con la columna: al poner `estatus = 'inactivo'` la cuenta queda baneada en Supabase Auth y `signInWithPassword` falla. Al volver a `activo`, el baneo se levanta.

**En la aplicación.** El middleware comprueba el estatus en **toda** petición con sesión (no solo en `/dashboard/*`):

- Si el estatus es `inactivo`, cierra la sesión y responde **403**: en las páginas, con una redirección a `/cuenta-desactivada`; en las rutas `/api/*`, con un JSON de error.
- Si el estatus no se puede leer, responde **503**: se falla cerrado, porque sin base de datos no se puede comprobar el bloqueo.
- La ruta `/cuenta-desactivada` está exenta de la comprobación, para que no se redirija a sí misma en bucle.

El login no se modifica: `POST /api/auth/login` responde «Correo o contraseña incorrectos» tanto si la contraseña es errónea como si la cuenta está desactivada, de modo que no se revela qué correos existen.

**El estatus todavía no se cambia desde la aplicación**: la interfaz de gestión de usuarios del panel administrativo llegará en un spec posterior. Mientras tanto se modifica con un `UPDATE` en el panel de Supabase:

```sql
update public.usuarios
set estatus = 'inactivo'
where email = 'persona@laboratorio.org';
```

## Modelo de datos y roles

La tabla `public.usuarios` guarda el perfil de cada cuenta (nunca contraseñas) y se crea automáticamente mediante un trigger sobre `auth.users`.

| Columna | Tipo | Notas |
| ------- | ---- | ----- |
| `id` | `uuid` | Clave primaria y referencia a `auth.users` (borrado en cascada). |
| `nombre` | `text` | Obligatorio, entre 1 y 120 caracteres. |
| `email` | `text` | Obligatorio y único, en minúsculas. |
| `rol` | `rol_usuario` | `admin`, `supervisor` o `capturador`. Por defecto `capturador`. |
| `estatus` | `estatus_usuario` | `activo` o `inactivo`. Obligatorio, por defecto `activo`. |
| `created_at` | `timestamptz` | Fecha de alta. |

| Rol | Permisos actuales |
| --- | ----------------- |
| `admin` | Acceso al panel, al área de administración de usuarios (`/dashboard/admin/users`) e invitaciones (`POST /api/invitations`). |
| `supervisor` | Acceso al panel; por RLS puede leer los perfiles del equipo. |
| `capturador` | Acceso al panel y a su propio perfil. |

Los roles se distinguen en la interfaz en el área de administración de usuarios (visible solo para `admin` y con un 403 en el servidor para el resto), en el listado de usuarios, donde cada fila muestra el rol con su etiqueta legible, y en el endpoint de invitaciones. El estatus de cada cuenta se distingue en el mismo listado, con un badge «Activo» o «Inactivo». El resto de la interfaz está en desarrollo.

## Despliegue en Netlify

`netlify.toml` ya define la compilación (`npm run build`), el directorio publicado (`dist`) y la versión de Node.

1. Importa el repositorio en Netlify desde GitHub. La configuración de build se detecta sola a partir de `netlify.toml`.
2. En **Site configuration → Environment variables**, define las variables de servidor: `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SECRET_API_KEY`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER` y `SMTP_PASS`. Netlify las expone al build y a las funciones de servidor, que es donde Astro lee los secretos de `astro:env`.
3. Actualiza la configuración de Supabase: en **Authentication → URL Configuration**, pon la URL de Netlify como *Site URL* y añade `https://<sitio>.netlify.app/**` a las *Redirect URLs*.
4. Despliega. El enlace de las invitaciones se construye con el origen de la petición, así que ya apunta al dominio de Netlify.

No subas el archivo `.env` al repositorio: las credenciales viajan siempre por las variables de entorno de Netlify.

## Seguridad

- Todas las variables sensibles son secretos de servidor (`context: 'server'`, `access: 'secret'`): no aparecen en el HTML, en el JS servido al cliente ni en `dist/`.
- RLS está activo en `public.usuarios` con políticas por tabla: un usuario autenticado solo puede leer su propio perfil, y `admin` o `supervisor` pueden leer los del equipo.
- La clave secreta (`sb_secret_…`) solo se usa en `src/features/invitations/lib/supabase-admin.ts`, y ese módulo únicamente se importa desde rutas de API.
- Las cookies de sesión son `httpOnly`, `sameSite=lax` y `secure` en producción; las peticiones se autorizan con `getClaims()`, nunca con `getSession()`.
- Las rutas bajo `/dashboard` son las únicas que exigen sesión.
- Las cuentas con estatus `inactivo` no pueden entrar ni usar la aplicación: el baneo de Supabase Auth impide el inicio de sesión y el middleware cierra la sesión y responde 403 en cualquier petición. La comprobación falla cerrada: si el estatus no se puede leer, la aplicación responde 503.
- El inicio de sesión no revela si un correo existe: una contraseña incorrecta y una cuenta desactivada devuelven el mismo mensaje.

## Solución de problemas

| Síntoma | Causa habitual y solución |
| ------- | ------------------------- |
| El build muestra avisos `Invalid empty selector` | Vienen del CSS de daisyUI. Son no fatales y no afectan al sitio. |
| `Missing or invalid environment variable` al arrancar | Falta alguna variable del esquema de `astro:env`. Revisa `.env` y `astro.config.mjs`. |
| El correo de invitación no llega | Revisa `SMTP_*`, que la contraseña de aplicación siga vigente y el límite diario de Gmail; mira el log `[invitations] fallo SMTP:` en la salida del servidor. |
| «Enlace no válido» al confirmar | El enlace caducó (1 hora) o ya se usó. Vuelve a invitar al mismo correo. |
| `POST /api/invitations` devuelve 401 o 403 | Falta la sesión (401) o el usuario no tiene rol `admin` (403). |
| El login dice «Correo o contraseña incorrectos» y la contraseña es correcta | La cuenta puede estar desactivada: el login no lo distingue por seguridad. Comprueba el estatus en `public.usuarios` o en el panel de Supabase. |
| Una cuenta desactivada no puede volver a entrar | Reactívala con `update public.usuarios set estatus = 'activo' where email = '…'`; el trigger levanta el baneo de Supabase Auth. |
| `email_exists` al invitar | El correo ya tiene cuenta: no se crea una segunda y la respuesta es genérica. |

## Desarrollo con specs

Los cambios se planifican antes de escribirse, en `specs/NN-slug.md`:

- `/spec` redacta el documento del spec; nunca toca el código de la aplicación.
- `/spec-impl` es el único flujo que modifica código, y solo si el spec está en estado *Approved*. Implementa un paso cada vez y espera la revisión humana.
- `spec-verifier` comprueba los criterios de aceptación y solo edita lo que hay bajo `specs/`.

El detalle completo del flujo y de las reglas del repositorio está en [AGENTS.md](./AGENTS.md).
