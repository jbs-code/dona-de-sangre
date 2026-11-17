import { createSmtpTransport, SMTP_FROM } from '../../../lib/smtp';

const CONFIRM_PATH = '/auth/confirm';
const UPDATE_PASSWORD_PATH = '/auth/update-password?motivo=recuperacion';
const EXPIRY_NOTICE = '1 hora';

interface RecoveryEmailInput {
  /** Origen de la petición (protocolo + host) para construir el enlace. */
  origin: string;
  /** Correo registrado de la cuenta: el único destinatario posible. */
  email: string;
  nombre: string;
  tokenHash: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function buildRecoveryUrl({ origin, tokenHash }: RecoveryEmailInput): URL {
  const url = new URL(CONFIRM_PATH, origin);
  url.searchParams.set('token_hash', tokenHash);
  url.searchParams.set('type', 'recovery');
  url.searchParams.set('next', UPDATE_PASSWORD_PATH);
  return url;
}

function renderText({ nombre, email, url }: { nombre: string; email: string; url: URL }): string {
  return [
    `Hola, ${nombre},`,
    '',
    `Recibimos una solicitud para restablecer la contraseña de tu cuenta en Dona de Sangre (${email}).`,
    '',
    'Elige una contraseña nueva con este enlace:',
    url.toString(),
    '',
    `El enlace caduca en ${EXPIRY_NOTICE} y solo puede usarse una vez.`,
    'Si no has solicitado este cambio, ignora este correo: tu contraseña actual sigue siendo válida.'
  ].join('\n');
}

function renderHtml({ nombre, email, url }: { nombre: string; email: string; url: URL }): string {
  const safeNombre = escapeHtml(nombre);
  const safeEmail = escapeHtml(email);
  const safeUrl = escapeHtml(url.toString());

  return [
    `<p>Hola, ${safeNombre},</p>`,
    `<p>Recibimos una solicitud para restablecer la contraseña de tu cuenta en Dona de Sangre (<strong>${safeEmail}</strong>).</p>`,
    `<p><a href="${safeUrl}">Elegir contraseña nueva</a></p>`,
    `<p>El enlace caduca en ${EXPIRY_NOTICE} y solo puede usarse una vez.</p>`,
    '<p>Si no has solicitado este cambio, ignora este correo: tu contraseña actual sigue siendo válida.</p>'
  ].join('\n');
}

export async function sendRecoveryEmail(input: RecoveryEmailInput): Promise<void> {
  const url = buildRecoveryUrl(input);
  const transport = createSmtpTransport();

  await transport.sendMail({
    from: SMTP_FROM,
    to: input.email,
    subject: 'Restablece tu contraseña - Dona de Sangre',
    text: renderText({ nombre: input.nombre, email: input.email, url }),
    html: renderHtml({ nombre: input.nombre, email: input.email, url })
  });
}
