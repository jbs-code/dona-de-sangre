import type { APIRoute } from 'astro';
import { sendInviteEmail } from '../../features/invitations/lib/email';
import { createSupabaseAdminClient } from '../../features/invitations/lib/supabase-admin';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GENERIC_INVITE_ERROR = 'No se pudo generar la invitación.';

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

export const POST: APIRoute = async ({ request, locals }) => {
  // La sesión viene de getClaims() ejecutado en el middleware.
  if (!locals.claims) {
    return json(401, { error: 'No autorizado.' });
  }

  const body = await request.json().catch(() => null);
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!EMAIL_PATTERN.test(email)) {
    return json(400, { error: 'Correo electrónico no válido.' });
  }

  // RLS permite leer la propia fila; el guard es el rol del solicitante.
  const { data: usuario } = await locals.supabase
    .from('usuarios')
    .select('rol')
    .eq('id', locals.claims.sub)
    .maybeSingle();

  if (usuario?.rol !== 'admin') {
    return json(403, { error: 'Se requiere rol de administrador.' });
  }

  const admin = createSupabaseAdminClient();
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: 'invite',
    email
  });

  if (linkError || !link?.properties.hashed_token) {
    if (linkError?.code === 'email_exists') {
      // Mensaje genérico: no se filtra el detalle de Supabase
      return json(409, { error: GENERIC_INVITE_ERROR });
    }
    console.error('[invitations] generateLink falló:', linkError?.message ?? linkError);
    return json(500, { error: GENERIC_INVITE_ERROR });
  }

  try {
    await sendInviteEmail({
      origin: new URL(request.url).origin,
      email,
      tokenHash: link.properties.hashed_token
    });
  } catch (smtpError) {
    // El usuario queda pendiente: el admin puede re-invitar el mismo correo
    console.error('[invitations] fallo SMTP:', smtpError);
    return json(500, { error: 'No se pudo enviar la invitación.' });
  }

  return json(200, { ok: true });
};

export const GET: APIRoute = () =>
  new Response(null, { status: 405, headers: { Allow: 'POST' } });
