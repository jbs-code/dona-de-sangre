import type { APIContext, APIRoute } from 'astro';
import {
  consumeIpSlot,
  isEmailCoolingDown,
  markEmailSent
} from '../../../features/auth/lib/rate-limit';
import {
  findRecoverableUser,
  generateRecoveryLink,
  parseRecoveryInput
} from '../../../features/auth/lib/recovery';
import { sendRecoveryEmail } from '../../../features/auth/lib/recovery-email';

const RECOVERY_PATH = '/auth/forgot-password';
const SENT_URL = `${RECOVERY_PATH}?estado=enviado`;
const INVALID_EMAIL_URL = `${RECOVERY_PATH}?error=email_invalido`;
const SEND_FAILED_URL = `${RECOVERY_PATH}?error=envio_fallido`;

// `clientAddress` puede no existir en un adaptador sin IP; un valor único
// compartido degrada el límite, pero nunca deja la ruta sin protección.
function resolveClientAddress(context: APIContext): string {
  try {
    return context.clientAddress;
  } catch {
    return 'desconocida';
  }
}

export const POST: APIRoute = async (context) => {
  const { request, redirect } = context;

  const formData = await request.formData().catch(() => null);
  const parsed = parseRecoveryInput({ email: formData?.get('email') });
  if (!parsed.ok) {
    return redirect(INVALID_EMAIL_URL, 303);
  }

  const { email } = parsed.input;

  // Los límites responden igual que un envío correcto: no pueden revelar si la
  // cuenta existe. El detalle queda en el log del servidor.
  if (!consumeIpSlot(resolveClientAddress(context))) {
    console.warn('[auth/recovery] límite por IP alcanzado:', email);
    return redirect(SENT_URL, 303);
  }

  if (isEmailCoolingDown(email)) {
    console.warn('[auth/recovery] cooldown por correo activo:', email);
    return redirect(SENT_URL, 303);
  }

  const lookup = await findRecoverableUser(email);
  if (!lookup.ok) {
    console.info(`[auth/recovery] descartado (${lookup.reason}):`, email, lookup.error);
    return redirect(SENT_URL, 303);
  }

  const link = await generateRecoveryLink(lookup.user.email);
  if (!link.ok) {
    console.error('[auth/recovery] no se pudo generar el enlace:', link.error);
    return redirect(SENT_URL, 303);
  }

  // El destinatario es el correo registrado de la cuenta, nunca otro.
  try {
    await sendRecoveryEmail({
      origin: new URL(request.url).origin,
      email: lookup.user.email,
      nombre: lookup.user.nombre,
      tokenHash: link.tokenHash
    });
  } catch (smtpError) {
    // Un fallo de SMTP es global: no depende de que la cuenta exista.
    console.error('[auth/recovery] fallo SMTP:', smtpError);
    return redirect(SEND_FAILED_URL, 303);
  }

  markEmailSent(email);
  return redirect(SENT_URL, 303);
};

export const GET: APIRoute = () =>
  new Response(null, { status: 405, headers: { Allow: 'POST' } });
