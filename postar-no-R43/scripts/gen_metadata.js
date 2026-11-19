#!/usr/bin/env node
/**
 * Gera título, descrição e tags de um Short via LLM (API OpenAI-compatível).
 * Lê LLM_API_KEY, LLM_BASE_URL e LLM_MODEL do ambiente.
 *
 * Saída (stdout): JSON {title, description, tags:[...]}.
 * Ex.: node gen_metadata.js --subject "Por que o sangue do polvo é azul"
 */
import { parseArgs } from "node:util";
import { chamarLLM } from "./llm.js";

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
  const bruto = await chamarLLM(montarPrompt(a.subject, a.script), { temperature: 0.7 });
  console.log(JSON.stringify(montarMetadados(bruto, a.subject)));
}

if (process.argv[1] && process.argv[1].endsWith("gen_metadata.js")) {
  main().catch((e) => {
    console.error(`ERRO: ${e.message}`);
    process.exit(3);
  });
}
