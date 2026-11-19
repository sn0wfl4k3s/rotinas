#!/usr/bin/env node
/**
 * Gera credentials/token.json para o canal escolhido no fluxo OAuth.
 *
 * Uso:
 *   1. Baixar o JSON do OAuth client (Desktop app) do Google Cloud.
 *   2. Salvar como postar-no-RdS/credentials/client_secret.json
 *   3. Rodar: cd postar-no-RdS && bun scripts/autenticar.js
 *   4. No navegador, escolher a CONTA Google e o CANAL RdS quando perguntado.
 *
 * Saída: postar-no-RdS/credentials/token.json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { authenticate } from "@google-cloud/local-auth";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CRED_DIR = process.env.YOUTUBE_CREDENTIALS_DIR || path.join(__dirname, "..", "credentials");
const CLIENT_SECRET = path.join(CRED_DIR, "client_secret.json");
const TOKEN = path.join(CRED_DIR, "token.json");

if (!fs.existsSync(CLIENT_SECRET)) {
  console.error(`ERRO: ${CLIENT_SECRET} não existe. Baixe o JSON do OAuth client primeiro.`);
  process.exit(2);
}

const cliente = await authenticate({
  keyfilePath: CLIENT_SECRET,
  scopes: [
    "https://www.googleapis.com/auth/youtube.upload",
    "https://www.googleapis.com/auth/youtube",
  ],
});

fs.mkdirSync(CRED_DIR, { recursive: true });
fs.writeFileSync(TOKEN, JSON.stringify(cliente.credentials, null, 2));
console.log(`Token salvo em ${TOKEN}`);
console.log("Confirm no YouTube Studio que o vídeo de teste foi para o canal RdS.");
