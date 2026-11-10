# SPEC 03 — Invitación, confirmación de correo y contraseña propia

> **Estado:** Aprobado
> **Depende de:** SPEC 02
> **Fecha:** 2026-11-07
> **Objetivo:** Permitir que un administrador invite cuentas desde la aplicación y que el usuario confirme el correo y defina su propia contraseña antes de entrar al dashboard. Los correos los envía la aplicación (nodemailer + Gmail); Supabase solo autentica.

## Por qué existe este spec

SPEC 02 deja el login funcionando, pero asume cuentas ya confirmadas con contraseña conocida. El producto no tiene registro público: las cuentas las crea el laboratorio.

Este spec cierra el alta real. La app genera la invitación con `admin.generateLink` y manda el correo desde su propio servidor SMTP (Gmail vía nodemailer). El usuario recibe el correo, confirma el enlace y define su contraseña sin que el admin llegue a conocerla. Supabase se queda con la parte de autenticación: verificar el token, crear la sesión y actualizar la contraseña. Al terminar, el flujo completo queda: invitar → confirmar → elegir contraseña → entrar.

## Alcance

**Incluido:**

- Servidor SMTP con `nodemailer` y una cuenta Gmail (credenciales solo en variables de entorno de servidor).
- Cliente admin server-only con `SUPABASE_SERVICE_ROLE_KEY` para llamar a `auth.admin.generateLink`.
- Ruta `POST /api/invitations` protegida con sesión y rol `admin` que genera el enlace y envía el correo.
- Plantilla de correo de invitación propia (texto/HTML mínimo en español) con el enlace a `/auth/confirm`.
- Ruta `GET /auth/confirm` que verifica el token con `verifyOtp` y redirige.
- Ruta `GET /auth/update-password` con el formulario de contraseña nueva.
- Ruta `POST /auth/update-password` que valida, llama a `updateUser` y redirige a `/dashboard`.
- Configuración del proyecto Supabase: Site URL, Redirect URLs permitidas, mínimo de contraseña y flujo de invitación.
- Estados de error para enlace inválido, caducado o ya usado.
- Documentación en `AGENTS.md` del SMTP propio, los límites de Gmail y el uso server-only de `service_role`.

**Fuera de alcance (para specs futuros):**

- Panel administrativo para agregar usuarios desde la aplicación (el endpoint ya existe en este spec; el panel solo añade UI y su guard de rol).
- Registro público `/auth/register`.
- Recuperación de contraseña («¿Olvidaste tu contraseña?»).
- Endpoint o UI de reenvío distinto de re-invitar el mismo correo.
- Otros proveedores SMTP (Resend, SendGrid, etc.) y verificación de dominio propio.
- Emails con diseño propio más allá de una plantilla mínima en texto/HTML.
- MFA, OAuth, magic links y enlaces de un solo uso para login.
- Cambio de correo o de contraseña desde la aplicación.

## Modelo de datos

Este spec no introduce estructuras de datos nuevas. Reutiliza:

- `auth.users`, donde Supabase guarda el usuario y la contraseña hasheada.
- `public.usuarios` de SPEC 02, que recibe la fila por el trigger de alta con `rol = 'capturador'`.
- La sesión en cookies creada por el middleware de SPEC 02.

### Secretos de servidor

Todos se declaran en `astro.config.mjs` con `context: 'server'` y `access: 'secret'`, viven en `.env` (gitignored) y solo llevan placeholder en `.env.template`:

| Variable                      | Uso                                                          |
| ----------------------------- | ------------------------------------------------------------ |
| `SUPABASE_SERVICE_ROLE_KEY`   | Cliente admin server-only para `generateLink`. Nunca en cliente. |
| `SMTP_HOST`                   | `smtp.gmail.com`.                                            |
| `SMTP_PORT`                   | `465` (conexión TLS directa).                                |
| `SMTP_USER`                   | Cuenta Gmail que envía; también es la dirección «De».        |
| `SMTP_PASS`                   | Contraseña de aplicación de Google (16 caracteres).          |

### Generación de la invitación

- `auth.admin.generateLink({ type: 'invite', email })` crea el usuario si no existe (dispara el trigger de `public.usuarios`), devuelve `properties.hashed_token` y **no envía ningún correo**: el envío es responsabilidad de la app.
- El correo construye su propio enlace con el `token_hash`; no se usa `action_link` de Supabase.

Parámetros de la ruta de confirmación:

| Parámetro    | Origen                       | Uso                                                     |
| ------------ | ---------------------------- | ------------------------------------------------------- |
| `token_hash` | `generateLink` (hash)        | Token que consume `verifyOtp`                           |
| `type`       | Generado por la app          | `invite` en este flujo                                  |
| `next`       | Generado por la app          | Ruta interna destino; por defecto `/auth/update-password` |

Reglas de `next`:

- Solo se acepta si empieza por `/` y no empieza por `//`.
- Cualquier otro valor cae al destino por defecto.
- Nunca se acepta una URL absoluta, aunque venga del propio correo.

## Plan de implementación

1. Configurar Supabase Auth en el Dashboard: Site URL con la URL de producción, Redirect URLs con `http://localhost:4321/**` y el dominio de Netlify, mínimo de contraseña de 8 caracteres y «Confirm email» activo. Verificar que el proyecto rechaza una contraseña de 7 caracteres.
2. Preparar Gmail: activar 2FA en la cuenta y generar una contraseña de aplicación; instalar `nodemailer` (v10 trae sus propios tipos); declarar `SUPABASE_SERVICE_ROLE_KEY` y `SMTP_*` en `astro.config.mjs`, rellenar `.env` local y dejar placeholders en `.env.template`. Verificar el envío con un script temporal que mande un correo de prueba y comprobar que llega.
3. Crear `src/lib/supabase-admin.ts` con el cliente `service_role`, importado únicamente desde rutas de API. Verificar que el HTML/JS servido al cliente no contiene la clave.
4. Crear `src/lib/email.ts`: transporter de nodemailer (puerto 465, TLS) y `sendInviteEmail({ email, tokenHash })` que construye la URL a `/auth/confirm` desde el origen de la petición y envía texto + HTML mínimo en español, sin contraseñas, con la dirección invitada, el aviso de caducidad (1 hora) y «De» = `SMTP_USER`.
5. Crear `POST /api/invitations`: valida el formato del email, exige sesión con `getClaims()` (401 si no la hay), consulta `public.usuarios` y exige `rol = 'admin'` (403 si no), llama a `generateLink`, devuelve error genérico si el correo ya tiene cuenta, envía el correo y responde 200 con JSON. Los fallos de SMTP se loguean en servidor y responden un error genérico. Verificar con curl: sin sesión 401, con rol `capturador` 403, con admin 200 y llega exactamente un correo (el de la app; ninguno de Supabase).
6. Crear `GET /auth/confirm`: lee `token_hash`, `type` y `next`, valida `next`, llama a `verifyOtp` y redirige al destino o a `/auth/login?error=link_invalido`. Verificar con un enlace real y con uno manipulado.
7. Crear `GET /auth/update-password`: si no hay sesión, redirige a `/auth/login`; si hay sesión, muestra el formulario con contraseña y confirmación. Verificar ambos casos.
8. Crear `POST /auth/update-password`: valida longitud mínima, coincidencia y que la sesión exista; llama a `updateUser({ password })` y redirige a `/dashboard`. En error, vuelve al formulario con mensaje visible. Verificar el alta completa de una cuenta.
9. Añadir los estados de error de `/auth/confirm` y `/auth/update-password` reutilizando el patrón visual de SPEC 01, con un enlace a `/auth/login`. Verificar enlace caducado, ya usado y token inválido.
10. Verificar el flujo completo (invitar → correo → confirmar → contraseña → dashboard → cerrar sesión → entrar con la nueva contraseña) a 320 px y sin errores de consola, y documentar en `AGENTS.md` el SMTP propio de Gmail, su límite diario, el uso server-only de `service_role` y que el botón «Invite user» del Dashboard no se usa porque mandaría un segundo correo desde Supabase.

## Criterios de aceptación

- [ ] El envío de prueba con `nodemailer` desde local llega a la bandeja de la cuenta Gmail.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` y `SMTP_*` están en `.env` y en las variables de Netlify, con solo placeholders en `.env.template`.
- [ ] El repositorio no contiene credenciales SMTP ni la clave `service_role`.
- [ ] La clave `service_role` y las credenciales SMTP no aparecen en el HTML/JS servido al cliente.
- [ ] `POST /api/invitations` sin sesión devuelve 401.
- [ ] `POST /api/invitations` con sesión de rol `capturador` devuelve 403.
- [ ] `POST /api/invitations` con sesión admin devuelve 200, crea la fila en `usuarios` con `rol = 'capturador'` y llega exactamente un correo (el de la app, ninguno de Supabase).
- [ ] El correo de invitación no contiene ninguna contraseña y su enlace apunta a `/auth/confirm` con `token_hash` y `type=invite`.
- [ ] Invitar un correo que ya tiene cuenta devuelve un error genérico al admin y no crea una segunda cuenta.
- [ ] Abrir el enlace de invitación crea cookies de sesión y redirige a `/auth/update-password`.
- [ ] `/auth/update-password` sin sesión redirige a `/auth/login`.
- [ ] Una contraseña de menos de 8 caracteres muestra un error y no llama a Supabase.
- [ ] Dos contraseñas distintas muestran un error y no llaman a Supabase.
- [ ] Una contraseña válida actualiza la cuenta, redirige a `/dashboard` y deja la sesión activa.
- [ ] Después de definir la contraseña, el usuario puede cerrar sesión y volver a entrar con esa contraseña.
- [ ] Reabrir el mismo enlace de invitación muestra un error de enlace inválido o caducado.
- [ ] Un enlace con `token_hash` inventado muestra un error y no crea sesión.
- [ ] Un `next` con `https://ejemplo.com` o `//ejemplo.com` se ignora y se usa `/auth/update-password`.
- [ ] El enlace caducado muestra un texto que explica que debe pedir una nueva invitación.
- [ ] Ningún error de login o confirmación revela si el correo existe en el sistema.
- [ ] El flujo completo funciona a 320 px de ancho, sin scroll horizontal.
- [ ] No hay errores en la consola del navegador en confirmación, formulario y error.

## Decisiones tomadas y descartadas

- **Sí:** `token_hash` + `verifyOtp` en una ruta de servidor. Funciona con cookies y evita depender del fragmento de URL del flujo implícito.
- **No:** `{{ .ConfirmationURL }}` del flujo implícito. El token viaja en el hash y no llega al servidor, justo lo que SPEC 02 necesita.
- **Sí:** nodemailer + Gmail SMTP y correo enviado por la aplicación. Supabase solo autentica; el envío no depende del SMTP integrado ni de los límites de Supabase.
- **No:** SMTP integrado de Supabase (2 correos por hora). Queda documentado como descartado.
- **No:** hook «Send Email» de Supabase. Exige un endpoint público siempre disponible con verificación de firma de webhook; la app ya llama a Supabase, no al revés.
- **Sí:** `admin.generateLink` en lugar de `inviteUserByEmail`. `generateLink` devuelve el `token_hash` sin enviar correo; `inviteUserByEmail` mandaría un segundo correo desde Supabase.
- **Sí:** `service_role` solo en servidor. Es obligatorio para `generateLink`; se mantiene prohibido en código de cliente y solo se declara como secreto de `astro:env`.
- **Sí:** endpoint `POST /api/invitations` en este spec, con guard de sesión y rol `admin`. El panel administrativo futuro solo añade UI sobre este endpoint.
- **Sí:** «De» del correo = la propia cuenta Gmail. Gmail no admite un From arbitrario sin configurar un alias.
- **Sí:** contraseña de aplicación de Google (la cuenta necesita 2FA). «Aplicaciones menos seguras» ya no existe.
- **No:** contraseña temporal creada por el admin. El admin conocería la contraseña y habría que forzar un cambio después.
- **Sí:** pantalla dedicada `/auth/update-password`. El usuario entiende qué está pasando y puede corregir errores.
- **Sí:** mínimo de 8 caracteres en el formulario y en la configuración del proyecto. La validación del cliente da feedback y la del servidor es la que cuenta.
- **Sí:** reenvío = re-invitar el mismo correo desde el endpoint (o el panel futuro). Un endpoint público de reenvío añade superficie de abuso y necesita rate limit propio.
- **Sí:** errores genéricos. El flujo de login/confirmación no debe servir para averiguar qué correos están registrados; el endpoint solo es accesible para admins autenticados.
- **No:** reenviar la invitación automáticamente cuando caduca. La caducidad por defecto es de 1 hora y el admin decide.
- **No:** magic link para entrar sin contraseña. El producto pide contraseña propia para operar.

## Riesgos

| Riesgo                                                                  | Mitigación                                                                                          |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Gmail limita unos 500 correos por día (menos en cuentas nuevas)         | Suficiente para el laboratorio; migrar a otro SMTP cuando haya más volumen.                          |
| La contraseña de aplicación se revoca o caduca y corta los envíos       | El primer envío falla con error claro en el log; documentar la rotación en `AGENTS.md`.              |
| Los correos a otros dominios pueden caer en spam                       | Verificar la entrega con la primera cuenta real y avisar al admin al invitar.                       |
| Fuga de `service_role` o de credenciales SMTP al cliente               | Solo secretos de `astro:env` server, placeholders en `.env.template` y revisar el bundle del despliegue. |
| Un antivirus o «Safe Links» consume el enlace antes que el usuario     | Re-invitar desde el endpoint y documentar el caso.                                                   |
| La invitación caduca en 1 hora                                         | Añadir el texto de «solicita una nueva invitación» en el error y no guardar tokens en el cliente.    |
| Un fallo de SMTP deja al admin sin feedback                            | Respuesta JSON genérica en el endpoint y log detallado en servidor.                                  |
| `verifyOtp` deja sesión abierta en un navegador compartido             | Recordar en el dashboard que la sesión se cierra con el botón de salir; no se añade expiración extra. |
| El enlace se abre en otro navegador distinto del que lo pidió          | El flujo no depende del navegador de origen: el token crea la sesión donde se abre.                  |
| El usuario define la contraseña pero no recuerda el correo usado       | El correo muestra la dirección invitada y el login no revela si existe; soporte lo revisa a mano.     |

## Qué **no** entra en este spec

- Panel administrativo para agregar usuarios (spec futuro; este spec deja el endpoint listo).
- Registro público y autogestión de cuenta.
- Recuperación de contraseña olvidada.
- Endpoint o enlace público de reenvío.
- Otros proveedores SMTP, verificación de dominio y plantillas con diseño.
- MFA, OAuth y magic links.
- Cambio de correo o contraseña desde la aplicación.

Cada uno de esos puntos, si llega, va en su propio spec.
