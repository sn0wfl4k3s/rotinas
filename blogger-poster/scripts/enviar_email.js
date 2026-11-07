import nodemailer from "nodemailer";

export const SMTP_HOST = "smtp.gmail.com";
export const SMTP_PORT = 587;

function credenciais() {
  const user = process.env.EMAIL_USER;
  const pass = process.env.APP_PASSWORD;
  if (!user || !pass) throw new Error("EMAIL_USER e APP_PASSWORD são obrigatórios");
  return { user, pass };
}

export function opcoesTransporte() {
  const { user, pass } = credenciais();
  return {
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: false,
    requireTLS: true,
    // mesmo timeout=30 do smtplib; sem isso o default do nodemailer passa do timeout do job
    connectionTimeout: 30_000,
    socketTimeout: 30_000,
    auth: { user, pass },
  };
}

export async function sendEmail(to, subject, html, { transport } = {}) {
  const { user } = credenciais();
  const envio = transport ?? nodemailer.createTransport(opcoesTransporte());
  await envio.sendMail({ from: user, to, subject, html });
}

async function main(argv) {
  if (argv.length !== 3) {
    console.error("uso: enviar_email.js <destinatario> <assunto> <corpo_html>");
    process.exitCode = 2;
    return;
  }
  try {
    await sendEmail(argv[0], argv[1], argv[2]);
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}

if (process.argv[1]?.endsWith("enviar_email.js")) {
  await main(process.argv.slice(2));
}
