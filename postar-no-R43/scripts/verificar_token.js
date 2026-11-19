#!/usr/bin/env node
/** Valida o token OAuth e confirma que ele aponta para o canal esperado. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { google } from "googleapis";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CRED_DIR = process.env.YOUTUBE_CREDENTIALS_DIR || path.join(__dirname, "..", "credentials");
const CLIENT_SECRET = path.join(CRED_DIR, "client_secret.json");
const TOKEN = path.join(CRED_DIR, "token.json");

export function normalizarTitulo(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function conferirCanal(canais, esperado) {
  const alvo = normalizarTitulo(esperado);
  return (canais || []).find((c) => normalizarTitulo(c?.snippet?.title) === alvo) || null;
}

function descrever(canais) {
  return (canais || []).map((c) => `${c?.snippet?.title || "(sem titulo)"} (${c?.id || "?"})`).join(", ") || "nenhum";
}

async function main() {
  if (!fs.existsSync(CLIENT_SECRET) || !fs.existsSync(TOKEN)) {
    throw new Error(`Credenciais ausentes em ${CRED_DIR}`);
  }
  const bruto = JSON.parse(fs.readFileSync(CLIENT_SECRET, "utf-8"));
  const keys = bruto.installed || bruto.web;
  const oauth2 = new google.auth.OAuth2(keys.client_id, keys.client_secret, keys.redirect_uris?.[0]);
  oauth2.setCredentials(JSON.parse(fs.readFileSync(TOKEN, "utf-8")));
  const youtube = google.youtube({ version: "v3", auth: oauth2 });

  const resp = await youtube.channels.list({ part: "snippet", mine: true });
  const canais = resp.data.items || [];
  if (!canais.length) throw new Error("Token sem canais associados");

  const esperado = process.env.CANAL_ESPERADO;
  if (!esperado) throw new Error("CANAL_ESPERADO não definido");
  const canal = conferirCanal(canais, esperado);
  if (!canal) throw new Error(`Token aponta para ${descrever(canais)}; esperado: ${esperado}`);
  console.log(`Canal OK: ${canal.snippet.title} (${canal.id})`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(`ERRO: ${e.message}`);
    process.exit(3);
  });
}
