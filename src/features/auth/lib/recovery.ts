import { EMAIL_PATTERN, normalizeEmail } from '../../../lib/email';
import { createSupabaseAdminClient } from '../../../lib/supabase-admin';

const INVALID_EMAIL_ERROR = 'Introduce un correo electrónico válido.';

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

export type FindRecoverableUserResult =
  | { ok: true; user: RecoverableUser }
  | { ok: false; reason: 'not_found' | 'unconfirmed' | 'inactive' | 'failed'; error: string };

export type GenerateRecoveryLinkResult =
  | { ok: true; tokenHash: string }
  | { ok: false; error: string };

/** Valida y normaliza el correo del formulario de recuperación. */
export function parseRecoveryInput(body: unknown): ParseRecoveryResult {
  const payload = (body ?? {}) as Record<string, unknown>;
  const email = normalizeEmail(payload.email);

  if (!EMAIL_PATTERN.test(email)) {
    return { ok: false, error: INVALID_EMAIL_ERROR };
  }

  return { ok: true, input: { email } };
}

/**
 * Busca la cuenta por correo y solo la devuelve si puede recuperarse: correo
 * confirmado y estatus activo. El correo buscado es el que escribe la persona;
 * el que se usa para enviar el enlace es el de la fila encontrada.
 */
export async function findRecoverableUser(email: string): Promise<FindRecoverableUserResult> {
  const admin = createSupabaseAdminClient();

  const { data, error } = await admin
    .from('usuarios')
    .select('id, nombre, email, estatus, email_confirmado')
    .eq('email', email)
    .maybeSingle();

  if (error) {
    return { ok: false, reason: 'failed', error: error.message };
  }
  if (!data) {
    return { ok: false, reason: 'not_found', error: 'La cuenta no existe.' };
  }
  if (!data.email_confirmado) {
    return { ok: false, reason: 'unconfirmed', error: 'La cuenta no confirmó su correo.' };
  }
  if (data.estatus === 'inactivo') {
    return { ok: false, reason: 'inactive', error: 'La cuenta está desactivada.' };
  }

  return { ok: true, user: { id: data.id, nombre: data.nombre, email: data.email } };
}

/**
 * Genera el token de recuperación con GoTrue. `generateLink` no envía nada:
 * el correo lo manda la aplicación con el enlace que se arma después.
 */
export async function generateRecoveryLink(email: string): Promise<GenerateRecoveryLinkResult> {
  const admin = createSupabaseAdminClient();

  const { data, error } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email
  });

  if (error || !data?.properties.hashed_token) {
    return { ok: false, error: error?.message ?? 'No se pudo generar el enlace de recuperación.' };
  }

  return { ok: true, tokenHash: data.properties.hashed_token };
}
