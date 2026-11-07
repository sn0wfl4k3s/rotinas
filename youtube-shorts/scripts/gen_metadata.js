#!/usr/bin/env node
/**
 * Gera título, descrição e tags de um Short via LLM (API OpenAI-compatível).
 * Lê LLM_API_KEY, LLM_BASE_URL e LLM_MODEL do ambiente.
 *
 * Saída (stdout): JSON {title, description, tags:[...]}.
 * Ex.: node gen_metadata.js --subject "Por que o sangue do polvo é azul"
 */
import { parseArgs } from "node:util";

export function montarMetadados(bruto, subject) {
  const texto = String(bruto || "").replace(/^```(?:json)?/m, "").replace(/```$/m, "").trim();
  const meta = JSON.parse(texto);
  if (!String(meta.title || "").toLowerCase().includes("#shorts")) {
    meta.title = `${String(meta.title || subject).trimEnd()} #Shorts`.slice(0, 100);
  }
  return meta;
}

function montarPrompt(subject, script) {
  return `Você cria metadados para vídeos curtos (YouTube Shorts) em pt-BR.
Tema: ${subject}
Roteiro: ${script || "(não fornecido)"}

Responda APENAS com um JSON válido, sem markdown, no formato:
{"title": "...", "description": "...", "tags": ["...", "..."]}

Regras:
- title: curto e direto, no máximo 40 caracteres antes de #Shorts.
- description: 2 a 4 linhas, com o gancho do vídeo e 3 a 5 hashtags ao final.
- tags: 8 a 12 palavras-chave, sem #.`;
}

async function main() {
  const { values: a } = parseArgs({
    options: {
      subject: { type: "string" },
      script: { type: "string", default: "" },
    },
  });
  if (!a.subject) throw new Error("--subject é obrigatório");
  const key = process.env.LLM_API_KEY;
  if (!key) throw new Error("LLM_API_KEY não definida");
  const base = (process.env.LLM_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai").replace(/\/$/, "");

  const r = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: process.env.LLM_MODEL || "gemini-3.5-flash",
      messages: [{ role: "user", content: montarPrompt(a.subject, a.script) }],
      temperature: 0.7,
    }),
  });
  if (!r.ok) throw new Error(`LLM HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const dados = await r.json();
  console.log(JSON.stringify(montarMetadados(dados.choices[0].message.content, a.subject)));
}

if (process.argv[1] && process.argv[1].endsWith("gen_metadata.js")) {
  main().catch((e) => {
    console.error(`ERRO: ${e.message}`);
    process.exit(3);
  });
}
