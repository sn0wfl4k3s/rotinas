#!/usr/bin/env node
/**
 * Upload de um vídeo (Short) para o YouTube via Data API v3 (resumível).
 * Requer que youtube_auth.js já tenha gerado o token.json.
 *
 * Uso:
 *   node yt_upload.js --file video.mp4 --title "Meu Short #Shorts" \
 *       --description "..." --tags "tag1,tag2" --privacy unlisted
 *   node yt_upload.js --file video.mp4 --meta-json meta.json --privacy unlisted
 *
 * Notas:
 * - Vídeo 9:16 curto vira Short automaticamente; #Shorts no título ajuda.
 * - Projeto de API não verificado -> vídeo FORÇADO a 'private' mesmo pedindo 'public'.
 * - Cada upload custa ~1600 de quota (limite padrão ~6/dia).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { google } from "googleapis";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CRED_DIR = path.join(__dirname, "..", "credentials");
const CLIENT_SECRET = path.join(CRED_DIR, "client_secret.json");
const TOKEN = path.join(CRED_DIR, "token.json");

const { values: a } = parseArgs({
  options: {
    file: { type: "string" },
    title: { type: "string", default: "" },
    description: { type: "string", default: "" },
    tags: { type: "string", default: "" },
    "meta-json": { type: "string", default: "" },
    privacy: { type: "string", default: "unlisted" },
    category: { type: "string", default: "22" }, // 22 People&Blogs, 27 Education, 28 Sci&Tech
    "made-for-kids": { type: "boolean", default: false },
  },
});

if (!a.file || !fs.existsSync(a.file)) {
  console.error(`ERRO: arquivo não encontrado: ${a.file}`);
  process.exit(2);
}
if (!["private", "unlisted", "public"].includes(a.privacy)) {
  console.error(`ERRO: --privacy inválido: ${a.privacy}`);
  process.exit(2);
}
if (!fs.existsSync(TOKEN)) {
  console.error(`ERRO: ${TOKEN} não existe. Rode youtube_auth.js primeiro.`);
  process.exit(2);
}

// Monta metadados
let title = a.title;
let description = a.description;
let tags = [];
if (a["meta-json"]) {
  const m = JSON.parse(fs.readFileSync(a["meta-json"], "utf-8"));
  title = title || m.title || "";
  description = description || m.description || "";
  tags = m.tags || [];
}
if (a.tags) tags = a.tags.split(",").map((t) => t.trim()).filter(Boolean);
if (!title) title = path.basename(a.file, path.extname(a.file));
if (!`${title}${description}`.toLowerCase().includes("#shorts")) {
  title = `${title.trimEnd()} #Shorts`.slice(0, 100);
}

// Auth
const keys = JSON.parse(fs.readFileSync(CLIENT_SECRET, "utf-8")).installed
  || JSON.parse(fs.readFileSync(CLIENT_SECRET, "utf-8")).web;
const oauth2 = new google.auth.OAuth2(keys.client_id, keys.client_secret, keys.redirect_uris?.[0]);
oauth2.setCredentials(JSON.parse(fs.readFileSync(TOKEN, "utf-8")));
// persiste refresh de token quando ocorrer
oauth2.on("tokens", (t) => {
  const cur = JSON.parse(fs.readFileSync(TOKEN, "utf-8"));
  fs.writeFileSync(TOKEN, JSON.stringify({ ...cur, ...t }, null, 2));
});

const youtube = google.youtube({ version: "v3", auth: oauth2 });

console.error(`[yt] enviando '${title}' (${a.privacy})...`);
const fileSize = fs.statSync(a.file).size;
let res;
try {
  res = await youtube.videos.insert(
    {
      part: ["snippet", "status"],
      requestBody: {
        snippet: {
          title: title.slice(0, 100),
          description: description.slice(0, 5000),
          tags,
          categoryId: a.category,
        },
        status: {
          privacyStatus: a.privacy,
          selfDeclaredMadeForKids: a["made-for-kids"],
        },
      },
      media: { body: fs.createReadStream(a.file) },
    },
    {
      onUploadProgress: (e) => {
        const pct = Math.round((e.bytesRead / fileSize) * 100);
        process.stderr.write(`\r[yt] ${pct}%   `);
      },
    }
  );
} catch (e) {
  console.error(`\nERRO no upload: ${e?.message || e}`);
  process.exit(3);
}
process.stderr.write("\n");

const vid = res.data.id;
let privacy = a.privacy;

// Fallback: YouTube pode rebaixar a privacidade no upload; força de novo.
if (a.privacy === "public" && res.data.status?.privacyStatus !== "public") {
  try {
    await youtube.videos.update({
      part: ["status"],
      requestBody: { id: vid, status: { privacyStatus: "public", selfDeclaredMadeForKids: false } },
    });
    const check = await youtube.videos.list({ part: "status", id: vid });
    privacy = check.data.items?.[0]?.status?.privacyStatus || privacy;
  } catch (e) {
    console.error(`aviso: falha ao forçar public: ${e?.message || e}`);
  }
}

console.log(JSON.stringify({
  video_id: vid,
  url: `https://youtube.com/shorts/${vid}`,
  title,
  privacy,
}));
