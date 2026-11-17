import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { SMTP_HOST, SMTP_PASS, SMTP_PORT, SMTP_USER } from 'astro:env/server';

// Remitente único de los correos de la aplicación.
export const SMTP_FROM = `"Dona de Sangre" <${SMTP_USER}>`;

// Transporte Gmail por TLS directo (465). Google ignora los espacios de la
// contraseña de aplicación, así que se limpian antes de enviarla.
export function createSmtpTransport(): Transporter {
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS.replaceAll(' ', '')
    }
  });
}
