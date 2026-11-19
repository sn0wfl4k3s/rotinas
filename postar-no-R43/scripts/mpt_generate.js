#!/usr/bin/env node
/**
 * Gera um Short (9:16) no MoneyPrinterTurbo via API e espera ficar pronto.
 * Só usa APIs nativas do Node (fetch, fs). Sem dependências.
 *
 * Saída (stdout): JSON {task_id, subject, files:[caminhos .mp4 no host]}.
 *
 * Ex.: node mpt_generate.js --subject "3 curiosidades sobre o oceano"
 *      node mpt_generate.js --subject "dicas de foco" --voice pt-BR-AntonioNeural \
 *           --clip-duration 3 --out-dir ~/shorts_prontos
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { parseArgs } from "node:util";
import { execFileSync } from "node:child_process";

const HOME = os.homedir();
const MPT_API = process.env.MPT_API || "http://127.0.0.1:8080";
const MPT_HOME = process.env.MPT_HOME || path.join(HOME, "MoneyPrinterTurbo");

const { values: a } = parseArgs({
  options: {
    subject: { type: "string" },
    script: { type: "string", default: "" },
    terms: { type: "string", default: "" },
    aspect: { type: "string", default: "9:16" },
    voice: { type: "string", default: "pt-BR-AntonioNeural" },
    "clip-duration": { type: "string", default: "3" },
    count: { type: "string", default: "1" },
    language: { type: "string", default: "pt" },
    "no-subtitle": { type: "boolean", default: false },
    "square-subtitle": { type: "boolean", default: false }, // cantos retos; default = arredondado
    api: { type: "string", default: MPT_API },
    "mpt-home": { type: "string", default: MPT_HOME },
    "out-dir": { type: "string", default: "" },
    container: { type: "string", default: "moneyprinterturbo-api" },
    timeout: { type: "string", default: "1800" },
    poll: { type: "string", default: "10" },
  },
});

if (!a.subject) {
  console.error("ERRO: --subject é obrigatório");
  process.exit(2);
}

// Proactive cleanup of cache and orphan temp files before starting
try {
  execFileSync("docker", ["exec", a.container, "sh", "-c", "rm -rf /MoneyPrinterTurbo/storage/cache_videos/* && rm -rf /MoneyPrinterTurbo/storage/tasks/temp-clip-* || true"], { stdio: "ignore", timeout: 60000 });
  console.error("[limpeza] cache_videos e temporários órfãos limpos antes da execução.");
} catch (e) {
  console.error(`[limpeza] aviso: falha ao limpar cache/temporários: ${e.message}`);
}

const expand = (p) => (p && p.startsWith("~") ? path.join(HOME, p.slice(1)) : p);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const payload = {
  video_subject: a.subject,
  video_aspect: a.aspect,
  video_clip_duration: Number(a["clip-duration"]),
  video_count: Number(a.count),
  voice_name: a.voice,
  video_language: a.language,
  video_source: "pexels",
  subtitle_enabled: !a["no-subtitle"],
  rounded_subtitle_background: !a["square-subtitle"],
  subtitle_background_enabled: true,
  text_background_color: "#000000",
};
if (a.script) payload.video_script = a.script;
if (a.terms) payload.video_terms = a.terms;

let resp;
try {
  const r = await fetch(`${a.api}/api/v1/videos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    console.error(`ERRO ao criar tarefa: HTTP ${r.status} ${await r.text()}`);
    process.exit(2);
  }
  resp = await r.json();
} catch (e) {
  console.error(`ERRO: não consegui falar com a API em ${a.api}. Container no ar? (${e})`);
  process.exit(2);
}

const taskId = resp?.data?.task_id;
if (!taskId) {
  console.error(`ERRO: resposta inesperada: ${JSON.stringify(resp)}`);
  process.exit(2);
}
console.error(`[mpt] tarefa criada: ${taskId}`);

const deadline = Date.now() + Number(a.timeout) * 1000;
const pollMs = Number(a.poll) * 1000;
let lastProgress = -1;
let done = false;
while (Date.now() < deadline) {
  let t;
  try {
    const r = await fetch(`${a.api}/api/v1/tasks/${taskId}`);
    t = await r.json();
  } catch (e) {
    console.error(`[mpt] polling falhou (${e}), tentando de novo...`);
    await sleep(pollMs);
    continue;
  }
  const d = t?.data || {};
  if (d.progress !== lastProgress) {
    console.error(`[mpt] estado=${d.state} progresso=${d.progress}%`);
    lastProgress = d.progress;
  }
  if (d.state === 1) { done = true; break; }   // COMPLETE
  if (d.state === -1) {                          // FAILED
    console.error("ERRO: a geração falhou. Veja: docker compose logs webui");
    process.exit(3);
  }
  await sleep(pollMs);
}
if (!done) {
  console.error("ERRO: timeout esperando o vídeo ficar pronto.");
  process.exit(4);
}

const taskDir = path.join(expand(a["mpt-home"]), "storage", "tasks", taskId);

// Limpeza imediata de arquivos temporários da tarefa (temp-clip-*.mp4) logo após conclusão
try {
  execFileSync("docker", [
    "exec", a.container, "sh", "-c",
    `rm -f /MoneyPrinterTurbo/storage/tasks/${taskId}/temp-clip-*.mp4 /MoneyPrinterTurbo/storage/tasks/${taskId}/*TEMP_MPY*.mp4 || true`
  ], { stdio: "ignore", timeout: 30000 });
  console.error(`[limpeza] arquivos temporários da tarefa ${taskId} removidos.`);
} catch (e) {
  console.error(`[limpeza] aviso: falha ao limpar temp-clips da tarefa ${taskId}: ${e.message}`);
}

let files;
try {
  files = fs.readdirSync(taskDir)
    .filter((f) => /^final-.*\.mp4$/.test(f))
    .sort()
    .map((f) => path.join(taskDir, f));
} catch {
  files = [];
}
if (files.length === 0) {
  console.error(`ERRO: completou mas não achei final-*.mp4 em ${taskDir}`);
  process.exit(5);
}

if (a["out-dir"]) {
  const out = expand(a["out-dir"]);
  fs.mkdirSync(out, { recursive: true });
  files = files.map((f, i) => {
    const dest = path.join(out, `${taskId}-final-${i + 1}.mp4`);
    fs.copyFileSync(f, dest);
    return dest;
  });
}

console.log(JSON.stringify({ task_id: taskId, subject: a.subject, files }));
