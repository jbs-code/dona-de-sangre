// Límite de frecuencia en memoria del proceso: una protección de esfuerzo,
// no un muro. En Netlify cada instancia conserva su propio estado.

const EMAIL_COOLDOWN_MS = 60_000;
const IP_WINDOW_MS = 10 * 60_000;
const IP_MAX_REQUESTS = 5;

type RateLimitState = {
  // Último envío por correo (mapa correo → marca de tiempo).
  lastSentByEmail: Map<string, number>;
  // Peticiones por IP dentro de la ventana (mapa IP → marcas de tiempo).
  requestsByIp: Map<string, number[]>;
};

const state: RateLimitState = {
  lastSentByEmail: new Map(),
  requestsByIp: new Map()
};

// Deja en los mapas solo las marcas que aún cuentan para su ventana.
function purgeExpired(now: number): void {
  for (const [email, sentAt] of state.lastSentByEmail) {
    if (now - sentAt >= EMAIL_COOLDOWN_MS) {
      state.lastSentByEmail.delete(email);
    }
  }

  for (const [ip, timestamps] of state.requestsByIp) {
    const recent = timestamps.filter((sentAt) => now - sentAt < IP_WINDOW_MS);
    if (recent.length === 0) {
      state.requestsByIp.delete(ip);
    } else {
      state.requestsByIp.set(ip, recent);
    }
  }
}

/** Registra la petición de esa IP y dice si todavía entra en la ventana. */
export function consumeIpSlot(ip: string): boolean {
  const now = Date.now();
  purgeExpired(now);

  const timestamps = state.requestsByIp.get(ip) ?? [];
  if (timestamps.length >= IP_MAX_REQUESTS) {
    return false;
  }

  timestamps.push(now);
  state.requestsByIp.set(ip, timestamps);
  return true;
}

/** true si ese correo recibió un envío hace menos del cooldown. */
export function isEmailCoolingDown(email: string): boolean {
  const now = Date.now();
  purgeExpired(now);

  const sentAt = state.lastSentByEmail.get(email);
  return sentAt !== undefined && now - sentAt < EMAIL_COOLDOWN_MS;
}

/** Marca el envío para arrancar el cooldown de ese correo. */
export function markEmailSent(email: string): void {
  state.lastSentByEmail.set(email, Date.now());
}
