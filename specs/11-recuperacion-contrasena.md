# SPEC 11 — Recuperación de contraseña

> **Estado:** Implementado
> **Depende de:** SPEC 02, SPEC 03, SPEC 09, SPEC 10
> **Fecha:** 2026-11-16
> **Objetivo:** Permitir que una persona con cuenta activa solicite por correo un enlace de un solo uso para establecer una contraseña nueva cuando no recuerda la actual.

## Por qué existe este spec

El login ya tiene escrito el enlace «¿Olvidaste tu contraseña?» (`src/pages/auth/login.astro`, línea 34), pero apunta a `#`: no hace nada. SPEC 10 dejó la recuperación explícitamente fuera de alcance («Reenvío de la invitación a una cuenta **ya confirmada** (eso es recuperación de contraseña, no invitación)»), así que hoy la única forma de recuperar el acceso es que el `admin` elimine la cuenta y cree otra desde el panel.

El laboratorio es pequeño, pero las personas son las mismas: una cuenta que entra cada semana y otra que lleva dos meses sin entrar se olvidan la contraseña igual. Eliminar y recrear la cuenta pierde el `id` de la persona, deja rastro en la auditoría de Supabase y genera un correo de invitación que no corresponde a una alta real.

Este spec cierra ese hueco reutilizando todo lo que ya funciona: el patrón de correo propio con `nodemailer` (SPEC 09), la generación de enlaces con `auth.admin.generateLink` (SPEC 09), la verificación de tokens de `/auth/confirm` (SPEC 03) y el formulario de contraseña de `/auth/update-password` (SPEC 03). Lo único nuevo es la página que pide el correo y la ruta que lo envía.

## Alcance

**Incluido:**

- Página `/auth/forgot-password` con un único campo de correo y un botón de envío.
- Ruta de API `POST /api/auth/recovery` que valida la entrada, genera el enlace con la clave secreta y envía el correo con el SMTP propio.
- Correo de recuperación con un enlace de un solo uso que apunta a `/auth/confirm?token_hash=…&type=recovery&next=/auth/update-password?motivo=recuperacion`.
- El enlace se envía **siempre al correo registrado** de la cuenta (`public.usuarios.email`): el correo que la persona escribe en el formulario solo sirve para localizar la cuenta y confirmar cuál es.
- Respuesta **genérica** idéntica tanto si el correo está registrado como si no: no se revela la existencia de la cuenta.
- Límite de frecuencia: un envío por correo cada 60 s y cinco peticiones por IP cada 10 minutos.
- Enlace de «¿Olvidaste tu contraseña?» del login apuntando a `/auth/forgot-password`.
- Copy de «contraseña nueva» en `/auth/update-password` cuando el flujo es de recuperación.
- Refactor compartido: `createSupabaseAdminClient()` pasa a `src/lib/` (lo usan invitaciones, usuarios y recuperación) y el transporte SMTP se extrae a `src/lib/smtp.ts`.
- Actualización de `README.md` y `AGENTS.md`.

**Fuera de alcance (para specs futuros):**

- Registro público de cuentas (sigue reservando el alta al laboratorio).
- Recuperación por SMS, WhatsApp u otro canal.
- **Cambiar el correo de una cuenta existente.** La recuperación solo funciona en el correo registrado: si la persona ya no tiene acceso a ese buzón, el camino previsto es pedir al `admin` que elimine la cuenta y cree una nueva con otro correo (SPEC 10).
- Recuperación para cuentas con el correo **sin confirmar**: la reenvía el `admin` desde el panel (SPEC 10).
- Recuperación para cuentas `inactivo`: el middleware las bloquea igual (SPEC 08).
- Aviso por correo al cambiar la contraseña: exige configurar los correos de seguridad de Supabase (otra SMTP y otra plantilla).
- Caducidad configurable del enlace: la de GoTrue (una hora).
- Límite de frecuencia distribuido (tabla o Redis): el actual vive en la memoria de la instancia.
- Reenvío automático del correo si el primero no llega: el formulario se puede volver a usar pasado el cooldown.
- Recuperación desde la cuenta ya iniciada (cambio de contraseña voluntary): hoy `/auth/update-password` es accesible con sesión, pero no se ofrece desde la interfaz.

## Modelo de datos

**No hay cambios en la base de datos.** La recuperación no crea tablas, columnas, políticas ni migraciones: reutiliza `public.usuarios` (`email`, `nombre`, `email_confirmado`, `estatus`) y los tokens de GoTrue.

### El enlace

El correo lleva un enlace con la misma forma que el de invitación (SPEC 03), pero con `type=recovery`:

```text
{origin}/auth/confirm?token_hash={hashed_token}&type=recovery&next=/auth/update-password?motivo=recuperacion
```

| Parte | Origen | Para qué sirve |
| --- | --- | --- |
| `token_hash` | `admin.auth.admin.generateLink({ type: 'recovery' })` → `properties.hashed_token` | Token de recuperación de un solo uso, emitido por GoTrue |
| `type=recovery` | Constante | Indica a `/auth/confirm` que use `verifyOtp({ type: 'recovery' })` |
| `next` | Constante | Destino tras verificar el token: el formulario de contraseña nueva |

`next` no es un destino libre: lo fija la aplicación. `/auth/confirm` lo sanea (`sanitizeNext`) y solo acepta rutas internas.

### A qué correo se envía el enlace

El destinatario es **el correo registrado de la cuenta**, nunca el que la persona escribe en el formulario.

| Correo | De dónde sale | Para qué sirve |
| --- | --- | --- |
| El que escribe la persona | El campo del formulario | Localizar la cuenta: se normaliza y se busca en `public.usuarios.email` |
| El que recibe el enlace | `public.usuarios.email` de la fila encontrada | Destino del correo de recuperación |

Los dos son el mismo valor cuando la cuenta existe: la búsqueda es por correo, así que una dirección distinta no encuentra ninguna fila y no se envía nada. La separación importa para lo que el correo **no** puede hacer: la aplicación nunca envía un enlace a una dirección que no sea la registrada, y por tanto nunca cambia el correo de la cuenta.

`public.usuarios.email` lo mantiene el trigger `private.sync_user_email` (SPEC 02) y se guarda en minúsculas, igual que la normalización del formulario.

### Los estados de la página

La página `/auth/forgot-password` no guarda estado en el servidor: el estado viaja en la URL, como en el resto de la aplicación.

| Parámetro | Significado | Lo ve la persona |
| --- | --- | --- |
| `?estado=enviado` | La petición se procesó | «Si ese correo está registrado, te enviamos un enlace a ese mismo correo para cambiar la contraseña.» |
| `?error=email_invalido` | El correo no tiene un formato válido | «Introduce un correo electrónico válido.» |
| `?error=envio_fallido` | El servidor no pudo enviar el correo | «No se pudo enviar el correo. Inténtalo de nuevo en un momento.» |

El caso «el correo no está registrado» **no** tiene parámetro propio: se responde igual que `?estado=enviado`.

### El límite de frecuencia

El estado vive en la memoria del proceso de la ruta de API (`src/features/auth/lib/rate-limit.ts`):

```ts
type RateLimitState = {
  // Último envío por correo (mapa correo → marca de tiempo).
  lastSentByEmail: Map<string, number>;
  // Peticiones por IP dentro de la ventana (mapa IP → marcas de tiempo).
  requestsByIp: Map<string, number[]>;
};
```

| Regla | Valor | Motivo |
| --- | --- | --- |
| Cooldown por correo | 60 s | Evita el reenvío automático en cadena y el uso del formulario como generador de correos |
| Ventana por IP | 10 min | Limita el volumen de peticiones desde una misma origem |
| Peticiones por IP en la ventana | 5 | Suficiente para una persona que se equivoca; insuficiente para inundar un buzón |

El estado no se persiste: en Netlify (funciones serverless) vive en la instancia que atiende la petición. Es una protección de esfuerzo, no un muro.

### Los tipos de la librería

```ts
// src/features/auth/lib/recovery.ts
export type RecoveryRequest = { email: string };

export type RecoverableUser = {
  id: string;
  nombre: string;
  email: string;
};

// Resultado del análisis de la petición: el correo normalizado o el error.
export type ParseRecoveryResult =
  | { ok: true; input: RecoveryRequest }
  | { ok: false; error: string };
```

## Comportamiento

### La página `/auth/forgot-password`

- Reutiliza `AuthCard` y `FormField` como el resto de las pantallas de acceso.
- Un único campo `email` (`type="email"`, `required`, `autocomplete="email"`) con la etiqueta «Correo» y una ayuda debajo: «Escribe el correo con el que te registraste: el enlace se enviará a ese mismo correo».
- Un botón `btn btn-primary` con el texto «Enviar enlace».
- Un enlace «Volver a iniciar sesión» hacia `/auth/login`.
- Una nota bajo el formulario: «Si ya no tienes acceso a ese correo, pide al administrador que elimine la cuenta y cree una nueva con otro correo.»
- El mensaje de éxito usa `alert alert-success alert-soft`; los de error, `AlertError` (`alert alert-error alert-soft`).
- El script deshabilita el botón y lo cambia a «Enviando…» al enviar, igual que el login y que `/auth/update-password`.
- Es accesible sin sesión. Una persona con la sesión abierta también puede verla (no hace daño: solo se envía a la cuenta que ella indique).

### La ruta `POST /api/auth/recovery`

Orden de las comprobaciones:

1. **Formato.** El correo se normaliza (`trim` + `toLowerCase`) y se valida con el mismo patrón que las invitaciones. Si no es válido → `303` a `/auth/forgot-password?error=email_invalido`.
2. **Límite por IP.** Si la IP superó las cinco peticiones en la ventana → se registra en el log y se responde `303` a `/auth/forgot-password?estado=enviado` (la misma respuesta de éxito: el límite no puede revelar si la cuenta existe).
3. **Cooldown por correo.** Si ese correo ya recibió un envío hace menos de 60 s → se registra en el log y se responde `303` a `/auth/forgot-password?estado=enviado`.
4. **Perfil.** Con el cliente admin se lee la fila de `public.usuarios` por correo. Si no existe, o si `email_confirmado = false`, o si `estatus = 'inactivo'` → se registra en el log y se responde `303` a `/auth/forgot-password?estado=enviado` (sin correo).
5. **Token.** `admin.auth.admin.generateLink({ type: 'recovery', email })` devuelve `properties.hashed_token`. Si falla, se registra el error y se responde `303` a `/auth/forgot-password?estado=enviado`.
6. **Correo.** `sendRecoveryEmail()` envía el mensaje **a `perfil.email`**, el correo registrado de la cuenta. Si el SMTP falla, se registra el error y se responde `303` a `/auth/forgot-password?error=envio_fallido`. Este error **sí** se muestra: un fallo de SMTP es global, no depende de que la cuenta exista.
7. **Éxito.** Se marca el cooldown de ese correo y se responde `303` a `/auth/forgot-password?estado=enviado`.

El correo escrito en el formulario **no** se usa como destinatario: se usa para encontrar la fila. El destinatario es siempre `public.usuarios.email` de esa fila.

`GET` devuelve `405` con la cabecera `Allow: POST`, como las demás rutas de API.

### El correo

- Remitente: `"Dona de Sangre" <SMTP_USER>` (el mismo que las invitaciones).
- Destinatario: `public.usuarios.email` de la cuenta, es decir, **el correo registrado**.
- Asunto: `Restablece tu contraseña - Dona de Sangre`.
- Saluda por el nombre de `public.usuarios.nombre`.
- Texto en HTML y en texto plano, con el nombre, el correo y el enlace escapados.
- Indica que el enlace **caduca en 1 hora** y que **solo puede usarse una vez**.
- Cierra con: «Si no has solicitado este cambio, ignora este correo: tu contraseña actual sigue siendo válida.»

### Si la persona ya no tiene acceso al correo registrado

La aplicación no tiene ninguna vía alternativa: el enlace solo puede enviarse al buzón registrado y, sin acceso a él, no hay forma de comprobar que quien pide el cambio es la titular de la cuenta.

El camino previsto es otro y ya existe: pedir al `admin` que **elimine la cuenta y cree una nueva con un correo distinto** (SPEC 09 y SPEC 10). Por eso la página lo dice de forma explícita y por eso este spec no contempla cambiar el correo de una cuenta existente.

El enlace de `/dashboard/admin/users` que elimina la cuenta y el que da de alta a una persona nueva son los dos pasos de ese camino.

### El enlace y el cambio de contraseña

1. La persona pulsa el enlace y llega a `/auth/confirm?token_hash=…&type=recovery&next=…`.
2. `/auth/confirm` llama a `verifyOtp({ type: 'recovery', token_hash })`. GoTrue consume el token y **crea la sesión** en el navegador (cookies `httpOnly`), igual que hace con el enlace de invitación.
3. La página redirige a `/auth/update-password?motivo=recuperacion`.
4. `/auth/update-password` muestra el título «Elige tu nueva contraseña» y el texto «Vamos a cambiar la contraseña de tu cuenta».
5. Al guardar, `updateUser({ password })` deja la contraseña nueva activa y la antigua sin efecto. La página redirige a `/dashboard`.

Si el token ya se usó, caducó o no existe, `/auth/confirm` muestra su página de «Enlace no válido» (con `200`, para no ensuciar la consola del navegador).

### Qué pasa con la sesión creada por el enlace

La sesión existe **antes** de que la persona fije la contraseña nueva: el token verificado es la autorización. Si abandona la página a mitad, conserva la sesión y puede entrar con la contraseña antigua; es el mismo comportamiento que deja la verificación de invitación.

### La seguridad del flujo

| Regla | Cómo se aplica |
| --- | --- |
| No revelar si la cuenta existe | Una sola respuesta visible para todos los casos; el detalle va al log del servidor |
| El enlace va al correo registrado | El destinatario es `public.usuarios.email` de la fila encontrada, nunca el correo escrito en el formulario |
| No filtrar el token | El `hashed_token` no aparece en los logs, ni en la URL de la aplicación, ni en el HTML servido |
| No filtrar secretos | `SUPABASE_SECRET_API_KEY` y `SMTP_PASS` solo se leen en el servidor; ninguna página los incluye |
| Un solo uso | GoTrue consume el token al verificarlo |
| Caducidad | El token de GoTrue caduca en una hora |
| No enviar a cuentas no confirmadas o inactivas | Filtro por `email_confirmado` y `estatus` antes de generar el enlace |

## Estructura de archivos

```text
src/
├── lib/
│   ├── email.ts                                  # NUEVO: EMAIL_PATTERN y normalizeEmail()
│   ├── smtp.ts                                   # NUEVO: createSmtpTransport() y SMTP_FROM
│   └── supabase-admin.ts                         # NUEVO (movido): createSupabaseAdminClient()
├── features/
│   ├── auth/
│   │   └── lib/
│   │       ├── rate-limit.ts                      # NUEVO: cooldown por correo y ventana por IP
│   │       ├── recovery.ts                        # NUEVO: parseo, perfil recuperable y token
│   │       └── recovery-email.ts                  # NUEVO: correo de recuperación
│   ├── invitations/
│   │   └── lib/
│   │       ├── email.ts                           # MODIFICADO: usa el transporte de src/lib/smtp.ts
│   │       ├── invitations.ts                     # MODIFICADO: importa el cliente admin y el patrón de src/lib/
│   │       └── supabase-admin.ts                  # ELIMINADO (se mueve a src/lib/)
│   └── users/
│       └── lib/
│           └── users-admin.ts                     # MODIFICADO: importa el cliente admin de src/lib/
└── pages/
    ├── auth/
    │   ├── confirm.astro                          # MODIFICADO: mensaje genérico para invitación y recuperación
    │   ├── login.astro                            # MODIFICADO: el enlace apunta a /auth/forgot-password
    │   ├── forgot-password.astro                        # NUEVO: formulario y estados
    │   └── update-password.astro                  # MODIFICADO: copy de contraseña nueva
    └── api/
        └── auth/
            ├── login.ts                           # (sin cambios)
            ├── logout.ts                          # (sin cambios)
            └── recovery.ts                        # NUEVO: POST (solicitar el enlace)
```

### Contrato de los archivos nuevos y modificados

| Archivo | Responsabilidad |
| --- | --- |
| `src/lib/supabase-admin.ts` | `createSupabaseAdminClient()`: cliente con clave secreta. Lo usan invitaciones, usuarios y recuperación. Sigue siendo server-only. |
| `src/lib/smtp.ts` | `createSmtpTransport()` y `SMTP_FROM`: el transporte de nodemailer y el remisor, compartidos por los dos correos de la aplicación. |
| `src/lib/email.ts` | `EMAIL_PATTERN` y `normalizeEmail()`: la validación y la normalización del correo, usadas por invitaciones y recuperación. |
| `src/features/auth/lib/recovery.ts` | `parseRecoveryInput()` (valida y normaliza), `findRecoverableUser()` (lee `public.usuarios` con clave secreta y filtra por `email_confirmado` y `estatus`) y `generateRecoveryLink()` (llama a `generateLink` con `type: 'recovery'`). |
| `src/features/auth/lib/recovery-email.ts` | `sendRecoveryEmail()`: arma el texto y el HTML del correo, escapa el nombre, el correo y el enlace, y lo envía con el transporte de `src/lib/smtp.ts`. |
| `src/features/auth/lib/rate-limit.ts` | Cooldown por correo y ventana por IP, con el estado en memoria del proceso. |
| `src/pages/api/auth/recovery.ts` | Orquestación: valida, aplica los límites, busca el perfil, genera el enlace, envía el correo y responde con la redirección. |
| `src/pages/auth/forgot-password.astro` | La página con el formulario y los tres estados. |
| `src/pages/auth/login.astro` | El enlace «¿Olvidaste tu contraseña?» pasa de `href="#"` a `href="/auth/forgot-password"`. |
| `src/pages/auth/confirm.astro` | El mensaje de «enlace no válido» se generaliza para que sirva a la invitación y a la recuperación. |
| `src/pages/auth/update-password.astro` | Título y párrafo distintos cuando el flujo es de recuperación (`?motivo=recuperacion`). |

## Plan de implementación

1. Mover `createSupabaseAdminClient()` a `src/lib/supabase-admin.ts` y actualizar los importadores (`features/invitations/lib/invitations.ts` y `features/users/lib/users-admin.ts`). Verificar con `npx tsc --noEmit` y `npm run build`.
2. Extraer el transporte SMTP a `src/lib/smtp.ts` (`createSmtpTransport()`, `SMTP_FROM`) y usarlo en `features/invitations/lib/email.ts`. Verificar con `npx tsc --noEmit` y `npm run build`.
3. Crear `src/lib/email.ts` con `EMAIL_PATTERN` y `normalizeEmail()`, y usarlo en `features/invitations/lib/invitations.ts`. Verificar con `npx tsc --noEmit`.
4. Crear `src/features/auth/lib/rate-limit.ts` con el cooldown por correo y la ventana por IP. Verificar con `npx tsc --noEmit`.
5. Crear `src/features/auth/lib/recovery.ts` con `parseRecoveryInput()`, `findRecoverableUser()` y `generateRecoveryLink()`. Verificar con `npx tsc --noEmit`.
6. Crear `src/features/auth/lib/recovery-email.ts` con `sendRecoveryEmail()`. Verificar con `npx tsc --noEmit` y `npm run build`.
7. Crear `src/pages/api/auth/recovery.ts` con el `POST`. Verificar con `npx tsc --noEmit` y `npm run build`.
8. Crear `src/pages/auth/forgot-password.astro`. Verificar con `npm run build` y `npm run check`.
9. Modificar `src/pages/auth/login.astro` (el enlace) y `src/pages/auth/confirm.astro` (mensaje genérico). Verificar con `npm run build` y `npm run check`.
10. Modificar `src/pages/auth/update-password.astro` con el copy de contraseña nueva. Verificar con `npm run build` y `npm run check`.
11. Actualizar `README.md` (estado del proyecto, rutas, API, estructura) y `AGENTS.md` (árbol de `src/`, reglas de seguridad, lista de specs 01–11).

## Criterios de aceptación

- [x] `npm run build` termina correctamente (solo los avisos no fatales `Invalid empty selector` de daisyUI).
- [x] `npx tsc --noEmit` no reporta errores.
- [x] `npm run check` (`astro check`) no reporta errores en los `.astro`.
- [x] El enlace «¿Olvidaste tu contraseña?» del login apunta a `/auth/forgot-password`.
- [x] `/auth/forgot-password` muestra un campo de correo, un botón «Enviar enlace» y un enlace de vuelta al login.
- [x] La ayuda del campo dice que el enlace se envía al correo escrito y la nota del formulario dice que, sin acceso a ese correo, hay que pedir una cuenta nueva al `admin`.
- [x] Un correo con formato inválido devuelve la página con el mensaje de error y no genera ningún token.
- [x] Con un correo **no registrado**, la respuesta visible es idéntica a la de un correo registrado y no llega ningún correo.
- [x] Con un correo registrado de una cuenta **sin confirmar**, la respuesta visible es idéntica y no llega ningún correo.
- [x] Con un correo registrado de una cuenta **inactiva**, la respuesta visible es idéntica y no llega ningún correo.
- [x] Con un correo registrado de una cuenta confirmada y activa, llega un correo con un enlace que lleva a `/auth/confirm` y contiene `type=recovery`.
- [x] El correo de recuperación llega a `public.usuarios.email` de la cuenta, que es la dirección registrada.
- [x] La aplicación nunca envía un enlace a una dirección distinta de la registrada en la cuenta.
- [x] El correo se envía desde la dirección SMTP de la aplicación y el asunto es «Restablece tu contraseña - Dona de Sangre».
- [x] El correo saluda por el nombre de `public.usuarios.nombre` e indica que el enlace caduca en una hora y solo se usa una vez.
- [x] Al abrir el enlace, se crea la sesión y la persona llega a `/auth/update-password` con el título «Elige tu nueva contraseña».
- [x] Al guardar la contraseña nueva, se puede iniciar sesión con ella y la anterior ya no sirve.
- [x] Un enlace ya usado o caducado lleva a la página de «Enlace no válido» y no permite cambiar la contraseña.
- [x] Una persona sin acceso a su correo registrado recibe el mensaje de la nota del formulario y no encuentra ninguna vía de recuperación en la aplicación.
- [x] Dos peticiones del mismo correo dentro de 60 s generan un solo correo; la segunda respuesta visible es la misma.
- [x] Seis peticiones desde la misma IP dentro de 10 minutos se cortan a partir de la sexta; la respuesta visible es la misma.
- [x] Un fallo del SMTP se registra en el log del servidor y la página muestra «No se pudo enviar el correo…».
- [x] El log del servidor registra los casos descartados (correo inexistente, no confirmado, inactivo, límite alcanzado) **sin** el token de recuperación.
- [x] `GET /api/auth/recovery` devuelve `405` con la cabecera `Allow: POST`.
- [x] La respuesta del `POST` es una redirección a `/auth/forgot-password` con uno de los tres parámetros de estado.
- [x] El HTML servido no contiene `SUPABASE_SECRET_API_KEY`, `SMTP_PASS` ni el `hashed_token` del enlace.
- [x] A 320 px no hay scroll horizontal en `/auth/forgot-password`.
- [x] No hay errores de JavaScript en la consola al abrir y enviar el formulario.
- [x] `README.md` y `AGENTS.md` reflejan la recuperación, la ruta nueva y el árbol final de `src/`.

## Decisiones tomadas y descartadas

- **Sí:** el correo lo envía la propia aplicación con `nodemailer`, y el token se genera con `auth.admin.generateLink({ type: 'recovery' })`. Es el mismo camino que usan las invitaciones (SPEC 09): una sola SMTP, un solo patrón y control completo del texto. `generateLink` no envía nada por sí mismo.
- **No:** `resetPasswordForEmail` de Supabase. Obligaría a configurar el SMTP y las URLs de redirección en el panel de Supabase, a añadir una ruta `/auth/callback` con PKCE y a usar las plantillas y los límites de envío del proveedor. Para un laboratorio con diecisiete personas, es más configuración que problema.
- **Sí:** reutilizar `/auth/confirm` y `/auth/update-password`. Ya verifican el token, crean la sesión y guardan la contraseña con la validación de los ocho caracteres. Escribir páginas nuevas duplicaría ese código y sus casos de error.
- **No:** una página `/auth/reset` nueva con su propio formulario. Tendría que reimplementar la verificación del token, el manejo del enlace caducado y el guardado de la contraseña.
- **Sí:** la respuesta visible es siempre la misma, y solo los fallos de SMTP (que son globales, no dependen de la cuenta) muestran un mensaje de error. El login (SPEC 01) y las invitaciones (SPEC 09) ya usan este patrón de no enumeración.
- **Sí:** el enlace se envía **al correo registrado** de la cuenta y el correo del formulario solo localiza la cuenta. Es la regla que hace segura la recuperación: el enlace llega al buzón que el laboratorio tiene registrado, no a uno que la persona pueda escribir en el formulario.
- **No:** enviar el enlace al correo que la persona escribe, aunque coincida con el registrado, ni permitir un segundo destinatario. Habría dos fuentes de verdad para el correo de la cuenta, que es la clave de `auth.users` y la referencia de `auth.admin` (SPEC 10).
- **No:** cambiar el correo de una cuenta existente como parte de la recuperación. Si la persona ya no tiene acceso a su buzón, el camino previsto es eliminar la cuenta y crear una nueva con otro correo, que es lo que ya ofrece el panel (SPEC 09 y SPEC 10). La página dice ese camino en voz alta en lugar de dejar a la persona esperando un correo que no va a llegar.
- **Sí:** se filtra por `email_confirmado` y por `estatus` antes de generar el enlace. Una cuenta sin confirmar no puede iniciar sesión (su correo nunca se validó) y una inactiva está baneada por el trigger (SPEC 08): en ambos casos el enlace sería inútil.
- **Sí:** límite de frecuencia con cooldown por correo (60 s) y ventana por IP (5 peticiones en 10 min). El formulario es público: sin esto, cualquiera que conozca un correo del laboratorio podría inundar ese buzón. Es el riesgo nuevo que introduce abrir un envío de correo a cualquier visitante.
- **No:** un límite distribuido (tabla en Postgres, Redis). El volumen del laboratorio no lo justifica y obligaría a escribir en base de datos desde una ruta que solo debe leer. La limitación —el estado vive en la instancia— queda documentada.
- **No:** avisar por correo cuando alguien cambia la contraseña. Supabase no está configurado para enviar los correos de seguridad y eso exige otra SMTP y otra plantilla.
- **Sí:** `createSupabaseAdminClient()` pasa a `src/lib/supabase-admin.ts`. Lo usan ya las invitaciones y la gestión de usuarios, y ahora la recuperación: es infra de varias features, no de una.
- **Sí:** el transporte SMTP se extrae a `src/lib/smtp.ts`. Sin la extracción, la recuperación tendría su propio `createTransport` duplicado, con el mismo host, el mismo puerto y el mismo tratamiento de la contraseña de aplicación.
- **Sí:** `EMAIL_PATTERN` y `normalizeEmail()` pasan a `src/lib/email.ts`. Las invitaciones y la recuperación validan el correo igual; duplicar el patrón es una forma de que las dos reglas se separen con el tiempo.
- **No:** cambiar el `next` de `/auth/confirm` con una URL construida a mano por la persona. El destino lo fija la aplicación y `/auth/confirm` lo sanea: es una ruta de redirección, no un parámetro de entrada.
- **Sí:** el enlace del correo lleva `next=/auth/update-password?motivo=recuperacion`. El parámetro solo cambia el copy (título y párrafo) de una página que ya existía; no abre una ruta nueva ni cambia la validación.
- **No:** exigir una contraseña nueva **distinta** de la anterior. GoTrue no lo comprueba y el laboratorio no lo pidió.
- **Sí:** la sesión se crea al verificar el token, antes de fijar la contraseña. Es el comportamiento de la invitación (SPEC 03) y no introduce una diferencia de seguridad: el token verificado es la autorización.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| El formulario se usa para inundar el buzón de una persona | Cooldown de 60 s por correo y límite de 5 peticiones por IP cada 10 min; además, solo se envía a cuentas confirmadas y activas. |
| El límite en memoria no sobrevive a un reinicio ni se comparte entre instancias | Limitación documentada: en Netlify cada función conserva su estado mientras está caliente. El cooldown por correo es la protección que más pesa, porque el daño real (llenar un buzón) depende del correo, no de la IP. |
| El estado del límite crece sin límite (mapa de correos e IPs) | Se purgan las entradas cuyo Timestamp ya está fuera de la ventana en cada consulta; el mapa solo guarda claves recientes. |
| La respuesta idéntica impide saber al usuario si el correo existe | Es el punto: la alternativa es permitir la enumeración de cuentas del laboratorio. El mensaje dice «Si ese correo está registrado…», que es cierto en los dos casos. |
| El enlace de recuperación viaja por el correo y puede quedar en un buzón comprometido | Token de un solo uso y de una hora de caducidad, mismo riesgo y misma mitigación que el enlace de invitación. |
| La persona ya no tiene acceso al buzón registrado y el enlace nunca le llega | La página lo dice de forma explícita y señala el camino que sí funciona: pedir al `admin` que elimine la cuenta y cree una nueva con otro correo. La aplicación no ofrece una vía que no pueda verificar. |
| La sesión queda abierta antes de que la persona fije la contraseña nueva | Es el comportamiento heredado de la invitación. Si la sesión se cierra sin cambiar la contraseña, la cuenta sigue entrando con la contraseña antigua. |
| `generateLink` con `type: 'recovery'` falla para una cuenta no confirmada o inexistente | Es el caso que ya se filtra antes de generar el enlace; el fallo se registra y la respuesta es la genérica. La verificación incluye probar con una cuenta sin confirmar. |
| El correo llega pero la persona no lo ve (filtro de spam) | El mismo riesgo que las invitaciones, con el mismo remitente ya aceptado por el laboratorio. |
| El `next` del enlace se manipula para redirigir a otra página | `/auth/confirm` lo sanea: solo acepta rutas internas que empiezan por `/` y no por `//` ni `/\`. |

## Qué **no** entra en este spec

- Registro público de cuentas.
- Recuperación por SMS, WhatsApp u otro canal.
- Recuperación para cuentas sin confirmar el correo o con estatus `inactivo`.
- Aviso por correo cuando se cambia la contraseña.
- Caducidad configurable del enlace y plantillas de correo editables desde la aplicación.
- Límite de frecuencia distribuido.
- Cambio de contraseña voluntario desde la cuenta ya iniciada (con o sin enlace).
- Recuperación en dos pasos (código por correo + contraseña).
- Migraciones, cambios en RLS, en el middleware o en las variables de entorno.
- Cambiar el correo de una cuenta existente o enviar el enlace a un destinatario distinto del registrado.

## Verificación

> Verificado el 2026-11-16/17 con `npm run build`, `npx tsc --noEmit`, `npm run check`, dos servidores de desarrollo (`npx astro dev --port 4322/4323/4324`, uno de ellos con `SMTP_*` apuntando a un servidor SMTP local de captura) y Playwright. El envío real de correo se hizo contra ese SMTP local (sin salir a Internet) con la cuenta ficticia `alvaro.herrera@example.com`, de modo que el flujo generó y consumió tokens reales.

| Criterio | Estado | Evidencia | Notas |
| --- | --- | --- | --- |
| `npm run build` termina correctamente | ✅ | «Complete!» en 14,45 s | Solo los 2 avisos no fatales `Invalid empty selector` de daisyUI |
| `npx tsc --noEmit` no reporta errores | ✅ | Sin salida | — |
| `npm run check` no reporta errores | ✅ | `Result (48 files): 0 errors, 0 warnings, 0 hints` | — |
| El enlace del login lleva a `/auth/forgot-password` | ✅ | HTML servido: `href="/auth/forgot-password"` junto a «¿Olvidaste tu contraseña?» | — |
| La página muestra el formulario y los tres estados | ✅ | Playwright: campo «Correo», botón «Enviar enlace», enlace «Volver a iniciar sesión», ayuda y nota; `?estado=enviado` → `alert-success`, `?error=email_invalido` y `?error=envio_fallido` → `alert-error` | El botón pasa a «Enviando…» y se deshabilita al enviar |
| Un correo inválido no genera token y muestra el error | ✅ | `POST email=no-valido` (y `email=` vacío) → `303 /auth/forgot-password?error=email_invalido` | La ruta responde antes de `consumeIpSlot` y de `generateLink` |
| La respuesta no revela si la cuenta existe | ✅ | No registrado, sin confirmar, inactivo y registrado activo → los cuatro `303 /auth/forgot-password?estado=enviado` | Solo el fallo de SMTP cambia la respuesta visible |
| Sin correo para cuentas inexistentes, sin confirmar o inactivas | ✅ | Sin `.eml` capturado; log `descartado (not_found)`, `(unconfirmed)` e `(inactive)` | Probado con `nadie@example.com`, `andres.fuentes@example.com` y `david.romero@example.com` |
| El correo llega al correo registrado de la cuenta | ✅ | `To: alvaro.herrera@example.com` en `mail-2.eml` y `mail-3.eml` | El destinatario es la fila de `public.usuarios`, no otro valor del formulario |
| El correo se envía desde el SMTP de la aplicación con el asunto correcto | ✅ | `From: Dona de Sangre <…>` y asunto `Restablece tu contraseña - Dona de Sangre` | `SMTP_FROM` de `src/lib/smtp.ts` |
| El correo saluda por el nombre e indica caducidad y un solo uso | ✅ | «Hola, Álvaro Herrera Díaz», «El enlace caduca en 1 hora y solo puede usarse una vez» | Texto y HTML (con el nombre, el correo y el enlace escapados) |
| El correo llega con el enlace de un solo uso | ✅ | Enlace con `token_hash`, `type=recovery` y `next=%2Fauth%2Fupdate-password%3Fmotivo%3Drecuperacion` | — |
| El enlace crea la sesión y permite fijar la contraseña nueva | ✅ | Playwright: el enlace redirige a `/auth/update-password?motivo=recuperacion`, título «Elige tu nueva contraseña», guardar → `303 /dashboard` | — |
| La contraseña antigua deja de servir | ✅ | Antes del cambio se fijó `ViejaSegura123!` por la API admin; tras el flujo, `ViejaSegura123!` → `?error=invalid_credentials` y `NuevaSegura456!` → `/dashboard` | — |
| El enlace no se puede reutilizar | ✅ | Segunda visita al mismo enlace → «Enlace no válido» (200) y `/dashboard` redirige a `/auth/login?next=%2Fdashboard` | Un cambio de contraseña previo también invalida el token (mismo resultado) |
| Los límites de frecuencia cortan las peticiones repetidas | ✅ | Mismo correo dos veces seguidas: un solo `.eml`, mismo `303`, log `cooldown por correo activo`; 5 peticiones por IP pasan y la 6.ª se corta con log `límite por IP alcanzado` | Mismo mensaje visible en todos los casos |
| El fallo de SMTP se registra y se muestra | ✅ | Dev server con `SMTP_PORT=2599` (puerto cerrado) → `303 /auth/forgot-password?error=envio_fallido`; log `[auth/recovery] fallo SMTP: Error: connect ECONNREFUSED 127.0.0.1:2599` | — |
| El log registra los descartes sin el token | ✅ | `grep` del `token_hash` y del token en el log de la instancia: 0 coincidencias | Solo el motivo y el correo |
| `GET /api/auth/recovery` responde `405` con `Allow: POST` | ✅ | `405 Method Not Allowed` + `allow: POST` | — |
| La respuesta del `POST` es una redirección con uno de los tres estados | ✅ | Todos los casos probados responden `303` a `/auth/forgot-password` | — |
| El HTML servido no incluye secretos | ✅ | `/auth/forgot-password` y `dist/` sin `sb_secret_`, `SMTP_PASS`, `hashed_token` ni el token de la prueba | — |
| Sin errores de JavaScript en consola al abrir y enviar | ✅ | Playwright: 0 errores al cargar y al enviar el formulario | — |
| Sin scroll horizontal a 320 px | ✅ | Playwright a 320 px: `scrollWidth === clientWidth === 320`, párrafo de ayuda con `white-space: normal`, `display: block` y 3 líneas; `consoleErrors: 0` | Resuelto por SPEC 12 (quitar `class="label"` → `class="text-sm opacity-70"`); ver «Hallazgos» |
| `README.md` y `AGENTS.md` al día | ✅ | README: `/auth/forgot-password`, `POST /api/auth/recovery`, `src/lib/{email,smtp,supabase-admin}.ts` y `features/auth/lib/*`; AGENTS.md: mismas rutas y reglas de seguridad | — |

### Hallazgos

1. **Scroll horizontal a 320 px (resuelto por SPEC 12).** La ayuda del campo usaba `<p class="label">` (`src/pages/auth/forgot-password.astro`, línea 45). En daisyUI 5 `.label` aplica `display: flex` + `white-space: nowrap`, así que la frase larga no se envolvía y ensanchaba el documento hasta 583 px (el resto de pantallas de acceso se quedan en 320 px). SPEC 12 sustituyó `class="label"` por `class="text-sm opacity-70"`. En la reverificación con Playwright a 320 px: `scrollWidth === clientWidth === 320`, párrafo con `white-space: normal` y `display: block` partido en 3 líneas, `consoleErrors: 0`. El criterio de aceptación correspondiente queda marcado como verificado.
2. **Efecto de la prueba.** `alvaro.herrera@example.com` (cuenta ficticia del seed) quedó con la contraseña `NuevaSegura456!`. El enlace de recuperación consumido y los tokens emitidos ya no valen.
